/**
 * Test script for TO_BTCLN cooperative refund flow via REST API
 *
 * This script demonstrates:
 * 1. Creating a Starknet STRK → Lightning Network swap via REST API
 * 2. Using a Lightning invoice with inbound liquidity
 * 3. Manually canceling the invoice in Electrum after getting quote
 * 4. Committing the swap on-chain (paying STRK)
 * 5. LP attempts to pay canceled invoice and fails
 * 6. Getting unsigned refund transactions via REST API
 * 7. Signing and submitting refund transactions via REST API
 * 8. Verifying refund completion
 */

import { RpcProvider } from 'starknet';
import dotenv from 'dotenv';
import * as fs from "fs";
import * as readline from 'readline';
import { StarknetKeypairWallet } from "@atomiqlabs/chain-starknet";
import { QuoteRequest } from '../types/api';

dotenv.config();

// Configuration from environment
const API_BASE_URL = 'http://localhost:3000/api/v1';
const STARKNET_RPC_URL = process.env.STARKNET_RPC!;
const starknetRpc = new RpcProvider({nodeUrl: STARKNET_RPC_URL});

console.log('API_BASE_URL:', API_BASE_URL);
console.log('STARKNET_RPC_URL:', STARKNET_RPC_URL);

// Setup Starknet wallet
const starknetKey = fs.existsSync("starknet.key") ? fs.readFileSync("starknet.key").toString() : StarknetKeypairWallet.generateRandomPrivateKey();
const starknetWallet = new StarknetKeypairWallet(starknetRpc, starknetKey);
fs.writeFileSync("starknet.key", starknetKey);
console.log("Starknet wallet address (transfer STRK here for TX fees): "+starknetWallet.address);

// Helper to make API requests
async function apiRequest(endpoint: string, options: RequestInit = {}) {
  const url = `${API_BASE_URL}${endpoint}`;
  console.log(`\n📡 API Request: ${options.method || 'GET'} ${url}`);

  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  const data = await response.json();

  if (!response.ok) {
    console.error('❌ API Error:', data);
    throw new Error(`API request failed: ${response.status}`);
  }

  return data;
}

// Helper function to prompt user for input
function promptUser(question: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

// Helper function to sign and submit transactions
async function signAndSubmitTransactions(unsignedAction: any, swapId: string): Promise<string[]> {
  console.log(`\n   Transaction Details:`);
  console.log(`   Chain: ${unsignedAction.chain}`);
  console.log(`   Type: ${unsignedAction.txType}`);
  if (unsignedAction.description) {
    console.log(`   Description: ${unsignedAction.description}`);
  }

  let signedTxs: any[] = [];
  for (const txData of unsignedAction.data) {
    // Convert string values back to BigInt for Starknet library
    // The middleware serializes BigInt to string for JSON transport,
    // but starknet.js expects BigInt values
    if (txData.details && txData.details.resourceBounds) {
      const rb = txData.details.resourceBounds;
      if (rb.l1_gas) {
        rb.l1_gas.max_amount = BigInt(rb.l1_gas.max_amount);
        rb.l1_gas.max_price_per_unit = BigInt(rb.l1_gas.max_price_per_unit);
      }
      if (rb.l2_gas) {
        rb.l2_gas.max_amount = BigInt(rb.l2_gas.max_amount);
        rb.l2_gas.max_price_per_unit = BigInt(rb.l2_gas.max_price_per_unit);
      }
      if (rb.l1_data_gas) {
        rb.l1_data_gas.max_amount = BigInt(rb.l1_data_gas.max_amount);
        rb.l1_data_gas.max_price_per_unit = BigInt(rb.l1_data_gas.max_price_per_unit);
      }
    }

    txData.details.nonce = await starknetWallet.getNonce();

    // Build the invocation and preserve the type field for the API
    const signed = await starknetWallet.buildInvocation(txData.tx, txData.details);
    signedTxs.push({
      type: txData.type,      // Preserve transaction type (INVOKE or DEPLOY_ACCOUNT)
      signed: signed,          // The signed invocation
      details: txData.details  // Transaction details with nonce
    });

    console.log(`   ✅ Transaction signed`);
  }

  // Send signed transactions to API for broadcasting
  console.log('\n📤 Sending signed transactions to API for broadcasting...');
  const submitResponse: any = await apiRequest(unsignedAction.endpoint, {
    method: 'POST',
    body: JSON.stringify({ signedTxs }, (_, value) =>
      typeof value === 'bigint' ? value.toString() : value
    ),
  });

  console.log(`✅ Transactions broadcast successfully`);
  console.log(`   Transaction hashes: ${submitResponse.txHashes.join(', ')}`);

  return submitResponse.txHashes;
}

// Main test flow
async function testRefundFlow() {
  console.log('🚀 Starting TO_BTCLN Cooperative Refund Flow Test via REST API\n');
  console.log('Configuration:');
  console.log(`  API: ${API_BASE_URL}`);
  console.log(`  Starknet RPC: ${STARKNET_RPC_URL}`);
  console.log(`  Starknet Address: ${starknetWallet.address}\n`);

  try {
    // Step 1: Get Lightning invoice from user
    console.log('📝 Step 1: Create a Lightning invoice in Electrum\n');
    console.log('Instructions:');
    console.log('1. Open Electrum wallet on testnet');
    console.log('2. Go to Receive tab');
    console.log('3. Enter an amount (e.g., 3000 sats)');
    console.log('4. Set expiration to any value you want');
    console.log('5. Click "Create Request"');
    console.log('6. Copy the Lightning invoice (starts with "lntb")\n');

    const lightningInvoice = await promptUser('Paste your Lightning invoice here: ');

    // Basic validation
    if (!lightningInvoice.startsWith('lntb')) {
      console.error('❌ Invalid Lightning invoice format!');
      process.exit(1);
    }

    console.log('✅ Valid Lightning invoice detected\n');

    // Step 2: Create quote via REST API
    console.log('📝 Step 2: Creating swap quote via REST API...');
    const quoteRequest: QuoteRequest = {
      srcToken: 'STARKNET-STRK',
      dstToken: 'BTC-LN',
      amount: null as any,  // Will be determined by invoice
      amountType: 'EXACT_OUT',  // EXACT_OUT required for TO_BTCLN
      srcAddress: starknetWallet.address,
      dstAddress: lightningInvoice,
    };

    const quoteResponse: any = await apiRequest('/quotes', {
      method: 'POST',
      body: JSON.stringify(quoteRequest),
    });

    console.log(`✅ Quote created: ${quoteResponse.swapId}`);
    console.log(`   State: ${quoteResponse.state} (${quoteResponse.stateNumber})`);
    console.log(`   Input: ${quoteResponse.quote.input.rawAmount} ${quoteResponse.quote.input.token.symbol}`);
    console.log(`   Input without fee: ${quoteResponse.quote.inputWithoutFee.rawAmount} ${quoteResponse.quote.inputWithoutFee.token.symbol}`);
    console.log(`   Output: ${quoteResponse.quote.output.rawAmount} sats (to Lightning)`);
    console.log(`   Quote expiry: ${new Date(quoteResponse.quote.quoteExpiry).toISOString()}`);
    console.log(`   Unsigned transactions: ${quoteResponse.unsignedTxs.length}`);

    const swapId = quoteResponse.swapId;
    const unsignedActions = quoteResponse.unsignedTxs;

    // Step 3: Delete the invoice in Electrum
    console.log('\n⏳ Step 3: Delete the invoice in Electrum');
    console.log('   This will cause the LP payment to fail, triggering a refund scenario\n');

    const waitSeconds = 20;
    for (let i = waitSeconds; i > 0; i--) {
      process.stdout.write(`\r   Countdown: ${i} seconds remaining...`);
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    console.log('\r   ✅ Invoice should now be deleted\n');

    // Step 4: Sign and broadcast commit transactions
    console.log('✍️  Step 4: Signing and broadcasting commit transactions...');
    console.log('   This pays STRK tokens to the escrow contract on Starknet\n');

    for (let i = 0; i < unsignedActions.length; i++) {
      const unsignedAction = unsignedActions[i];
      console.log(`\n   Transaction ${i + 1}/${unsignedActions.length}:`);
      await signAndSubmitTransactions(unsignedAction, swapId);
    }

    console.log('\n✅ Swap committed!\n');

    // Step 5: Wait for LP to attempt payment (and fail)
    console.log('⏳ Step 5: Waiting for LP to attempt paying the deleted invoice...');
    console.log('   The LP will try to pay but fail due to deleted invoice\n');

    // Poll swap state until it becomes refundable or times out
    let currentState = quoteResponse.state;
    let canRefund = false;
    let pollCount = 0;
    const maxPolls = 60; // 5 minutes

    while (!canRefund && pollCount < maxPolls) {
      await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds
      pollCount++;

      const stateResponse: any = await apiRequest(`/swaps/${swapId}`);
      currentState = stateResponse.state;
      canRefund = stateResponse.canRefund;

      console.log(`   Poll ${pollCount}: ${currentState} (canRefund: ${canRefund})`);

      // If swap is claimed, payment succeeded unexpectedly
      if (currentState === 'CLAIMED') {
        console.log('\n⚠️  Warning: Payment succeeded unexpectedly!');
        console.log('   The invoice might not have been deleted.');
        process.exit(1);
      }
    }

    if (!canRefund) {
      console.log('\n❌ Timeout: Swap did not become refundable');
      console.log(`   Final state: ${currentState}`);
      process.exit(1);
    }

    console.log('\n✅ LP payment failed as expected (invoice deleted)');
    console.log(`   Swap is now in refundable state: ${currentState}\n`);

    // Step 6: Get unsigned refund transactions via REST API
    console.log('📝 Step 6: Getting unsigned refund transactions via REST API...');

    const refundTxsResponse: any = await apiRequest(`/swaps/${swapId}/txs/refund`);

    console.log(`✅ Received unsigned refund transactions`);
    console.log(`   Swap state: ${refundTxsResponse.state}`);
    console.log(`   Number of transactions: ${refundTxsResponse.unsignedTxs.length}`);

    const refundUnsignedActions = refundTxsResponse.unsignedTxs;

    // Step 7: Sign and broadcast refund transactions
    console.log('\n✍️  Step 7: Signing and broadcasting refund transactions...');
    console.log('   LP will provide refund authorization signature automatically\n');

    const refundTxHashes: string[] = [];
    for (let i = 0; i < refundUnsignedActions.length; i++) {
      const unsignedAction = refundUnsignedActions[i];
      console.log(`\n   Refund transaction ${i + 1}/${refundUnsignedActions.length}:`);
      const txHashes = await signAndSubmitTransactions(unsignedAction, swapId);
      refundTxHashes.push(...txHashes);
    }

    console.log('\n✅ Refund transactions submitted!\n');

    // Step 8: Verify refund completion
    console.log('👀 Step 8: Verifying refund completion...');

    // Poll for a bit to see final state
    pollCount = 0;
    while (pollCount < 10) {
      await new Promise(resolve => setTimeout(resolve, 3000)); // Wait 3 seconds
      pollCount++;

      const stateResponse: any = await apiRequest(`/swaps/${swapId}`);
      currentState = stateResponse.state;

      console.log(`   Poll ${pollCount}: ${currentState}`);

      if (currentState === 'REFUNDED') {
        break;
      }
    }

    console.log('\n🎉 SUCCESS! Cooperative refund completed via REST API!');
    console.log('\nWhat happened:');
    console.log('✅ You paid STRK tokens on-chain via REST API');
    console.log('✅ LP attempted to pay Lightning invoice but failed (deleted)');
    console.log('✅ REST API provided unsigned refund transactions');
    console.log('✅ You signed refund transactions with your wallet');
    console.log('✅ REST API broadcast refund transactions on-chain');
    console.log('✅ Your STRK tokens were refunded!');
    console.log('✅ No penalties - you got your funds back!');
    console.log('\nThis demonstrates the cooperative refund path via REST API when LP cannot complete payment.');

  } catch (error: any) {
    console.error('\n❌ Error during test:', error.message);
    console.error(error);
    process.exit(1);
  }
}

// Run the test
testRefundFlow().then(() => {
  console.log('\n✅ Test completed');
  process.exit(0);
}).catch((error) => {
  console.error('\n❌ Test failed:', error);
  process.exit(1);
});
