import { Request, Response } from 'express';
import { SwapService } from '../../services';
import {
  QuoteRequest,
  CommitTransactionRequest,
  SwapListQuery,
  SwapListResponse,
} from '../../types/api';

/**
 * Controller for swap-related endpoints
 */
export class SwapController {
  constructor(private swapService: SwapService) {}

  /**
   * POST /api/v1/quotes
   * Create a new swap quote
   */
  async createQuote(req: Request, res: Response): Promise<void> {
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

    const quote = await this.swapService.createQuote(quoteRequest);
    res.status(201).json(quote);
  }

  /**
   * GET /api/v1/swaps/:id
   * Get swap state
   */
  async getSwapState(req: Request, res: Response): Promise<void> {
    const { id } = req.params;

    const state = await this.swapService.getSwapState(id);
    res.json(state);
  }

  /**
   * GET /api/v1/swaps
   * List swaps with filters
   */
  async listSwaps(req: Request, res: Response): Promise<void> {
    const query: SwapListQuery = {
      address: req.query.address as string,
      state: req.query.state as string,
      chain: req.query.chain as string,
      type: req.query.type as string,
      limit: req.query.limit ? parseInt(req.query.limit as string, 10) : 20,
      offset: req.query.offset ? parseInt(req.query.offset as string, 10) : 0,
    };

    const filters: any = {};
    if (query.address) filters.initiator = query.address;
    if (query.state) filters.state = parseInt(query.state, 10);
    if (query.chain) filters.chain = query.chain;
    if (query.type) filters.type = parseInt(query.type, 10);

    filters.limit = query.limit;
    filters.offset = query.offset;

    const swaps = await this.swapService.querySwaps(filters);
    const total = await this.swapService.getSwapCount(filters);

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
  async getCommitTransactions(req: Request, res: Response): Promise<void> {
    const { id } = req.params;

    const txs = await this.swapService.getCommitTransactions(id);
    res.json({ swapId: id, transactions: txs });
  }

  /**
   * POST /api/v1/swaps/:id/commit
   * Submit signed commit transactions
   */
  async submitCommitTransactions(req: Request, res: Response): Promise<void> {
    const { id } = req.params;
    const body: CommitTransactionRequest = req.body;

    if (!body.signedTxs || !Array.isArray(body.signedTxs)) {
      res.status(400).json({
        error: 'ValidationError',
        message: 'signedTxs array is required',
      });
      return;
    }

    const result = await this.swapService.submitCommitTransactions(id, body.signedTxs);
    res.json(result);
  }

  /**
   * GET /api/v1/swaps/:id/txs/refund
   * Get unsigned refund transactions
   */
  async getRefundTransactions(req: Request, res: Response): Promise<void> {
    const { id } = req.params;
    const signerAddress = req.query.signer as string | undefined;

    const txs = await this.swapService.getRefundTransactions(id, signerAddress);
    res.json({ swapId: id, transactions: txs });
  }

  /**
   * POST /api/v1/swaps/:id/refund
   * Submit signed refund transactions
   */
  async submitRefundTransactions(req: Request, res: Response): Promise<void> {
    const { id } = req.params;
    const body: CommitTransactionRequest = req.body;

    if (!body.signedTxs || !Array.isArray(body.signedTxs)) {
      res.status(400).json({
        error: 'ValidationError',
        message: 'signedTxs array is required',
      });
      return;
    }

    const result = await this.swapService.submitRefundTransactions(id, body.signedTxs);
    res.json(result);
  }
}
