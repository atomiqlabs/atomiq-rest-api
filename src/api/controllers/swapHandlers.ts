import { Request, Response } from 'express';
import { swapper } from '../../services';
import { SwapAmountType, FeeType } from '@atomiqlabs/sdk-lib';
import {
  QuoteRequest,
  CommitTransactionRequest,
  SwapListQuery,
  SwapListResponse,
} from '../../types/api';
import { parseFormattedAmount, toBaseUnits, sanitizeBigInts } from '../../utils/tokenHelpers';
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

  // Extract real quote data from swap object
  const inputFormatted = swap.getInput().toString();
  const inputWithoutFeeFormatted = swap.getInputWithoutFee().toString();
  const outputFormatted = swap.getOutput().toString();

  const inputParsed = parseFormattedAmount(inputFormatted);
  const inputWithoutFeeParsed = parseFormattedAmount(inputWithoutFeeFormatted);
  const outputParsed = parseFormattedAmount(outputFormatted);

  // Get fee information
  const feeInfo = swap.getFee();
  const feeInSrcFormatted = feeInfo.amountInSrcToken.toString();
  const feeInDstFormatted = feeInfo.amountInDstToken.toString();

  const feeInSrcParsed = parseFormattedAmount(feeInSrcFormatted);
  const feeInDstParsed = parseFormattedAmount(feeInDstFormatted);

  // Get fee breakdown
  const feeBreakdown = swap.getFeeBreakdown();
  const feeBreakdownData = feeBreakdown.map((feeItem: any) => {
    const feeInSrc = parseFormattedAmount(feeItem.fee.amountInSrcToken.toString());
    const feeInDst = parseFormattedAmount(feeItem.fee.amountInDstToken.toString());

    return {
      type: FeeType[feeItem.type],
      fee: {
        amountInSrcToken: {
          token: {
            chain: srcToken.chain,
            symbol: srcToken.ticker,
            decimals: srcToken.decimals,
          },
          rawAmount: toBaseUnits(feeInSrc.amount, srcToken.decimals),
          amount: feeInSrc.amount,
        },
        amountInDstToken: {
          token: {
            chain: dstToken.chain,
            symbol: dstToken.ticker,
            decimals: dstToken.decimals,
          },
          rawAmount: toBaseUnits(feeInDst.amount, dstToken.decimals),
          amount: feeInDst.amount,
        },
      },
    };
  });

  // Get price information
  const priceInfo = swap.getPriceInfo();
  const priceDifference = priceInfo.difference;

  // Serialize price difference properly (convert BigInt to number)
  let diffValue: number;
  if (typeof priceDifference === 'object' && priceDifference !== null) {
    diffValue = priceDifference.percentage;
  } else {
    diffValue = Number(priceDifference);
  }

  const response = {
    swapId: swap.getId(),
    state: getStateText(swap.getState(), swap.getType()),
    stateNumber: swap.getState(),
    quote: {
      input: {
        token: {
          chain: srcToken.chain,
          symbol: srcToken.ticker,
          decimals: srcToken.decimals,
          name: srcToken.name,
        },
        rawAmount: toBaseUnits(inputParsed.amount, srcToken.decimals),
        amount: inputParsed.amount,
      },
      inputWithoutFee: {
        token: {
          chain: srcToken.chain,
          symbol: srcToken.ticker,
          decimals: srcToken.decimals,
          name: srcToken.name,
        },
        rawAmount: toBaseUnits(inputWithoutFeeParsed.amount, srcToken.decimals),
        amount: inputWithoutFeeParsed.amount,
      },
      output: {
        token: {
          chain: dstToken.chain,
          symbol: dstToken.ticker,
          decimals: dstToken.decimals,
          name: dstToken.name,
        },
        rawAmount: toBaseUnits(outputParsed.amount, dstToken.decimals),
        amount: outputParsed.amount,
      },
      fees: {
        amountInSrcToken: {
          token: {
            chain: srcToken.chain,
            symbol: srcToken.ticker,
            decimals: srcToken.decimals,
          },
          rawAmount: toBaseUnits(feeInSrcParsed.amount, srcToken.decimals),
          amount: feeInSrcParsed.amount,
        },
        amountInDstToken: {
          token: {
            chain: dstToken.chain,
            symbol: dstToken.ticker,
            decimals: dstToken.decimals,
          },
          rawAmount: toBaseUnits(feeInDstParsed.amount, dstToken.decimals),
          amount: feeInDstParsed.amount,
        },
      },
      feeBreakdown: feeBreakdownData,
      priceInfo: {
        marketPrice: priceInfo.marketPrice,
        swapPrice: priceInfo.swapPrice,
        difference: diffValue,
      },
      quoteExpiry: swap.getQuoteExpiry(),
    },
    unsignedTxs: {
      commit: commitTxs,
    },
  };

  // Sanitize any BigInts in the response before sending
  res.status(201).json(sanitizeBigInts(response));
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

