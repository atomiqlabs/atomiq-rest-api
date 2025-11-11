import { Request, Response } from 'express';
import { swapper } from '../../services';
import { SwapAmountType, FeeType, SwapType, IEscrowSelfInitSwap } from '@atomiqlabs/sdk-lib';
import {
  QuoteRequest,
  CommitTransactionRequest,
  SwapListResponse,
} from '../../types/api';
import { tokenAmountToJSON } from '../../utils/sdkHelpers';
import {
  getStateText,
  getStateDescription
} from '../../utils/swapStates';
import { wrapTransactionsWithMetadata } from '../../utils/transactionHelpers';

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
  console.log('[swapHandlers] chain:', chain);
  
  // Get unsigned commit transactions only for swap types that require them
  let unsignedTxs: any[] = [];
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

// /**
//  * GET /api/v1/swaps
//  * List swaps with filters
//  */
// export async function listSwaps(req: Request, res: Response): Promise<void> {
//   const { address, chain, type } = req.query;

//   if (!address || !chain) {
//     res.status(400).json({
//       error: 'ValidationError',
//       message: 'address and chain query parameters are required',
//     });
//     return;
//   }

//   try {
//     let allSwaps: any[] = [];

//     // Query based on type filter
//     if (!type || type === 'refundable') {
//       const refundable = await swapper.getRefundableSwaps(
//         chain as any,
//         address as string
//       );
//       allSwaps.push(...refundable.map(s => ({ ...s.serialize(), actionType: 'refundable' })));
//     }

//     if (!type || type === 'claimable') {
//       const claimable = await swapper.getClaimableSwaps(
//         chain as any,
//         address as string
//       );
//       allSwaps.push(...claimable.map(s => ({ ...s.serialize(), actionType: 'claimable' })));
//     }

//     const response: SwapListResponse = {
//       swaps: allSwaps,
//       total: allSwaps.length,
//       limit: allSwaps.length,
//       offset: 0,
//     };

//     res.json(response);
//   } catch (error: any) {
//     res.status(500).json({
//       error: 'SwapQueryError',
//       message: error.message,
//     });
//   }
// }

// /**
//  * GET /api/v1/swaps/:id/txs/commit
//  * Get unsigned commit transactions
//  */
// export async function getCommitTransactions(req: Request, res: Response): Promise<void> {
//   const { id } = req.params;

//   const swap = await swapper.getSwapById(id);

//   let transactions: any[] = [];
//   if (typeof (swap as any).txsCommit === 'function') {
//     const txs = await (swap as any).txsCommit();
//     transactions = wrapTransactionsWithMetadata(txs, 'commit', swap);
//   }

//   res.json({ swapId: id, transactions });
// }

/**
 * POST /api/v1/swaps/:id/commit
 * Submit signed commit transactions
 *
 * Note: Client broadcasts transactions directly to blockchain.
 * This endpoint triggers the SDK watchdog to detect on-chain commit.
 */
export async function submitCommitTransactions(req: Request, res: Response): Promise<void> {
  const { id } = req.params;

  const swap = await swapper.getSwapById(id);

  // Client has already broadcast transactions to the blockchain.
  // SDK watchdog will detect the on-chain commit automatically via polling.
  // We just wait for the SDK to detect it.

  try {
    if (typeof (swap as any).waitTillCommited === 'function') {
      await (swap as any).waitTillCommited();
    }

    res.json({
      success: true,
      message: 'Commit detected on-chain',
      txIds: (swap as any).getTxIds() || [],
      state: 'COMMITED',
    });
  } catch (error: any) {
    res.status(500).json({
      error: 'CommitError',
      message: error.message || 'Failed to detect commit on-chain',
    });
  }
}

// /**
//  * GET /api/v1/swaps/:id/txs/refund
//  * Get unsigned refund transactions
//  */
// export async function getRefundTransactions(req: Request, res: Response): Promise<void> {
//   const { id } = req.params;
//   const signerAddress = req.query.signer as string | undefined;

//   const swap = await swapper.getSwapById(id);

//   if (typeof (swap as any).txsRefund !== 'function') {
//     throw new Error('This swap type does not support refunds');
//   }

//   const txs = await (swap as any).txsRefund(signerAddress);
//   const transactions = wrapTransactionsWithMetadata(txs, 'refund', swap);
//   res.json({ swapId: id, transactions });
// }

// /**
//  * POST /api/v1/swaps/:id/refund
//  * Submit signed refund transactions
//  */
// export async function submitRefundTransactions(req: Request, res: Response): Promise<void> {
//   const { id } = req.params;
//   const body: CommitTransactionRequest = req.body;

//   if (!body.signedTxs || !Array.isArray(body.signedTxs)) {
//     res.status(400).json({
//       error: 'ValidationError',
//       message: 'signedTxs array is required',
//     });
//     return;
//   }

//   const swap = await swapper.getSwapById(id);

//   // TODO: Implement actual refund transaction broadcast

//   // Wait for refund confirmation
//   if (typeof (swap as any).waitTillRefunded === 'function') {
//     await (swap as any).waitTillRefunded();
//   }

//   res.json({
//     success: true,
//     txIds: body.signedTxs,
//   });
// }

/**
 * GET /api/v1/swaps/:id/txs/claim
 * Get unsigned claim transactions
 */
// export async function getClaimTransactions(req: Request, res: Response): Promise<void> {
//   const { id } = req.params;
//   const signerAddress = req.query.signer as string | undefined;

//   const swap = await swapper.getSwapById(id);

//   let transactions: any[] = [];
//   let transactionName: 'claim' | 'claim_with_secret' = 'claim';

//   // Check for different claim methods
//   if (typeof (swap as any).txsClaim === 'function') {
//     const txs = await (swap as any).txsClaim(signerAddress);

//     // Determine if this is a claim with secret (Lightning) or proof (on-chain)
//     // COMMENTED: Focus on TO_BTC only - no Lightning claims needed
//     // const swapType = swap.getType();
//     // if (swapType === SwapType.FROM_BTCLN || swapType === SwapType.FROM_BTCLN_AUTO) {
//     //   transactionName = 'claim_with_secret';
//     // }

//     transactions = wrapTransactionsWithMetadata(txs, transactionName, swap);
//   // COMMENTED: Focus on TO_BTC only - no Lightning secret claims
//   // } else if (typeof (swap as any).txsClaimWithSecret === 'function') {
//   //   // Explicit claim with secret method
//   //   const txs = await (swap as any).txsClaimWithSecret(signerAddress);
//   //   transactions = wrapTransactionsWithMetadata(txs, 'claim_with_secret', swap);
//   } else if (typeof (swap as any).txsClaimWithTxData === 'function') {
//     // Claim with transaction data (requires tx data parameter)
//     res.status(400).json({
//       error: 'ValidationError',
//       message: 'This swap requires transaction data for claiming. Use txsClaimWithTxData method.',
//     });
//     return;
//   } else {
//     res.status(400).json({
//       error: 'SwapError',
//       message: 'This swap type does not support claim transactions',
//     });
//     return;
//   }

//   res.json({ swapId: id, transactions });
// }

