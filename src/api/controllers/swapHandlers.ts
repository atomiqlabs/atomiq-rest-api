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
import { starknetRpc } from '../../services/SdkService';

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

  // Detect Lightning Network swaps (amount determined by invoice)
  const isLightningSwap =
    quoteRequest.dstToken === 'BTC-LN' ||
    quoteRequest.dstToken === 'BTCLN';
  const isExactOut = quoteRequest.amountType === 'EXACT_OUT';

  // Validate amount fields
  if (quoteRequest.amount && quoteRequest.rawAmount) {
    res.status(400).json({
      error: 'ValidationError',
      message: 'Cannot specify both amount and rawAmount - provide exactly one',
    });
    return;
  }

  // For Lightning swaps with EXACT_OUT, amount is optional (determined by invoice)
  // For all other swaps, amount is required
  if (!isLightningSwap || !isExactOut) {
    if (!quoteRequest.amount && !quoteRequest.rawAmount) {
      res.status(400).json({
        error: 'ValidationError',
        message: 'Must specify either amount (decimal) or rawAmount (base units)',
      });
      return;
    }
  }
  

  // Determine amount type
  const amountType = quoteRequest.amountType === 'EXACT_IN'
    ? SwapAmountType.EXACT_IN
    : SwapAmountType.EXACT_OUT;

  // Convert amount based on format
  // - If rawAmount provided: convert string to BigInt
  // - If amount provided: pass decimal string as-is
  // - If neither provided (Lightning invoice): pass null (cast as any for SDK compatibility)
  const amountForSDK: string | bigint | null = quoteRequest.rawAmount
    ? BigInt(quoteRequest.rawAmount)
    : quoteRequest.amount
    ? quoteRequest.amount
    : null;

  // Create swap via SDK - SDK stores it automatically
  const swap = await swapper.swap(
    quoteRequest.srcToken,
    quoteRequest.dstToken,
    amountForSDK as any,  // Cast to any for Lightning invoice swaps (SDK accepts null at runtime)
    amountType,
    quoteRequest.srcAddress,
    quoteRequest.dstAddress
  );

  const chain = swap.chainIdentifier;

  // TODO: separate this part into a separate function, make it more general to handle all types of swaps, 
  // return an array of unsigned transactions with metadata accordingly
  // Get unsigned commit transactions only for swap types that require them
  let unsignedTxs = [];
  const swapType = swap.getType();
  const swapTypesWithCommit = [
    SwapType.TO_BTC,              // 2: SC -> BTC on-chain
    SwapType.TO_BTCLN,            // 3: SC -> BTC Lightning
    SwapType.FROM_BTC,            // 0: BTC -> SC
  ];
  
  if (swapTypesWithCommit.includes(swapType) && swap instanceof IEscrowSelfInitSwap) {
    const commitTxs = await swap.txsCommit();
    unsignedTxs.push(wrapTransactionsWithMetadata(commitTxs, swap.getId(), 'commit', chain, swapType));
  }
  // TODO until here
  
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
  await swap._sync(true);
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
    canRefund,
    canClaim,
    swap: swap.serialize(),
  });
}


/**
 * POST /api/v1/swaps/:id/commit
 * Submit signed transactions to the blockchain
 */
export async function submitCommitTransactions(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  const commitRequest = req.body;

  // Validate request body
  if (!commitRequest.signedTxs || !Array.isArray(commitRequest.signedTxs)) {
    res.status(400).json({
      error: 'ValidationError',
      message: 'signedTxs array is required in request body',
    });
    return;
  }

  if (commitRequest.signedTxs.length === 0) {
    res.status(400).json({
      error: 'ValidationError',
      message: 'At least one signed transaction is required',
    });
    return;
  }
  


  try {
    const swap = await swapper.getSwapById(id);
    
    // TODO validate that the swap is in the correct state for commit, use swap.canCommit() function
    // if (!swap.isCommitable()) {
    //   res.status(400).json({
    //     error: 'ValidationError',
    //     message: 'Swap is not in the correct state for commit',
    //   });
    //   return;
    // }
    
    const txHashes: string[] = [];

    // Process each signed transaction
    for (const data of commitRequest.signedTxs) {
      
      console.log(data)
      
      if (swap.chainIdentifier === 'STARKNET') {
        // Convert string values back to BigInt for Starknet library
        if (data.details && data.details.resourceBounds) {
          const rb = data.details.resourceBounds;
          if (rb.l1_gas) {
            rb.l1_gas.max_amount = BigInt(rb.l1_gas.max_amount);
            rb.l1_gas.max_price_per_unit = BigInt(rb.l1_gas.max_price_per_unit);
          }
          if (rb.l2_gas) {
            rb.l2_gas.max_amount = BigInt(rb.l2_gas.max_amount);
            rb.l2_gas.max_price_per_unit = BigInt(rb.l2_gas.max_price_per_unit);
          }
          if (rb.l1_data_gas) {
            rb.l1_data_gas.max_amount = BigInt(rb.l1_data_gas.max_amount);
            rb.l1_data_gas.max_price_per_unit = BigInt(rb.l1_data_gas.max_price_per_unit);
          }
        }

        // Broadcast transaction based on type
        let txHash: string;
        const result: any = await starknetRpc.invokeFunction(data.signed, data.details);
        txHash = result.transaction_hash;

        txHashes.push(txHash);
      } else if (swap.chainIdentifier === 'SOLANA') {
        // TODO: Implement Solana transaction broadcasting when Solana support is added
        throw new Error('Solana transaction broadcasting not yet implemented');
      } else {
        throw new Error(`Unsupported chain: ${swap.chainIdentifier}`);
      }
    }
    
    res.json({
      success: true,
      message: 'Transactions broadcast successfully',
      txHashes,
    });
  } catch (error: any) {
    res.status(500).json({
      error: 'BroadcastError',
      message: error.message || 'Failed to broadcast transactions',
    });
  }

}

/**
 * GET /api/v1/swaps/:id/txs/refund
 * Get unsigned refund transactions for a swap
 */
export async function getRefundTransactions(req: Request, res: Response): Promise<void> {
  const { id } = req.params;

  try {
    const swap = await swapper.getSwapById(id);

    // Sync swap state with blockchain
    await swap._sync(true);

    const swapType = swap.getType();

    // Check if swap is refundable
    const canRefund = 'isRefundable' in swap && typeof swap.isRefundable === 'function'
      ? swap.isRefundable()
      : false;

    if (!canRefund) {
      res.status(400).json({
        error: 'NotRefundable',
        message: 'Swap is not in a refundable state',
        currentState: getStateName(swap.getState(), swapType),
      });
      return;
    }

    // Check if swap has txsRefund method
    if (!('txsRefund' in swap) || typeof (swap as any).txsRefund !== 'function') {
      res.status(400).json({
        error: 'NotSupported',
        message: 'This swap type does not support refund transactions',
      });
      return;
    }

    // Get unsigned refund transactions from SDK
    const refundTxs = await (swap as any).txsRefund();
    const chain = swap.chainIdentifier;

    // Wrap transactions with metadata
    const action = wrapTransactionsWithMetadata(refundTxs, swap.getId(), 'refund', chain, swapType);

    res.json({
      swapId: swap.getId(),
      state: getStateName(swap.getState(), swapType),
      action,
    });
  } catch (error: any) {
    res.status(500).json({
      error: 'RefundError',
      message: error.message || 'Failed to get refund transactions',
    });
  }
}

/**
 * POST /api/v1/swaps/:id/refund
 * Submit signed refund transactions to the blockchain
 */
export async function submitRefundTransactions(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  const refundRequest = req.body;

  // Validate request body
  if (!refundRequest.signedTxs || !Array.isArray(refundRequest.signedTxs)) {
    res.status(400).json({
      error: 'ValidationError',
      message: 'signedTxs array is required in request body',
    });
    return;
  }

  if (refundRequest.signedTxs.length === 0) {
    res.status(400).json({
      error: 'ValidationError',
      message: 'At least one signed transaction is required',
    });
    return;
  }

  try {
    const swap = await swapper.getSwapById(id);

    // Sync swap state
    await swap._sync(true);

    // Check if swap is refundable
    const canRefund = 'isRefundable' in swap && typeof swap.isRefundable === 'function'
      ? swap.isRefundable()
      : false;

    if (!canRefund) {
      res.status(400).json({
        error: 'NotRefundable',
        message: 'Swap is not in a refundable state',
      });
      return;
    }

    const txHashes: string[] = [];

    // Process each signed transaction
    for (const data of refundRequest.signedTxs) {

      console.log(data);

      if (swap.chainIdentifier === 'STARKNET') {
        // Convert string values back to BigInt for Starknet library
        if (data.details && data.details.resourceBounds) {
          const rb = data.details.resourceBounds;
          if (rb.l1_gas) {
            rb.l1_gas.max_amount = BigInt(rb.l1_gas.max_amount);
            rb.l1_gas.max_price_per_unit = BigInt(rb.l1_gas.max_price_per_unit);
          }
          if (rb.l2_gas) {
            rb.l2_gas.max_amount = BigInt(rb.l2_gas.max_amount);
            rb.l2_gas.max_price_per_unit = BigInt(rb.l2_gas.max_price_per_unit);
          }
          if (rb.l1_data_gas) {
            rb.l1_data_gas.max_amount = BigInt(rb.l1_data_gas.max_amount);
            rb.l1_data_gas.max_price_per_unit = BigInt(rb.l1_data_gas.max_price_per_unit);
          }
        }

        // Broadcast transaction
        let txHash: string;
        const result: any = await starknetRpc.invokeFunction(data.signed, data.details);
        txHash = result.transaction_hash;

        txHashes.push(txHash);
      } else if (swap.chainIdentifier === 'SOLANA') {
        // TODO: Implement Solana transaction broadcasting when Solana support is added
        throw new Error('Solana transaction broadcasting not yet implemented');
      } else {
        throw new Error(`Unsupported chain: ${swap.chainIdentifier}`);
      }
    }

    res.json({
      success: true,
      message: 'Refund transactions broadcast successfully',
      txHashes,
    });
  } catch (error: any) {
    res.status(500).json({
      error: 'RefundBroadcastError',
      message: error.message || 'Failed to broadcast refund transactions',
    });
  }
}


