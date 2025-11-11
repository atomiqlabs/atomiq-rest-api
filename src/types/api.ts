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

export interface QuoteRequest {
  srcToken: string;
  dstToken: string;
  amount?: string;        // Decimal format: "1.5"
  rawAmount?: string;     // Raw base units: "1500000000000000000"
  amountType: 'EXACT_IN' | 'EXACT_OUT';
  srcAddress: string;
  dstAddress: string;
}

export interface TokenIdentifier {
  chain: string;
  symbol: string;
  address?: string;
}

export interface QuoteResponse {
  swapId: string;
  state: string;
  stateNumber: number;
  quote: SwapQuoteData;
  unsignedTxs: UnsignedTransactionWithMetadata[];
}

export interface SwapQuoteData {
  input: TokenAmountData;
  inputWithoutFee: TokenAmountData;
  output: TokenAmountData;
  fees: FeeData;
  feeBreakdown: FeeBreakdownItem[];
  priceInfo: PriceInfoData;
  quoteExpiry: number;
  smartChainNetworkFee?: string;
  bitcoinFeeRate?: number;
}

export interface TokenAmountData {
  token: TokenData;
  rawAmount: string;  // Base units as string (e.g., "1500000000000000000")
  usdValue?: number;
}

export interface TokenData {
  chain: string;
  symbol: string;
  decimals: number;
  address?: string;
}

export interface FeeData {
  amountInSrcToken: TokenAmountData;
  amountInDstToken: TokenAmountData;
  usdValue?: number;
  composition?: {
    base: TokenAmountData;
    percentage: string;
  };
}

export interface FeeBreakdownItem {
  name: string;
  type: number;
  fee: FeeData;
}

export interface PriceInfoData {
  marketPrice: number;
  swapPrice: number;
  difference: string;
}

export interface SwapStateResponse {
  swapId: string;
  state: string;
  stateNumber: number;
  stateText: string;
  canRefund: boolean;
  canClaim: boolean;
  needsClientAction: boolean;
  swap: SerializedSwap;
}

export interface SerializedSwap {
  id: string;
  type: number;
  state: number;
  escrowHash: string;
  initiator: string;
  url: string;
  swapFee: string;
  swapFeeBtc?: string;
  expiry: number;
  version: number;
  initiated: boolean;
  exactIn: boolean;
  createdAt: number;
  randomNonce: string;
  networkFee?: string;
  networkFeeBtc?: string;
  data: any;
  signatureData: any;
  _isValid: boolean;
  _differencePPM: string;
  _satsBaseFee: string;
  _feePPM: string;
  _realPriceUSatPerToken: string;
  _swapPriceUSatPerToken: string;
}

export interface CommitTransactionRequest {
  signedTxs: string[];
}

export interface TransactionSubmissionResponse {
  success: boolean;
  txIds: string[];
  error?: string;
}

export interface SwapLimitsResponse {
  input: {
    min: string;
    max: string;
  };
  output: {
    min: string;
    max: string;
  };
}

export interface TokensResponse {
  tokens: TokenData[];
}

export interface HealthResponse {
  status: 'healthy' | 'unhealthy';
  version: string;
  uptime: number;
  storage: boolean;
  sdk: boolean;
}

export interface ErrorResponse {
  error: string;
  message: string;
  details?: any;
}

export interface SwapListQuery {
  address?: string;
  state?: string;
  chain?: string;
  type?: string;
  limit?: number;
  offset?: number;
}

export interface SwapListResponse {
  swaps: SerializedSwap[];
  total: number;
  limit: number;
  offset: number;
}
