/**
 * Transaction metadata helpers for wrapping unsigned transactions
 */

import { Swapper, SwapType } from '@atomiqlabs/sdk';
import {
  TransactionType,
  UnsignedTransactionWithMetadata,
} from '../types/api';
import { serializeTransaction } from './sdkHelpers';
import { swapper } from '../services';

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
  swapId: string,
  txType: TransactionType,
  chain: string, // TODO sort out types
  swapType: SwapType,
): UnsignedTransactionWithMetadata {
  if (!txs || txs.length === 0) {
    throw Error('Should have txs in the wrapTransactionsWithMetadata')
  }

  const txDescription = txDescriptions[swapType]?.[txType];
  
  return {
    chain,
    txType,
    endpoint: `/swaps/${swapId}/${txType}`,
    description: txDescription,
    data: txs.map((tx) => (swapper.Utils.serializeUnsignedTransaction(chain as any, tx)))
  };
}
