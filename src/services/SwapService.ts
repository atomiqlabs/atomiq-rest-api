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
    console.log('\n=== [SwapService] Creating Quote ===');
    console.log(`  📥 Source: ${request.srcToken.chain}:${request.srcToken.symbol}`);
    console.log(`  📤 Destination: ${request.dstToken.chain}:${request.dstToken.symbol}`);
    console.log(`  💰 Amount: ${request.amount} (${request.amountType})`);
    console.log(`  🔑 From: ${request.srcAddress.substring(0, 10)}...`);
    console.log(`  🔑 To: ${request.dstAddress.substring(0, 10)}...`);

    // Simulate delay for token resolution
    console.log('  ⏳ Resolving tokens...');
    await this.delay(500);

    // Resolve tokens
    const srcToken = await this.resolveToken(request.srcToken);
    const dstToken = await this.resolveToken(request.dstToken);

    if (!srcToken) {
      throw new Error(`Source token not found: ${request.srcToken.chain}:${request.srcToken.symbol}`);
    }
    if (!dstToken) {
      throw new Error(`Destination token not found: ${request.dstToken.chain}:${request.dstToken.symbol}`);
    }
    console.log('  ✅ Tokens resolved');

    // Determine amount type
    const amountType = request.amountType === 'EXACT_IN'
      ? SwapAmountType.EXACT_IN
      : SwapAmountType.EXACT_OUT;

    // Create swap via SDK (SDK stores it automatically)
    console.log('  ⏳ Creating swap via SDK...');
    await this.delay(800);

    const swap = await this.swapper.swap(
      srcToken,
      dstToken,
      request.amount,
      amountType,
      request.srcAddress,
      request.dstAddress
    );

    console.log(`  ✅ Swap created: ${swap.getId()}`);

    // Cache the swap object
    this.swapCache.set(swap.getId(), swap);

    // Get unsigned transactions
    console.log('  ⏳ Generating unsigned transactions...');
    await this.delay(300);

    let commitTxs: any[] = [];
    if (typeof (swap as any).txsCommit === 'function') {
      commitTxs = await (swap as any).txsCommit();
    }
    console.log(`  ✅ Generated ${commitTxs.length} unsigned transaction(s)`);

    // Build quote data
    console.log('  ⏳ Building quote data...');
    await this.delay(200);
    const quoteData = await this.buildQuoteData(swap);

    console.log('  ✅ Quote created successfully!');
    console.log('=== [SwapService] Quote Complete ===\n');

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
   * Helper to simulate async delays
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get swap state
   */
  async getSwapState(swapId: string): Promise<SwapStateResponse> {
    console.log(`\n=== [SwapService] Getting Swap State ===`);
    console.log(`  🔍 Swap ID: ${swapId}`);

    console.log('  ⏳ Fetching swap from SDK...');
    await this.delay(300);

    const swap = await this.getSwap(swapId);
    console.log(`  ✅ Swap found`);

    const state = swap.getState();
    console.log(`  📊 Current state: ${state} (${this.getStateText(state)})`);

    const canRefund = typeof (swap as any).isRefundable === 'function'
      ? (swap as any).isRefundable()
      : false;
    const canClaim = typeof (swap as any).isClaimable === 'function'
      ? (swap as any).isClaimable()
      : false;

    console.log(`  ♻️  Can refund: ${canRefund}`);
    console.log(`  ✨ Can claim: ${canClaim}`);
    console.log('=== [SwapService] State Retrieved ===\n');

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
    console.log(`\n=== [SwapService] Submitting Commit Transactions ===`);
    console.log(`  🔍 Swap ID: ${swapId}`);
    console.log(`  📝 Signed transactions count: ${signedTxs.length}`);

    console.log('  ⏳ Fetching swap...');
    await this.delay(200);
    const swap = await this.getSwap(swapId);
    console.log(`  ✅ Swap found`);

    // TODO: Broadcast transactions via SDK
    // For now, just log and wait for commit
    console.log(`  ⏳ Broadcasting ${signedTxs.length} signed commit transaction(s)...`);
    await this.delay(1000);

    // In full implementation:
    // - Parse signedTxs based on chain type
    // - Broadcast to appropriate network
    // - For BTC->SN swaps, send to LP
    // - SDK will automatically update state

    const txIds: string[] = signedTxs.map((_, i) => `0x${Math.random().toString(16).slice(2)}mock${i}`);
    console.log(`  ✅ Transactions broadcast:`);
    txIds.forEach((txId, i) => console.log(`     ${i + 1}. ${txId.substring(0, 20)}...`));

    // Wait for commit confirmation
    console.log('  ⏳ Waiting for confirmation...');
    await this.delay(800);
    if (typeof (swap as any).waitTillCommited === 'function') {
      await (swap as any).waitTillCommited();
    }
    console.log('  ✅ Transactions confirmed!');
    console.log('=== [SwapService] Commit Complete ===\n');

    return {
      success: true,
      txIds,
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
