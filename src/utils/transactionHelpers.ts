/**
 * Transaction metadata helpers for wrapping unsigned transactions
 */

import { SwapType } from '@atomiqlabs/sdk';
import {
  TransactionType,
  UnsignedTransactionWithMetadata,
} from '../types/api';
import { serializeTransaction } from './sdkHelpers';

/**
 * Wrap raw transactions with metadata
 */
export function wrapTransactionsWithMetadata(
  txs: any[],
  txType: TransactionType,
  chain: string,
  swapType: SwapType,
): UnsignedTransactionWithMetadata[] {
  if (!txs || txs.length === 0) {
    return [];
  }

  return txs.map((tx) => ({
    chain,
    txType,
    swapType,
    data: serializeTransaction(tx),
  }));
}
