/**
 * State helper utilities for converting numeric swap states to string names
 */

import { ToBTCSwapState, FromBTCSwapState, FromBTCLNSwapState, SwapType } from '@atomiqlabs/sdk-lib';

/**
 * Convert numeric swap state to string name based on swap type
 *
 * @param stateNumber - The numeric state from swap.getState()
 * @param swapType - The swap type from swap.getType()
 * @returns String name of the state (e.g., "CLAIMED", "REFUNDABLE")
 */
export function getStateName(stateNumber: number, swapType: SwapType): string {
  switch (swapType) {
    case SwapType.TO_BTC:
      return ToBTCSwapState[stateNumber];

    // Future swap types can be added here
    default:
      throw new Error(`Unknown swap type: ${swapType} with state number: ${stateNumber}`);
  }
}
