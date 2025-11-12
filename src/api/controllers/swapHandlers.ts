import { Request, Response } from 'express';
import { swapper } from '../../services';
import {
  IEscrowSelfInitSwap,
  SwapAmountType,
  FeeType,
  SwapType
} from '@atomiqlabs/sdk-lib';
import {
  QuoteRequest,
} from '../../types/api';
import { tokenAmountToJSON } from '../../utils/sdkHelpers';
import { wrapTransactionsWithMetadata } from '../../utils/transactionHelpers';
import { getStateName } from '../../utils/stateHelpers';

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
    quoteRequest.srcToken,
    quoteRequest.dstToken,
    amountForSDK,
    amountType,
    quoteRequest.srcAddress,
    quoteRequest.dstAddress
  );

  const chain = swap.chainIdentifier;

  // Get unsigned commit transactions only for swap types that require them
  let unsignedTxs: ReturnType<typeof wrapTransactionsWithMetadata> = [];
  const swapType = swap.getType();
  const swapTypesWithCommit = [
    SwapType.TO_BTC,              // 2: SC -> BTC on-chain
    SwapType.TO_BTCLN,            // 3: SC -> BTC Lightning
    SwapType.FROM_BTC,            // 0: BTC -> SC
  ];
  


  if (swapTypesWithCommit.includes(swapType) && swap instanceof IEscrowSelfInitSwap) {
    const commitTxs = await swap.txsCommit();
    unsignedTxs = wrapTransactionsWithMetadata(commitTxs, 'commit', chain, swapType);
  }

  // Extract quote data directly from SDK objects
  const priceInfo = swap.getPriceInfo();

  // Extract percentage from PercentagePPM object (explicit BigInt handling)
  const priceDifference = priceInfo.difference.percentage;

  const response = {
    swapId: swap.getId(),
    state: getStateName(swap.getState(), swapType),
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
    unsignedTxs,
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
  const swapType = swap.getType();

  const canRefund = 'isRefundable' in swap && typeof swap.isRefundable === 'function'
    ? swap.isRefundable()
    : false;
  const canClaim = 'isClaimable' in swap && typeof swap.isClaimable === 'function'
    ? swap.isClaimable()
    : false;

  res.json({
    swapId: swap.getId(),
    state: getStateName(state, swapType),
    stateNumber: state,
    canRefund,
    canClaim,
    needsClientAction: canRefund || canClaim,
    swap: swap.serialize(),
  });
}

/**
 * GET /api/v1/swaps/:id/commit
 * Trigger SDK watchdog to detect on-chain commit
 *
 * Note: Client broadcasts transactions directly to blockchain first.
 * This endpoint triggers the SDK watchdog to poll and detect the commit.
 */
export async function submitCommitTransactions(req: Request, res: Response): Promise<void> {
  const { id } = req.params;

  const swap = await swapper.getSwapById(id);

  // Client has already broadcast transactions to the blockchain.
  // SDK watchdog will detect the on-chain commit automatically via polling.
  // We just wait for the SDK to detect it.

  try {
    if ('waitTillCommited' in swap && typeof (swap as any).waitTillCommited === 'function') {
      await (swap as any).waitTillCommited();
    }

    // Get updated state after commit
    const state = swap.getState();
    const swapType = swap.getType();

    res.json({
      success: true,
      message: 'Commit detected on-chain',
      swapId: id,
      state: getStateName(state, swapType),
      stateNumber: state,
    });
  } catch (error: any) {
    res.status(500).json({
      error: 'CommitError',
      message: error.message || 'Failed to detect commit on-chain',
    });
  }
}



