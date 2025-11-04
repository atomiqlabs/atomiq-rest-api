import { Request, Response } from 'express';
import { swapper } from '../../services';
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
  const { srcToken, dstToken } = req.query;

  if (!srcToken || !dstToken) {
    res.status(400).json({
      error: 'ValidationError',
      message: 'srcToken and dstToken query parameters are required',
    });
    return;
  }

  try {
    // Resolve tokens
    const src = swapper.getToken(srcToken as string) as any;
    const dst = swapper.getToken(dstToken as string) as any;

    // Get limits from SDK
    const limits = swapper.getSwapLimits(src, dst);

    res.json({
      input: {
        min: limits.input.min?.toString() || '0',
        max: limits.input.max?.toString() || '0',
      },
      output: {
        min: limits.output.min?.toString() || null,
        max: limits.output.max?.toString() || null,
      },
    });
  } catch (error: any) {
    res.status(404).json({
      error: 'TokenNotFound',
      message: error.message,
    });
  }
}

/**
 * GET /api/v1/tokens
 * Get supported tokens
 */
export async function getTokens(req: Request, res: Response): Promise<void> {
  // Get input and output tokens separately
  const inputTokens = swapper.getSupportedTokens(true);
  const outputTokens = swapper.getSupportedTokens(false);

  // Convert to API format
  const formatToken = (token: any) => ({
    chain: token.chain,
    symbol: token.ticker,
    name: token.name,
    decimals: token.decimals,
    address: (token as any).address || undefined,
  });

  res.json({
    input: inputTokens.map(formatToken),
    output: outputTokens.map(formatToken),
  });
}
