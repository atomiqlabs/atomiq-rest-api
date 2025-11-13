/**
 * Test script for TO_BTC swap commit flow
 *
 * This script demonstrates the complete flow:
 * 1. Create a quote via REST API
 * 2. Sign transactions with Starknet wallet
 * 3. Broadcast transactions to Starknet
 * 4. Notify middleware (which waits for SDK to detect commit)
 * 5. Poll swap state until COMMITTED
 */

import { RpcProvider } from 'starknet';
import dotenv from 'dotenv';
import * as fs from "fs";
import { StarknetKeypairWallet } from "@atomiqlabs/chain-starknet";
import { QuoteRequest } from '../types/api';

dotenv.config();

// Configuration from environment
const API_BASE_URL = 'http://localhost:3000/api/v1';
const STARKNET_RPC_URL = process.env.STARKNET_RPC!
const BTC_TEST_ADDRESS = process.env.BTC_TEST_ADDRESS!
const starknetRpc = new RpcProvider({nodeUrl: STARKNET_RPC_URL});

console.log('API_BASE_URL:', API_BASE_URL);
console.log('STARKNET_RPC_URL:', STARKNET_RPC_URL);
console.log('BTC_TEST_ADDRESS:', BTC_TEST_ADDRESS);

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

// Main test flow
async function testCommitFlow() {
  console.log('🚀 Starting TO_BTC Swap Commit Flow Test\n');
  console.log('Configuration:');
  console.log(`  API: ${API_BASE_URL}`);
  console.log(`  Starknet RPC: ${STARKNET_RPC_URL}`);
  console.log(`  Starknet Address: ${starknetWallet.address}`);
  console.log(`  Bitcoin Address: ${BTC_TEST_ADDRESS}\n`);

  try {
    // Step 1: Create quote
    console.log('📝 Step 1: Creating quote...');
    const quoteRequest: QuoteRequest = {
      srcToken: 'STARKNET-STRK',
      dstToken: 'BTC',
      amount: '0.00001',
      amountType: 'EXACT_OUT',
      srcAddress: starknetWallet.address,
      dstAddress: BTC_TEST_ADDRESS,
    };

    const quoteResponse: any = await apiRequest('/quotes', {
      method: 'POST',
      body: JSON.stringify(quoteRequest),
    });

    console.log(`✅ Quote created: ${quoteResponse.swapId}`);
    console.log(`   State: ${quoteResponse.state} (${quoteResponse.stateNumber})`);
    console.log(`   Input: ${quoteResponse.quote.input.rawAmount} ${quoteResponse.quote.input.token.symbol}`);
    console.log(`   Output: ${quoteResponse.quote.output.rawAmount} sats`);
    console.log(`   Unsigned transactions: ${quoteResponse.unsignedTxs.length}`);

    const swapId = quoteResponse.swapId;
    const unsignedActions = quoteResponse.unsignedTxs;

    // Step 3: Sign and broadcast transactions
    console.log('\n✍️  Step 3: Signing and broadcasting transactions...');
    const txHashes: string[] = [];

    for (let i = 0; i < unsignedActions.length; i++) {
      const unsignedAction = unsignedActions[i];
      if (unsignedAction.description) {
        console.log(`   Description: ${unsignedAction.description}`);
      }
      console.log(`\n   Transaction ${i + 1}/${unsignedActions.length}:`);
      console.log(`   Chain: ${unsignedAction.chain}`);
      console.log(`   Type: ${unsignedAction.txType}`);

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
        console.log(txData)

        // Build the invocation and preserve the type field for the API
        const signed = await starknetWallet.buildInvocation(txData.tx, txData.details);
        signedTxs.push({
          type: txData.type,      // Preserve transaction type (INVOKE or DEPLOY_ACCOUNT)
          signed: signed,          // The signed invocation
          details: txData.details  // Transaction details with nonce
        });

        console.log(`   ✅ Transaction signed`);
      }
    
      // Step 4: Send signed transactions to API for broadcasting
      console.log('\n📤 Step 4: Sending signed transactions to API for broadcasting...');
      const commitResponse: any = await apiRequest(unsignedAction.endpoint, {
        method: 'POST',
        body: JSON.stringify({ signedTxs }, (_, value) =>
          typeof value === 'bigint' ? value.toString() : value
        ),
      });

      console.log(`✅ Transactions broadcast successfully`);
      console.log(`   Transaction hashes: ${commitResponse.txHashes.join(', ')}`);
      
    }

    // Step 5: Poll swap state
    console.log('\n👀 Step 5: Polling swap state...');
    let currentState = 'CREATED';
    let pollCount = 0;

    while (currentState !== 'CLAIMED' && currentState !== 'REFUNDABLE') {
      await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds
      pollCount++;

      const stateResponse: any = await apiRequest(`/swaps/${swapId}`);
      currentState = stateResponse.state;

      console.log(`   Poll ${pollCount}: ${currentState}`);
      console.log(`   Can Refund: ${stateResponse.canRefund}`);
      console.log(`   Can Claim: ${stateResponse.canClaim}`);
    }

    if (currentState === 'CLAIMED') {
      console.log('\n🎉 SUCCESS! Swap completed successfully!');
    } else if (currentState === 'REFUNDABLE') {
      console.log('\n⚠️  Swap is refundable - LP did not complete payment');
    } else {
      console.log(`\n⏱️  Test ended with state: ${currentState}`);
    }

  } catch (error: any) {
    console.error('\n❌ Error during test:', error.message);
    console.error(error);
    process.exit(1);
  }
}

// Run the test
testCommitFlow().then(() => {
  console.log('\n✅ Test completed');
  process.exit(0);
}).catch((error) => {
  console.error('\n❌ Test failed:', error);
  process.exit(1);
});
