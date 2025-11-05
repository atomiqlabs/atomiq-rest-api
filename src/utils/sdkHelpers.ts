/**
 * Clean helper functions for working with SDK data structures
 */

/**
 * Convert SDK TokenAmount to JSON-serializable format
 * Returns only raw amount as string - clients can format based on decimals
 */
export function tokenAmountToJSON(tokenAmount: any): any {
  if (!tokenAmount) return null;

  return {
    token: {
      chain: tokenAmount.token.chain,
      symbol: tokenAmount.token.ticker,
      decimals: tokenAmount.token.decimals,
      name: tokenAmount.token.name,
    },
    rawAmount: tokenAmount.rawAmount.toString(), // BigInt to string
  };
}

/**
 * Serialize an unsigned transaction to JSON-safe format
 * Handles BigInt conversion for different transaction types (Starknet, Solana, etc.)
 */
export function serializeTransaction(tx: any): any {
  if (!tx) return null;

  // Use JSON stringify with BigInt replacer to handle any BigInt values
  // This works for all chain types (Starknet Call objects, Solana transactions, etc.)
  return JSON.parse(JSON.stringify(tx, (_, value) =>
    typeof value === 'bigint' ? value.toString() : value
  ));
}

/**
 * Serialize an array of unsigned transactions
 */
export function serializeTransactions(txs: any[]): any[] {
  if (!txs || txs.length === 0) return [];
  return txs.map(serializeTransaction);
}
