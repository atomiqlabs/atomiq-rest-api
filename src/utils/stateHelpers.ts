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
    case SwapType.TO_BTCLN:
      // Both TO_BTC and TO_BTCLN use ToBTCSwapState (they share the same base class)
      return ToBTCSwapState[stateNumber];

    case SwapType.FROM_BTC:
      return FromBTCSwapState[stateNumber];

    case SwapType.FROM_BTCLN:
      return FromBTCLNSwapState[stateNumber];

    default:
      throw new Error(`Unknown swap type: ${swapType} with state number: ${stateNumber}`);
  }
}
