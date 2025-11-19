/**
 * Test script for FROM_BTCLN cooperative refund mechanism
 *
 * This script demonstrates:
 * 1. Creating a Lightning Network → Starknet STRK swap using SDK
 * 2. Paying the LN invoice (held by LP in HODL invoice)
 * 3. Committing the swap on-chain (locking security deposit)
 * 4. Signing a cooperative refund authorization
 * 5. Submitting the refund before timelock expires
 */

import { RpcProvider } from 'starknet';
import dotenv from 'dotenv';
import * as fs from "fs";
import { StarknetKeypairWallet, StarknetSigner } from "@atomiqlabs/chain-starknet";
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

async function main() {
    console.log('\n🚀 Starting FROM_BTCLN Cooperative Refund Test\n');

    // Initialize the swapper
    await swapper.init();

    const dstToken = Tokens.STARKNET.STRK;

    // Step 1: Create swap quote
    console.log('📝 Step 1: Creating swap quote...');
    const swap = await swapper.swap(
        Tokens.BITCOIN.BTCLN, // Swap from BTC-LN
        dstToken,              // Into STRK on Starknet
        BigInt(3000),          // 3000 sats (0.00003 BTC)
        SwapAmountType.EXACT_IN,
        undefined,             // Source address not used for BTC-LN
        starknetWallet.address // Destination address
    );

    // Display swap details
    console.log(`✅ Swap created: ${swap.getId()}`);
    console.log(`   Input: ${swap.getInputWithoutFee()} sats`);
    console.log(`   Fees: ${swap.getFee().amountInSrcToken} sats`);
    for(let fee of swap.getFeeBreakdown()) {
        console.log(`       - ${FeeType[fee.type]}: ${fee.fee.amountInSrcToken} sats`);
    }
    console.log(`   Input with fees: ${swap.getInput()} sats`);
    console.log(`   Output: ${swap.getOutput()} STRK`);
    console.log(`   Quote expiry: ${swap.getQuoteExpiry()} (in ${(swap.getQuoteExpiry()-Date.now())/1000} seconds)`);

    // Step 2: Display invoice and wait for payment
    console.log('\n💡 Step 2: Pay the Lightning Network invoice');
    console.log(`   Lightning Invoice: ${swap.getAddress()}`);
    console.log(`   Hyperlink: ${swap.getHyperlink()}`);
    console.log('\n⏳ Waiting for payment from your Electrum wallet...\n');

    // Add listener for swap state changes
    swap.events.on("swapState", (swap) => {
        console.log(`   State changed: ${swap.getState()}`);
    });

    // Wait for the LP to receive the payment
    const paymentSuccess = await swap.waitForPayment();
    if(!paymentSuccess) {
        console.log('❌ Lightning network payment not received in time and quote expired!');
        await swapper.stop();
        return;
    }
    console.log('✅ Payment received by LP!\n');

    // Step 3: Commit the swap on-chain (locks security deposit)
    console.log('📝 Step 3: Committing swap on-chain...');
    console.log('   This locks your security deposit on Starknet');

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

    // Step 4: Sign cooperative refund authorization
    console.log('🔐 Step 4: Signing cooperative refund authorization...');
    console.log('   This allows the LP to refund before timelock expires');

    // Access the swap contract directly for low-level refund operations
    const swapContract = swap.wrapper.contract;

    // Wrap wallet in a signer for signing operations
    const signer = new StarknetSigner(starknetWallet);

    // Sign refund authorization (valid for 10 minutes)
    const refundAuth = await swapContract.Refund.signSwapRefund(
        signer,      // Signer (must be the claimer)
        swapData,    // Swap data
        600          // Authorization timeout: 10 minutes
    );

    console.log(`✅ Refund authorization signed:`);
    console.log(`   Prefix: ${refundAuth.prefix}`);
    console.log(`   Timeout: ${refundAuth.timeout} (${new Date(parseInt(refundAuth.timeout) * 1000).toISOString()})`);
    console.log(`   Signature: ${refundAuth.signature.substring(0, 50)}...`);

    // Step 5: Submit refund with authorization
    console.log('\n📤 Step 5: Submitting cooperative refund...');

    // Get refund transactions
    const refundTxs = await swapContract.Refund.txsRefundWithAuthorization(
        starknetWallet.address,  // Signer address
        swapData,                // Swap data
        refundAuth.timeout,      // Timeout from authorization
        refundAuth.prefix,       // Prefix from authorization
        refundAuth.signature,    // Signature from authorization
        true,                    // Check if swap is committed
        undefined                // feeRate (optional)
    );

    console.log(`   Generated ${refundTxs.length} refund transaction(s)`);

    // Execute refund transactions
    for(let i = 0; i < refundTxs.length; i++) {
        const tx = refundTxs[i];
        console.log(`   Executing refund transaction ${i + 1}/${refundTxs.length}...`);

        if(tx.type === "INVOKE") {
            const result = await starknetWallet.execute(tx.tx, tx.details);
            console.log(`   ✅ Transaction confirmed: ${result.transaction_hash}`);
        } else if(tx.type === "DEPLOY_ACCOUNT") {
            const result = await starknetWallet.deployAccount(tx.tx, tx.details);
            console.log(`   ✅ Deploy account confirmed: ${result.transaction_hash}`);
        }
    }

    // Step 6: Verify refund
    console.log('\n✅ Step 6: Verifying refund...');

    // Check if swap is now refunded/expired on-chain
    const isExpired = await swapContract.isExpired(starknetWallet.address, swapData);
    console.log(`   On-chain expired status: ${isExpired}`);

    const commitStatus = await swapContract.getCommitStatus(starknetWallet.address, swapData);
    console.log(`   Commit status: ${commitStatus.type}`);

    console.log('\n🎉 SUCCESS! Cooperative refund completed!');
    console.log('\nWhat happened:');
    console.log('✅ LP refunded tokens on-chain');
    console.log('✅ LP canceled Lightning HODL invoice (your payment will return)');
    console.log('❌ You lost your security deposit (penalty for not claiming)');
    console.log('\nThis is the cooperative refund path - much faster than waiting for timelock!');

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
