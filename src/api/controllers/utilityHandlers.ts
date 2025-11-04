import { Request, Response } from 'express';
import { HealthResponse } from '../../types/api';

// Track server start time
const startTime = Date.now();

/**
 * GET /api/v1/health
 * Health check endpoint
 */
export async function getHealth(req: Request, res: Response): Promise<void> {
  const response: HealthResponse = {
    status: 'healthy',
    version: process.env.npm_package_version || '0.1.0',
    uptime: Date.now() - startTime,
    storage: true, // TODO: Check actual storage health
    sdk: true, // TODO: Check actual SDK health
  };

  res.json(response);
}

/**
 * GET /api/v1/limits
 * Get swap limits
 */
export async function getLimits(req: Request, res: Response): Promise<void> {
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
export async function getTokens(req: Request, res: Response): Promise<void> {
  // TODO: Get actual tokens from SDK token registry
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
