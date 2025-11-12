/**
 * Transaction metadata helpers for wrapping unsigned transactions
 */

import { SwapType } from '@atomiqlabs/sdk';
import {
  TransactionType,
  UnsignedTransactionWithMetadata,
} from '../types/api';
import { serializeTransaction } from './sdkHelpers';


const txDescriptions: {[swapType in SwapType]?: Record<TransactionType, string>} = {
  [SwapType.TO_BTC]: {
    commit: 'Lock tokens in escrow to initiate Bitcoin swap',
    refund: 'Refund tokens from escrow after swap timeout (Bitcoin swap)',
  },
  [SwapType.TO_BTCLN]: {
    commit: 'Lock tokens in escrow to initiate Lightning swap',
    refund: 'Refund tokens from escrow after swap timeout (Lightning swap)',
  },
  [SwapType.FROM_BTC]: {
    commit: 'Commit on Bitcoin chain to start receiving tokens',
    refund: 'Refund Bitcoin after swap timeout',
  },
  // Add more swap types as needed
};


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

  const txDescription = txDescriptions[swapType]?.[txType];
  
  return txs.map((tx) => ({
    chain,
    txType,
    description: txDescription,
    data: serializeTransaction(tx),
  }));
}
