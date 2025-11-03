import { Request, Response } from 'express';
import { HealthResponse } from '../../types/api';

/**
 * Controller for utility endpoints
 */
export class UtilityController {
  private startTime: number = Date.now();

  /**
   * GET /api/v1/health
   * Health check endpoint
   */
  async getHealth(req: Request, res: Response): Promise<void> {
    const response: HealthResponse = {
      status: 'healthy',
      version: process.env.npm_package_version || '0.1.0',
      uptime: Date.now() - this.startTime,
      storage: true, // TODO: Check actual storage health
      sdk: true, // TODO: Check actual SDK health
    };

    res.json(response);
  }

  /**
   * GET /api/v1/limits
   * Get swap limits
   */
  async getLimits(req: Request, res: Response): Promise<void> {
    // TODO: Implement actual limits query from SDK
    res.json({
      input: {
        min: '0.001',
        max: '10',
      },
      output: {
        min: '0.0001',
        max: '1',
      },
    });
  }

  /**
   * GET /api/v1/tokens
   * Get supported tokens
   */
  async getTokens(req: Request, res: Response): Promise<void> {
    // TODO: Get actual tokens from SDK
    res.json({
      tokens: [
        {
          chain: 'bitcoin',
          symbol: 'BTC',
          decimals: 8,
        },
        {
          chain: 'starknet',
          symbol: 'STRK',
          decimals: 18,
        },
        {
          chain: 'solana',
          symbol: 'SOL',
          decimals: 9,
        },
      ],
    });
  }
}
