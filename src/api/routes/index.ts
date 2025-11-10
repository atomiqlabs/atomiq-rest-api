import { Router } from 'express';
import {
  createQuote,
  // getSwapState,
  // listSwaps,
  // getCommitTransactions,
  // submitCommitTransactions,
  // getRefundTransactions,
  // submitRefundTransactions,
  // getClaimTransactions,
  getHealth,
  getLimits,
  getTokens,
} from '../controllers';
import { asyncHandler } from '../middleware';

export function createRouter(): Router {
  const router = Router();

  // Health check
  router.get('/health', asyncHandler(getHealth));

  // Utility endpoints
  router.get('/limits', asyncHandler(getLimits));
  router.get('/tokens', asyncHandler(getTokens));

  // Quote creation
  router.post('/quotes', asyncHandler(createQuote));

  // // Swap management
  // router.get('/swaps', asyncHandler(listSwaps));
  // router.get('/swaps/:id', asyncHandler(getSwapState));

  // // Transaction endpoints
  // router.get('/swaps/:id/txs/commit', asyncHandler(getCommitTransactions));
  // router.post('/swaps/:id/commit', asyncHandler(submitCommitTransactions));

  // router.get('/swaps/:id/txs/refund', asyncHandler(getRefundTransactions));
  // router.post('/swaps/:id/refund', asyncHandler(submitRefundTransactions));

  // router.get('/swaps/:id/txs/claim', asyncHandler(getClaimTransactions));

  return router;
}
