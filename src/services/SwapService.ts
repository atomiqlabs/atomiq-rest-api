import { ISwap, Swapper, SwapType, Token, SwapAmountType } from '@atomiqlabs/sdk-lib';
import {
  QuoteRequest,
  QuoteResponse,
  SwapStateResponse,
  SwapQuoteData,
  TokenAmountData,
  SerializedSwap,
  FeeData,
} from '../types/api';

/**
 * Service layer for managing swaps
 * Stateless wrapper around Atomiq SDK - all persistence handled by SDK
 */
export class SwapService {
  private swapper: Swapper<any>;
  private swapCache: Map<string, ISwap> = new Map();

  constructor(swapper: Swapper<any>) {
    this.swapper = swapper;

    // Listen to swap state changes from SDK for cache updates
    this.swapper.on('swapState', (swap: ISwap) => {
      console.log(`[SwapService] Swap ${swap.getId()} state changed to ${swap.getState()}`);
      // Update cache
      this.swapCache.set(swap.getId(), swap);
    });
  }

  /**
   * Create a new swap quote
   * SDK handles storage automatically
   */
  async createQuote(request: QuoteRequest): Promise<QuoteResponse> {
    // Resolve tokens
    const srcToken = await this.resolveToken(request.srcToken);
    const dstToken = await this.resolveToken(request.dstToken);

    if (!srcToken) {
      throw new Error(`Source token not found: ${request.srcToken.chain}:${request.srcToken.symbol}`);
    }
    if (!dstToken) {
      throw new Error(`Destination token not found: ${request.dstToken.chain}:${request.dstToken.symbol}`);
    }

    // Determine amount type
    const amountType = request.amountType === 'EXACT_IN'
      ? SwapAmountType.EXACT_IN
      : SwapAmountType.EXACT_OUT;

    // Create swap via SDK (SDK stores it automatically)
    const swap = await this.swapper.swap(
      srcToken,
      dstToken,
      request.amount,
      amountType,
      request.srcAddress,
      request.dstAddress
    );

    // Cache the swap object
    this.swapCache.set(swap.getId(), swap);

    // Get unsigned transactions
    let commitTxs: any[] = [];
    if (typeof (swap as any).txsCommit === 'function') {
      commitTxs = await (swap as any).txsCommit();
    }

    // Build quote data
    const quoteData = await this.buildQuoteData(swap);

    return {
      swapId: swap.getId(),
      state: this.getStateText(swap.getState()),
      stateNumber: swap.getState(),
      quote: quoteData,
      unsignedTxs: {
        commit: commitTxs,
      },
    };
  }

  /**
   * Get swap state
   */
  async getSwapState(swapId: string): Promise<SwapStateResponse> {
    const swap = await this.getSwap(swapId);

    const state = swap.getState();
    const canRefund = typeof (swap as any).isRefundable === 'function'
      ? (swap as any).isRefundable()
      : false;
    const canClaim = typeof (swap as any).isClaimable === 'function'
      ? (swap as any).isClaimable()
      : false;

    return {
      swapId: swap.getId(),
      state: this.getStateText(state),
      stateNumber: state,
      stateText: this.getStateDescription(state, swap.getType()),
      canRefund,
      canClaim,
      needsClientAction: canRefund || canClaim,
      swap: swap.serialize(),
    };
  }

  /**
   * Submit signed commit transactions
   * Broadcasts immediately to network/LP - no storage needed
   */
  async submitCommitTransactions(swapId: string, signedTxs: string[]): Promise<{ success: boolean; txIds: string[] }> {
    const swap = await this.getSwap(swapId);

    // TODO: Broadcast transactions via SDK
    // For now, just log and wait for commit
    console.log(`[SwapService] Received signed commit txs for swap ${swapId}:`, signedTxs);

    // In full implementation:
    // - Parse signedTxs based on chain type
    // - Broadcast to appropriate network
    // - For BTC->SN swaps, send to LP
    // - SDK will automatically update state

    // Wait for commit confirmation
    if (typeof (swap as any).waitTillCommited === 'function') {
      await (swap as any).waitTillCommited();
    }

    return {
      success: true,
      txIds: signedTxs,
    };
  }

  /**
   * Get unsigned commit transactions
   */
  async getCommitTransactions(swapId: string): Promise<any[]> {
    const swap = await this.getSwap(swapId);
    if (typeof (swap as any).txsCommit === 'function') {
      return await (swap as any).txsCommit();
    }
    return [];
  }

  /**
   * Get unsigned refund transactions
   */
  async getRefundTransactions(swapId: string, signerAddress?: string): Promise<any[]> {
    const swap = await this.getSwap(swapId);

    if (typeof (swap as any).txsRefund !== 'function') {
      throw new Error('This swap type does not support refunds');
    }

    return await (swap as any).txsRefund(signerAddress);
  }

  /**
   * Submit signed refund transactions
   * Broadcasts immediately - no storage needed
   */
  async submitRefundTransactions(swapId: string, signedTxs: string[]): Promise<{ success: boolean; txIds: string[] }> {
    const swap = await this.getSwap(swapId);

    // TODO: Broadcast refund transactions
    console.log(`[SwapService] Received signed refund txs for swap ${swapId}:`, signedTxs);

    // Wait for refund confirmation
    if (typeof (swap as any).waitTillRefunded === 'function') {
      await (swap as any).waitTillRefunded();
    }

    return {
      success: true,
      txIds: signedTxs,
    };
  }

  /**
   * Query swaps for a specific address
   * Uses SDK's storage queries
   */
  async querySwaps(queryFilters: { initiator?: string; state?: number; chain?: string; limit?: number; offset?: number }): Promise<SerializedSwap[]> {
    // TODO: Use SDK's query methods
    // Adam mentioned there's a function to get swaps for a specific address
    // Need to find the correct SDK method

    // For now, if we have an address, try to get swaps for that address
    if (queryFilters.initiator) {
      // Placeholder - need to implement actual SDK query
      throw new Error('Query by address not yet implemented - need SDK method');
    }

    return [];
  }

  /**
   * Get swap count
   */
  async getSwapCount(queryFilters?: { initiator?: string; state?: number }): Promise<number> {
    // TODO: Implement using SDK methods if available
    console.log('[SwapService] Getting swap count with filters:', queryFilters);
    return 0;
  }

  /**
   * Helper: Get swap from cache or SDK
   */
  private async getSwap(swapId: string): Promise<ISwap> {
    // Try cache first
    if (this.swapCache.has(swapId)) {
      return this.swapCache.get(swapId)!;
    }

    // Get from SDK's storage
    try {
      const swap = await this.swapper.getSwapById(swapId);
      this.swapCache.set(swapId, swap);
      return swap;
    } catch (error) {
      throw new Error(`Swap not found: ${swapId}`);
    }
  }

  /**
   * Helper: Resolve token from identifier
   */
  private async resolveToken(tokenId: { chain: string; symbol: string; address?: string }): Promise<Token | null> {
    // TODO: Implement proper token resolution
    // Options:
    // 1. Query SDK's token registry
    // 2. Use static token configuration
    // 3. Build token object directly if we have all info
    console.log('[SwapService] Resolving token:', tokenId);
    return null as any;
  }

  /**
   * Helper: Build quote data from swap
   */
  private async buildQuoteData(swap: ISwap): Promise<SwapQuoteData> {
    // TODO: Extract actual data from swap object
    // The swap object contains all this data, need to access it properly

    const serialized = swap.serialize();

    return {
      input: this.mockTokenAmount(),
      inputWithoutFee: this.mockTokenAmount(),
      output: this.mockTokenAmount(),
      fees: this.mockFee(),
      feeBreakdown: [],
      priceInfo: {
        marketPrice: 0,
        swapPrice: 0,
        difference: '0',
      },
      quoteExpiry: serialized.expiry,
    };
  }

  /**
   * Helper: Get state text
   */
  private getStateText(state: number): string {
    // TODO: Map state numbers to text using SDK enums
    return `STATE_${state}`;
  }

  /**
   * Helper: Get state description
   */
  private getStateDescription(state: number, swapType: SwapType): string {
    // TODO: Provide user-friendly descriptions based on swap type and state
    console.log('[SwapService] Getting description for state:', state, 'type:', swapType);
    return `Swap is in state ${state}`;
  }

  /**
   * Mock helpers (TODO: remove when implementing real data extraction)
   */
  private mockTokenAmount(): TokenAmountData {
    return {
      token: {
        chain: 'unknown',
        symbol: 'UNKNOWN',
        decimals: 18,
      },
      rawAmount: '0',
      amount: '0',
    };
  }

  private mockFee(): FeeData {
    return {
      amountInSrcToken: this.mockTokenAmount(),
      amountInDstToken: this.mockTokenAmount(),
    };
  }
}
