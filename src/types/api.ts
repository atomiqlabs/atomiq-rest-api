/**
 * REST API Types for Atomiq Middleware
 */

import { SwapType } from "@atomiqlabs/sdk";

/**
 * Transaction type identifiers
 */
export type TransactionType =
  | "commit"
  | "refund"

/**
 * Unsigned transaction with metadata for client display and execution
 */
export interface UnsignedTransactionWithMetadata {
  chain: string;
  txType: TransactionType;
  swapType: SwapType;
  data: any;
}

/**
 * Quote request body
 */
export interface QuoteRequest {
  srcToken: string;
  dstToken: string;
  amount?: string;        // Decimal format: "1.5"
  rawAmount?: string;     // Raw base units: "1500000000000000000"
  amountType: 'EXACT_IN' | 'EXACT_OUT';
  srcAddress: string;
  dstAddress: string;
}

/**
 * Token metadata
 */
export interface TokenData {
  chain: string;
  symbol: string;
  decimals: number;
  address?: string;
}

/**
 * Health check response
 */
export interface HealthResponse {
  status: 'healthy' | 'unhealthy';
  version: string;
  uptime: number;
  storage: boolean;
  sdk: boolean;
}

/**
 * Error response structure
 */
export interface ErrorResponse {
  error: string;
  message: string;
  details?: any;
}
