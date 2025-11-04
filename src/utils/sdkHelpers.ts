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

