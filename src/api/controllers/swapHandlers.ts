import { Request, Response } from 'express';
import { swapper } from '../../services';
import { SwapAmountType } from '@atomiqlabs/sdk-lib';
import {
  QuoteRequest,
  CommitTransactionRequest,
  SwapListQuery,
  SwapListResponse,
} from '../../types/api';

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

  if (!quoteRequest.amount || !quoteRequest.amountType) {
    res.status(400).json({
      error: 'ValidationError',
      message: 'amount and amountType are required',
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

  // TODO: Implement token resolution from SDK token registry
  // For now, this is a placeholder
  const srcToken = null as any;
  const dstToken = null as any;

  if (!srcToken) {
    throw new Error(`Source token not found: ${quoteRequest.srcToken.chain}:${quoteRequest.srcToken.symbol}`);
  }
  if (!dstToken) {
    throw new Error(`Destination token not found: ${quoteRequest.dstToken.chain}:${quoteRequest.dstToken.symbol}`);
  }

  // Determine amount type
  const amountType = quoteRequest.amountType === 'EXACT_IN'
    ? SwapAmountType.EXACT_IN
    : SwapAmountType.EXACT_OUT;

  // Create swap via SDK - SDK stores it automatically
  const swap = await swapper.swap(
    srcToken,
    dstToken,
    quoteRequest.amount,
    amountType,
    quoteRequest.srcAddress,
    quoteRequest.dstAddress
  );

  // Get unsigned commit transactions
  let commitTxs: any[] = [];
  if (typeof (swap as any).txsCommit === 'function') {
    commitTxs = await (swap as any).txsCommit();
  }

  // TODO: Extract real quote data from swap.serialize()
  // TODO: Get pricing from SDK
  const serialized = swap.serialize();

  res.status(201).json({
    swapId: swap.getId(),
    state: getStateText(swap.getState()),
    stateNumber: swap.getState(),
    quote: {
      // TODO: Extract actual data from swap object
      input: { token: {}, rawAmount: '0', amount: '0' },
      inputWithoutFee: { token: {}, rawAmount: '0', amount: '0' },
      output: { token: {}, rawAmount: '0', amount: '0' },
      fees: {
        amountInSrcToken: { token: {}, rawAmount: '0', amount: '0' },
        amountInDstToken: { token: {}, rawAmount: '0', amount: '0' },
      },
      feeBreakdown: [],
      priceInfo: {
        marketPrice: 0,
        swapPrice: 0,
        difference: '0',
      },
      quoteExpiry: serialized.expiry,
    },
    unsignedTxs: {
      commit: commitTxs,
    },
  });
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
    state: getStateText(state),
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
  const query: SwapListQuery = {
    address: req.query.address as string,
    state: req.query.state as string,
    chain: req.query.chain as string,
    type: req.query.type as string,
    limit: req.query.limit ? parseInt(req.query.limit as string, 10) : 20,
    offset: req.query.offset ? parseInt(req.query.offset as string, 10) : 0,
  };

  // TODO: Implement actual SDK query methods
  // The SDK should have methods to query swaps by address/state/chain
  const swaps: any[] = [];
  const total = 0;

  const response: SwapListResponse = {
    swaps,
    total,
    limit: query.limit!,
    offset: query.offset!,
  };

  res.json(response);
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

/**
 * Helper: Get state text from state number
 */
function getStateText(state: number): string {
  // TODO: Map state numbers to text using SDK enums
  return `STATE_${state}`;
}

/**
 * Helper: Get user-friendly state description
 */
function getStateDescription(state: number, swapType: any): string {
  // TODO: Provide user-friendly descriptions based on swap type and state
  return `Swap is in state ${state}`;
}
