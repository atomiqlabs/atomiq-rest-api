/**
 * Exploration script to understand SDK quote data structures
 * Run with: tsc && node dist/test-quote.js
 */

import { swapper } from './src/services/SdkService';
import { SwapAmountType, FeeType } from '@atomiqlabs/sdk-lib';

async function exploreQuoteStructure() {
  console.log('\n=== Initializing Swapper ===');
  await swapper.init();
  console.log('Swapper initialized!\n');

  // ============================================
  // 1. TOKEN RESOLUTION EXPLORATION
  // ============================================
  console.log('=== 1. TOKEN RESOLUTION ===\n');

  // Test different token resolution methods
  console.log('Method 1: By simple ticker');
  try {
    const strkByTicker = swapper.getToken('STRK');
    console.log('  STRK token:', {
      name: strkByTicker.name,
      ticker: strkByTicker.ticker,
      chain: strkByTicker.chain,
      decimals: strkByTicker.decimals,
      address: (strkByTicker as any).address || 'N/A',
    });
  } catch (e: any) {
    console.log('  ERROR:', e.message);
  }

  console.log('\nMethod 2: By chain-qualified ticker');
  try {
    const ethByChain = swapper.getToken('STARKNET-ETH');
    console.log('  STARKNET-ETH token:', {
      name: ethByChain.name,
      ticker: ethByChain.ticker,
      chain: ethByChain.chain,
      decimals: ethByChain.decimals,
    });
  } catch (e: any) {
    console.log('  ERROR:', e.message);
  }

  console.log('\nMethod 3: By contract address');
  try {
    const ethByAddress = swapper.getToken('0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7');
    console.log('  ETH by address:', {
      name: ethByAddress.name,
      ticker: ethByAddress.ticker,
      chain: ethByAddress.chain,
    });
  } catch (e: any) {
    console.log('  ERROR:', e.message);
  }

  // ============================================
  // 2. SUPPORTED TOKENS
  // ============================================
  console.log('\n=== 2. SUPPORTED TOKENS ===\n');

  const inputTokens = swapper.getSupportedTokens(true);
  console.log(`Supported input tokens (${inputTokens.length}):`);
  inputTokens.forEach(t => {
    console.log(`  - ${t.name} (${t.ticker}) on chain ${t.chain}`);
  });

  const outputTokens = swapper.getSupportedTokens(false);
  console.log(`\nSupported output tokens (${outputTokens.length}):`);
  outputTokens.forEach(t => {
    console.log(`  - ${t.name} (${t.ticker}) on chain ${t.chain}`);
  });

  // ============================================
  // 3. SWAP LIMITS
  // ============================================
  console.log('\n=== 3. SWAP LIMITS ===\n');

  try {
    const srcToken = swapper.getToken('STARKNET-ETH') as any;
    const dstToken = swapper.getToken('BTC') as any;

    const limits = swapper.getSwapLimits(srcToken, dstToken);
    console.log('Limits for STARKNET-ETH -> BTC:');
    console.log('  Input min:', limits.input.min.toString());
    console.log('  Input max:', limits.input.max.toString());
    console.log('  Output min:', limits.output.min?.toString() || 'Not available until swap attempted');
    console.log('  Output max:', limits.output.max?.toString() || 'Not available until swap attempted');
  } catch (e: any) {
    console.log('  ERROR:', e.message);
  }

  // ============================================
  // 4. CREATE A REAL SWAP QUOTE
  // ============================================
  console.log('\n=== 4. CREATE SWAP QUOTE ===\n');

  try {
    const srcToken = swapper.getToken('STARKNET-ETH') as any;
    const dstToken = swapper.getToken('BTC') as any;

    // Test Starknet address (random valid address format)
    const starknetAddress = '0x0742b5662e9f4c0f54b8b3b6d8b5d4e3c2a1f0e9d8c7b6a5948372615041302';
    // Test Bitcoin testnet address
    const btcAddress = 'tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx';

    console.log('Creating swap quote...');
    console.log(`  From: 0.001 ETH (Starknet)`);
    console.log(`  To: BTC`);
    console.log(`  Source address: ${starknetAddress.substring(0, 20)}...`);
    console.log(`  Destination address: ${btcAddress}`);

    const swap = await swapper.swap(
      srcToken as any,
      dstToken as any,
      '0.001', // 0.001 ETH
      SwapAmountType.EXACT_IN,
      starknetAddress,
      btcAddress
    );

    console.log('\n✅ Swap quote created successfully!\n');

    // ============================================
    // 5. INSPECT QUOTE DATA STRUCTURE
    // ============================================
    console.log('=== 5. QUOTE DATA STRUCTURE ===\n');

    console.log('Swap ID:', swap.getId());
    console.log('\n--- Basic Amounts ---');
    console.log('Input (without fee):', swap.getInputWithoutFee().toString());
    console.log('Input (with fee):', swap.getInput().toString());
    console.log('Output:', swap.getOutput().toString());

    console.log('\n--- Fee Information ---');
    const fee = swap.getFee();
    console.log('Total fee in source token:', fee.amountInSrcToken.toString());
    console.log('Total fee in dest token:', fee.amountInDstToken.toString());

    console.log('\n--- Fee Breakdown ---');
    const feeBreakdown = swap.getFeeBreakdown();
    feeBreakdown.forEach((feeItem: any) => {
      console.log(`  ${FeeType[feeItem.type]}:`);
      console.log(`    - In source token: ${feeItem.fee.amountInSrcToken.toString()}`);
      console.log(`    - In dest token: ${feeItem.fee.amountInDstToken.toString()}`);
    });

    console.log('\n--- Price Information ---');
    const priceInfo = swap.getPriceInfo();
    console.log('Swap price:', priceInfo.swapPrice);
    console.log('Market price:', priceInfo.marketPrice);
    console.log('Difference:', priceInfo.difference);

    console.log('\n--- Other Details ---');
    console.log('Quote expiry:', new Date(swap.getQuoteExpiry()).toISOString());
    console.log('Time until expiry:', Math.round((swap.getQuoteExpiry() - Date.now()) / 1000), 'seconds');

    console.log('\n--- Swap Type & State ---');
    console.log('Swap type:', swap.getType());
    console.log('Swap state:', swap.getState());

    console.log('\n--- Serialized Data ---');
    const serialized = swap.serialize();
    console.log('Serialized swap (partial):', {
      id: serialized.id,
      type: serialized.type,
      state: serialized.state,
      expiry: serialized.expiry,
      // Show first few keys of serialized object
      keys: Object.keys(serialized).slice(0, 10),
    });

    console.log('\n--- Unsigned Transactions ---');
    if (typeof (swap as any).txsCommit === 'function') {
      const commitTxs = await (swap as any).txsCommit();
      console.log(`Number of commit transactions: ${commitTxs.length}`);
      if (commitTxs.length > 0) {
        console.log('First transaction structure:', {
          type: typeof commitTxs[0],
          keys: Object.keys(commitTxs[0] || {}).slice(0, 5),
        });
      }
    }

    // ============================================
    // 6. CHECK FOR ADDITIONAL METHODS
    // ============================================
    console.log('\n=== 6. AVAILABLE METHODS ON SWAP ===\n');

    const methods = Object.getOwnPropertyNames(Object.getPrototypeOf(swap));
    console.log('Available methods:', methods.filter(m => !m.startsWith('_') && m !== 'constructor'));

  } catch (e: any) {
    console.log('\n❌ Error creating swap quote:');
    console.log('  Message:', e.message);
    console.log('  Stack:', e.stack?.split('\n').slice(0, 3).join('\n'));
  }

  // ============================================
  // 7. CLEANUP
  // ============================================
  console.log('\n=== Stopping Swapper ===');
  await swapper.stop();
  console.log('Done!\n');
}

// Run the exploration
exploreQuoteStructure()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
