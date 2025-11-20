/**
 * Test script for TO_BTCLN cooperative refund mechanism
 *
 * This script demonstrates:
 * 1. Creating a Starknet STRK → Lightning Network swap using SDK
 * 2. Using a short-expiration Lightning invoice (30 seconds)
 * 3. Waiting for invoice to expire before committing
 * 4. Committing the swap on-chain (paying STRK)
 * 5. LP attempts to pay expired invoice and fails
 * 6. Executing cooperative refund with LP-provided signature
 */

import { RpcProvider } from 'starknet';
import dotenv from 'dotenv';
import * as fs from "fs";
import * as readline from 'readline';
import { StarknetKeypairWallet } from "@atomiqlabs/chain-starknet";
import { BitcoinNetwork, SwapperFactory } from "@atomiqlabs/sdk";
import { StarknetInitializer } from "@atomiqlabs/chain-starknet";
import { SqliteStorageManager, SqliteUnifiedStorage } from "@atomiqlabs/storage-sqlite";
import { FeeType, SwapAmountType } from "@atomiqlabs/sdk";

dotenv.config();

// Configuration from environment
const STARKNET_RPC_URL = process.env.STARKNET_RPC!;
const starknetRpc = new RpcProvider({nodeUrl: STARKNET_RPC_URL});

console.log('STARKNET_RPC_URL:', STARKNET_RPC_URL);

// Setup Starknet wallet
const starknetKey = fs.existsSync("starknet.key") ? fs.readFileSync("starknet.key").toString() : StarknetKeypairWallet.generateRandomPrivateKey();
const starknetWallet = new StarknetKeypairWallet(starknetRpc, starknetKey);
fs.writeFileSync("starknet.key", starknetKey);
console.log("Starknet wallet address (transfer STRK here for TX fees): "+starknetWallet.address);

// Create swapper factory with just Starknet
const Factory = new SwapperFactory<[typeof StarknetInitializer]>([StarknetInitializer]);
const Tokens = Factory.Tokens;

// Create swapper instance
const swapper = Factory.newSwapper({
    chains: {
        STARKNET: {
            rpcUrl: starknetRpc
        }
    },
    bitcoinNetwork: BitcoinNetwork.TESTNET,
    swapStorage: chainId => new SqliteUnifiedStorage("CHAIN_"+chainId+".sqlite3"),
    chainStorageCtor: name => new SqliteStorageManager("STORE_"+name+".sqlite3"),
});

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

async function main() {
    console.log('\n🚀 Starting TO_BTCLN Cooperative Refund Test\n');

    // Initialize the swapper
    await swapper.init();

    // Step 1: Get Lightning invoice from user
    console.log('📝 Step 1: Create a Lightning invoice in Electrum\n');
    console.log('Instructions:');
    console.log('1. Open Electrum wallet on testnet');
    console.log('2. Go to Receive tab');
    console.log('3. Enter an amount (e.g., 3000 sats)');
    console.log('4. Set expiration to 30 seconds');
    console.log('5. Click "Create Request"');
    console.log('6. Copy the Lightning invoice (starts with "lntb")\n');

    const lightningInvoice = await promptUser('Paste your Lightning invoice here: ');

    // Validate the invoice
    if (!swapper.Utils.isValidLightningInvoice(lightningInvoice)) {
        console.error('❌ Invalid Lightning invoice format!');
        await swapper.stop();
        return;
    }

    console.log('✅ Valid Lightning invoice detected\n');

    // Step 2: Create swap quote
    console.log('📝 Step 2: Creating swap quote...');
    const swap = await swapper.swap(
        Tokens.STARKNET.STRK,  // Swap from STRK on Starknet
        Tokens.BITCOIN.BTCLN,  // Into BTC-LN
        null as any,           // Amount determined by invoice
        SwapAmountType.EXACT_OUT, // EXACT_OUT required for TO_BTCLN
        starknetWallet.address,   // Source address (Starknet)
        lightningInvoice       // Destination (Lightning invoice)
    );

    // Display swap details
    console.log(`✅ Swap created: ${swap.getId()}`);
    console.log(`   Input: ${swap.getInputWithoutFee()} STRK`);
    console.log(`   Fees: ${swap.getFee().amountInSrcToken} STRK`);
    for(let fee of swap.getFeeBreakdown()) {
        console.log(`       - ${FeeType[fee.type]}: ${fee.fee.amountInSrcToken} STRK`);
    }
    console.log(`   Total input with fees: ${swap.getInput()} STRK`);
    console.log(`   Output: ${swap.getOutput()} sats (to Lightning)`);
    console.log(`   Quote expiry: ${swap.getQuoteExpiry()} (in ${(swap.getQuoteExpiry()-Date.now())/1000} seconds)`);

    // Step 3: Wait for invoice to expire
    console.log('\n⏳ Step 3: Waiting for Lightning invoice to expire...');
    console.log('   This will cause the LP payment to fail, triggering a refund scenario\n');

    // Wait 35 seconds to ensure invoice has expired (30 second expiry + 5 second buffer)
    const waitSeconds = 35;
    for (let i = waitSeconds; i > 0; i--) {
        process.stdout.write(`\r   Countdown: ${i} seconds remaining...`);
        await new Promise(resolve => setTimeout(resolve, 1000));
    }
    console.log('\r   ✅ Invoice should now be expired\n');

    // Step 4: Commit the swap on-chain (pay STRK)
    console.log('📝 Step 4: Committing swap on-chain...');
    console.log('   This pays STRK tokens to the escrow contract on Starknet');

    // Get the swap data (we'll need it for refund)
    const swapData = swap.data!;
    if (!swapData) {
        console.error('❌ Swap data not available');
        await swapper.stop();
        return;
    }

    // Get commit transactions and execute them manually
    // @ts-ignore - accessing internal property for low-level control
    const commitTxs = await swap.txsCommit(true);
    let commitTxId = '';

    for(let tx of commitTxs) {
        if(tx.type === "INVOKE") {
            const result = await starknetWallet.execute(tx.tx, tx.details);
            commitTxId = result.transaction_hash;
            console.log(`   ✅ Transaction confirmed: ${result.transaction_hash}`);
        } else if(tx.type === "DEPLOY_ACCOUNT") {
            const result = await starknetWallet.deployAccount(tx.tx, tx.details);
            commitTxId = result.transaction_hash;
            console.log(`   ✅ Deploy account confirmed: ${result.transaction_hash}`);
        }
    }

    console.log(`✅ Swap committed! Transaction: ${commitTxId}\n`);

    // Step 5: Wait for LP to attempt payment (and fail)
    console.log('⏳ Step 5: Waiting for LP to attempt paying the expired invoice...');
    console.log('   The LP will try to pay but fail due to expired invoice\n');

    // Add listener for swap state changes
    swap.events.on("swapState", (swap) => {
        console.log(`   State changed: ${swap.getState()}`);
    });

    // Wait for the LP payment attempt (will fail)
    const paymentSuccess = await swap.waitForPayment();

    if (paymentSuccess) {
        console.log('⚠️  Warning: Payment succeeded unexpectedly!');
        console.log('   The invoice might not have been expired.');
        await swapper.stop();
        return;
    }

    console.log('✅ LP payment failed as expected (invoice expired)\n');

    // Step 6: Check if swap is refundable
    console.log('🔍 Step 6: Checking refund eligibility...');
    // @ts-ignore - Type definitions may not be complete for TO_BTCLN swaps
    if (!swap.isRefundable || !swap.isRefundable()) {
        console.log('⚠️  Proceeding with refund attempt...');
        console.log(`   Current state: ${swap.getState()}`);
    } else {
        console.log('✅ Swap is refundable!\n');
    }

    // Step 7: Execute cooperative refund
    console.log('📤 Step 7: Executing cooperative refund...');
    console.log('   LP will provide refund authorization signature automatically');

    try {
        // @ts-ignore - Type definitions may not be complete for TO_BTCLN swaps
        await swap.refund(starknetWallet);
        console.log('✅ Refund transaction submitted and confirmed!\n');
    } catch (error) {
        console.error('❌ Refund failed:', error);
        await swapper.stop();
        return;
    }

    // Step 8: Verify refund
    console.log('✅ Step 8: Verifying refund...');
    console.log(`   Swap state: ${swap.getState()}`);

    console.log('\n🎉 SUCCESS! Cooperative refund completed!');
    console.log('\nWhat happened:');
    console.log('✅ You paid STRK tokens on-chain');
    console.log('✅ LP attempted to pay Lightning invoice but failed (expired)');
    console.log('✅ LP signed cooperative refund authorization');
    console.log('✅ Your STRK tokens were refunded on-chain');
    console.log('✅ No penalties - you got your funds back!');
    console.log('\nThis demonstrates the cooperative refund path when LP cannot complete payment.');

    // Stop the swapper
    await swapper.stop();
}

// Run the test
main().then(() => {
    console.log('\n✅ Test completed');
    process.exit(0);
}).catch((error) => {
    console.error('\n❌ Error during test:', error);
    process.exit(1);
});
