import { Request, Response } from 'express';
import { swapper } from '../../services';
import { SwapAmountType, FeeType } from '@atomiqlabs/sdk-lib';
import {
  QuoteRequest,
  CommitTransactionRequest,
  SwapListResponse,
} from '../../types/api';
import { tokenAmountToJSON } from '../../utils/sdkHelpers';
import { getStateText, getStateDescription } from '../../utils/swapStates';

/**
 * POST /api/v1/quotes
 * Create a new swap quote
 */
export async function createQuote(req: Request, res: Response): Promise<void> {
  const quoteRequest: QuoteRequest = req.body;

  // Basic validation
  if (!quoteRequest.srcToken || !quoteRequest.dstToken) {
    res.status(400).json({
      error: 'ValidationError',
      message: 'srcToken and dstToken are required',
    });
    return;
  }

  // Validate amount fields - exactly one must be provided
  if (quoteRequest.amount && quoteRequest.rawAmount) {
    res.status(400).json({
      error: 'ValidationError',
      message: 'Cannot specify both amount and rawAmount - provide exactly one',
    });
    return;
  }

  if (!quoteRequest.amount && !quoteRequest.rawAmount) {
    res.status(400).json({
      error: 'ValidationError',
      message: 'Must specify either amount (decimal) or rawAmount (base units)',
    });
    return;
  }

  if (!quoteRequest.amountType) {
    res.status(400).json({
      error: 'ValidationError',
      message: 'amountType is required',
    });
    return;
  }

  if (!quoteRequest.srcAddress || !quoteRequest.dstAddress) {
    res.status(400).json({
      error: 'ValidationError',
      message: 'srcAddress and dstAddress are required',
    });
    return;
  }

  // Resolve tokens using SDK
  let srcToken: any;
  let dstToken: any;

  try {
    // Try chain-qualified ticker first (e.g., "STARKNET-ETH")
    if (quoteRequest.srcToken.chain && quoteRequest.srcToken.symbol) {
      const chainQualified = `${quoteRequest.srcToken.chain.toUpperCase()}-${quoteRequest.srcToken.symbol.toUpperCase()}`;
      srcToken = swapper.getToken(chainQualified);
    } else if (quoteRequest.srcToken.address) {
      // Try by contract address
      srcToken = swapper.getToken(quoteRequest.srcToken.address);
    } else {
      // Try by simple ticker
      srcToken = swapper.getToken(quoteRequest.srcToken.symbol.toUpperCase());
    }
  } catch (error: any) {
    throw new Error(`Source token not found: ${JSON.stringify(quoteRequest.srcToken)}. ${error.message}`);
  }

  try {
    if (quoteRequest.dstToken.chain && quoteRequest.dstToken.symbol) {
      const chainQualified = `${quoteRequest.dstToken.chain.toUpperCase()}-${quoteRequest.dstToken.symbol.toUpperCase()}`;
      dstToken = swapper.getToken(chainQualified);
    } else if (quoteRequest.dstToken.address) {
      dstToken = swapper.getToken(quoteRequest.dstToken.address);
    } else {
      dstToken = swapper.getToken(quoteRequest.dstToken.symbol.toUpperCase());
    }
  } catch (error: any) {
    throw new Error(`Destination token not found: ${JSON.stringify(quoteRequest.dstToken)}. ${error.message}`);
  }

  // Determine amount type
  const amountType = quoteRequest.amountType === 'EXACT_IN'
    ? SwapAmountType.EXACT_IN
    : SwapAmountType.EXACT_OUT;

  // Convert amount based on format
  // - If rawAmount provided: convert string to BigInt
  // - If amount provided: pass decimal string as-is
  const amountForSDK: string | bigint = quoteRequest.rawAmount
    ? BigInt(quoteRequest.rawAmount)
    : quoteRequest.amount!;

  // Create swap via SDK - SDK stores it automatically
  const swap = await swapper.swap(
    srcToken,
    dstToken,
    amountForSDK,
    amountType,
    quoteRequest.srcAddress,
    quoteRequest.dstAddress
  );

  // Get unsigned commit transactions
  let commitTxs: any[] = [];
  if (typeof (swap as any).txsCommit === 'function') {
    commitTxs = await (swap as any).txsCommit();
  }

  // Extract quote data directly from SDK objects
  const priceInfo = swap.getPriceInfo();

  // Extract percentage from PercentagePPM object (explicit BigInt handling)
  const priceDifference = priceInfo.difference.percentage;

  const response = {
    swapId: swap.getId(),
    state: getStateText(swap.getState(), swap.getType()),
    stateNumber: swap.getState(),
    quote: {
      input: tokenAmountToJSON(swap.getInput()),
      inputWithoutFee: tokenAmountToJSON(swap.getInputWithoutFee()),
      output: tokenAmountToJSON(swap.getOutput()),
      fees: {
        amountInSrcToken: tokenAmountToJSON(swap.getFee().amountInSrcToken),
        amountInDstToken: tokenAmountToJSON(swap.getFee().amountInDstToken),
      },
      feeBreakdown: swap.getFeeBreakdown().map((item: any) => ({
        type: FeeType[item.type],
        fee: {
          amountInSrcToken: tokenAmountToJSON(item.fee.amountInSrcToken),
          amountInDstToken: tokenAmountToJSON(item.fee.amountInDstToken),
        },
      })),
      priceInfo: {
        marketPrice: priceInfo.marketPrice,
        swapPrice: priceInfo.swapPrice,
        difference: priceDifference,
      },
      quoteExpiry: swap.getQuoteExpiry(),
    },
    unsignedTxs: {
      commit: commitTxs.map(tx =>
        JSON.parse(JSON.stringify(tx, (_, v) =>
          typeof v === 'bigint' ? v.toString() : v
        ))
      ),
    },
  };

  // All BigInts have been explicitly converted to strings
  res.status(201).json(response);
}

/**
 * GET /api/v1/swaps/:id
 * Get swap state
 */
export async function getSwapState(req: Request, res: Response): Promise<void> {
  const { id } = req.params;

  const swap = await swapper.getSwapById(id);
  const state = swap.getState();

  const canRefund = typeof (swap as any).isRefundable === 'function'
    ? (swap as any).isRefundable()
    : false;
  const canClaim = typeof (swap as any).isClaimable === 'function'
    ? (swap as any).isClaimable()
    : false;

  res.json({
    swapId: swap.getId(),
    state: getStateText(state, swap.getType()),
    stateNumber: state,
    stateText: getStateDescription(state, swap.getType()),
    canRefund,
    canClaim,
    needsClientAction: canRefund || canClaim,
    swap: swap.serialize(),
  });
}

/**
 * GET /api/v1/swaps
 * List swaps with filters
 */
export async function listSwaps(req: Request, res: Response): Promise<void> {
  const { address, chain, type } = req.query;

  if (!address || !chain) {
    res.status(400).json({
      error: 'ValidationError',
      message: 'address and chain query parameters are required',
    });
    return;
  }

  try {
    let allSwaps: any[] = [];

    // Query based on type filter
    if (!type || type === 'refundable') {
      const refundable = await swapper.getRefundableSwaps(
        chain as any,
        address as string
      );
      allSwaps.push(...refundable.map(s => ({ ...s.serialize(), actionType: 'refundable' })));
    }

    if (!type || type === 'claimable') {
      const claimable = await swapper.getClaimableSwaps(
        chain as any,
        address as string
      );
      allSwaps.push(...claimable.map(s => ({ ...s.serialize(), actionType: 'claimable' })));
    }

    const response: SwapListResponse = {
      swaps: allSwaps,
      total: allSwaps.length,
      limit: allSwaps.length,
      offset: 0,
    };

    res.json(response);
  } catch (error: any) {
    res.status(500).json({
      error: 'SwapQueryError',
      message: error.message,
    });
  }
}

/**
 * GET /api/v1/swaps/:id/txs/commit
 * Get unsigned commit transactions
 */
export async function getCommitTransactions(req: Request, res: Response): Promise<void> {
  const { id } = req.params;

  const swap = await swapper.getSwapById(id);

  let txs: any[] = [];
  if (typeof (swap as any).txsCommit === 'function') {
    txs = await (swap as any).txsCommit();
  }

  res.json({ swapId: id, transactions: txs });
}

/**
 * POST /api/v1/swaps/:id/commit
 * Submit signed commit transactions
 */
export async function submitCommitTransactions(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  const body: CommitTransactionRequest = req.body;

  if (!body.signedTxs || !Array.isArray(body.signedTxs)) {
    res.status(400).json({
      error: 'ValidationError',
      message: 'signedTxs array is required',
    });
    return;
  }

  const swap = await swapper.getSwapById(id);

  // TODO: Implement actual transaction broadcast
  // - Parse signedTxs based on chain type
  // - Broadcast to appropriate network
  // - For BTC->SN swaps, send to LP
  // - SDK will automatically update state

  // Wait for commit confirmation
  if (typeof (swap as any).waitTillCommited === 'function') {
    await (swap as any).waitTillCommited();
  }

  res.json({
    success: true,
    txIds: body.signedTxs.map((_, i) => `0x${Math.random().toString(16).slice(2)}mock${i}`),
  });
}

/**
 * GET /api/v1/swaps/:id/txs/refund
 * Get unsigned refund transactions
 */
export async function getRefundTransactions(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  const signerAddress = req.query.signer as string | undefined;

  const swap = await swapper.getSwapById(id);

  if (typeof (swap as any).txsRefund !== 'function') {
    throw new Error('This swap type does not support refunds');
  }

  const txs = await (swap as any).txsRefund(signerAddress);
  res.json({ swapId: id, transactions: txs });
}

/**
 * POST /api/v1/swaps/:id/refund
 * Submit signed refund transactions
 */
export async function submitRefundTransactions(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  const body: CommitTransactionRequest = req.body;

  if (!body.signedTxs || !Array.isArray(body.signedTxs)) {
    res.status(400).json({
      error: 'ValidationError',
      message: 'signedTxs array is required',
    });
    return;
  }

  const swap = await swapper.getSwapById(id);

  // TODO: Implement actual refund transaction broadcast

  // Wait for refund confirmation
  if (typeof (swap as any).waitTillRefunded === 'function') {
    await (swap as any).waitTillRefunded();
  }

  res.json({
    success: true,
    txIds: body.signedTxs,
  });
}

