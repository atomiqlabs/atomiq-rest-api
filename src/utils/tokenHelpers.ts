/**
 * Helpers for working with token amounts from the SDK
 */

/**
 * Parse SDK's formatted amount string (e.g., "0.001000000 ETH")
 * Returns both the numeric value and the unit
 */
export function parseFormattedAmount(formattedAmount: string): { amount: string; unit: string } {
  const parts = formattedAmount.trim().split(/\s+/);
  if (parts.length === 2) {
    return { amount: parts[0], unit: parts[1] };
  }
  // If no unit, return as-is
  return { amount: formattedAmount.trim(), unit: '' };
}

/**
 * Convert decimal amount to base units (raw amount as string)
 * Always returns a string to avoid BigInt serialization issues
 */
export function toBaseUnits(decimalAmount: string, decimals: number): string {
  // Remove any unit suffix if present
  const cleanAmount = decimalAmount.split(/\s+/)[0];

  // Handle empty or invalid input
  if (!cleanAmount || cleanAmount === '' || cleanAmount === '.') {
    return '0';
  }

  const [whole = '0', fraction = ''] = cleanAmount.split('.');
  const paddedFraction = fraction.padEnd(decimals, '0').slice(0, decimals);
  const baseUnits = (whole + paddedFraction).replace(/^0+/, '') || '0';

  // Ensure we always return a string
  return String(baseUnits);
}

/**
 * Convert base units to decimal amount
 */
export function toDecimalAmount(baseUnits: string, decimals: number): string {
  const paddedBaseUnits = baseUnits.padStart(decimals + 1, '0');
  const whole = paddedBaseUnits.slice(0, -decimals) || '0';
  const fraction = paddedBaseUnits.slice(-decimals);

  return `${whole}.${fraction}`.replace(/\.?0+$/, '');
}

/**
 * Recursively convert all BigInts in an object to strings for JSON serialization
 */
export function sanitizeBigInts(obj: any): any {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (typeof obj === 'bigint') {
    return obj.toString();
  }

  if (Array.isArray(obj)) {
    return obj.map(sanitizeBigInts);
  }

  if (typeof obj === 'object') {
    const sanitized: any = {};
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        sanitized[key] = sanitizeBigInts(obj[key]);
      }
    }
    return sanitized;
  }

  return obj;
}
