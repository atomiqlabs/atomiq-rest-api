import { Router } from 'express';
import { SwapController, UtilityController } from '../controllers';
import { asyncHandler } from '../middleware';

export function createRouter(
  swapController: SwapController,
  utilityController: UtilityController
): Router {
  const router = Router();

  // Health check
  router.get('/health', asyncHandler(utilityController.getHealth.bind(utilityController)));

  // Utility endpoints
  router.get('/limits', asyncHandler(utilityController.getLimits.bind(utilityController)));
  router.get('/tokens', asyncHandler(utilityController.getTokens.bind(utilityController)));

  // Quote creation
  router.post('/quotes', asyncHandler(swapController.createQuote.bind(swapController)));

  // Swap management
  router.get('/swaps', asyncHandler(swapController.listSwaps.bind(swapController)));
  router.get('/swaps/:id', asyncHandler(swapController.getSwapState.bind(swapController)));

  // Transaction endpoints
  router.get('/swaps/:id/txs/commit', asyncHandler(swapController.getCommitTransactions.bind(swapController)));
  router.post('/swaps/:id/commit', asyncHandler(swapController.submitCommitTransactions.bind(swapController)));

  router.get('/swaps/:id/txs/refund', asyncHandler(swapController.getRefundTransactions.bind(swapController)));
  router.post('/swaps/:id/refund', asyncHandler(swapController.submitRefundTransactions.bind(swapController)));

  return router;
}
