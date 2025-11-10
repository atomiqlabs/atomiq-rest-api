/**
 * Helpers for mapping swap states to human-readable text
 */

import { SwapType } from '@atomiqlabs/sdk-lib';

// Import state enums - these may vary by SDK version
// You can find these in @atomiqlabs/sdk or @atomiqlabs/sdk-lib
// For now, we'll use generic mappings

/**
 * Get state text from state number
 * Basic mapping for common states
 */
export function getStateText(state: number, swapType?: SwapType): string {
  // Generic state names that apply across swap types
  const genericStates: Record<number, string> = {
    0: 'CREATED',
    1: 'COMMITED',
    2: 'CLAIMED',
    3: 'REFUNDED',
    4: 'EXPIRED',
  };

  return genericStates[state] || `STATE_${state}`;
}

// /**
//  * Get user-friendly state description
//  */
// export function getStateDescription(state: number, swapType: SwapType): string {
//   // Generic descriptions
//   const descriptions: Record<number, string> = {
//     0: 'Quote created, waiting for commitment',
//     1: 'Transaction committed, waiting for settlement',
//     2: 'Swap successfully completed and claimed',
//     3: 'Swap refunded',
//     4: 'Quote expired',
//   };

//   return descriptions[state] || `Swap is in state ${state}`;
// }
