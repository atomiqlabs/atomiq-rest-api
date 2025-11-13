import { BitcoinNetwork, SwapperFactory, MempoolApi } from '@atomiqlabs/sdk';
import { StarknetInitializer, StarknetInitializerType } from '@atomiqlabs/chain-starknet';
import { RpcProvider } from 'starknet';
import { SqliteStorageManager, SqliteUnifiedStorage } from '@atomiqlabs/storage-sqlite';
import { config } from '../config';

console.log('[SdkService] Initializing Atomiq SDK...');
console.log(`[SdkService] Network: ${config.sdk.network}`);
console.log(`[SdkService] Starknet RPC: ${config.chains.starknetRpc}`);

// Create SwapperFactory with Starknet initializer
// Note: Solana can be added here in the future if needed
const Factory = new SwapperFactory<[StarknetInitializerType]>([
  StarknetInitializer
]);

// const Tokens = Factory.Tokens;
// console.log('[SdkService] Tokens:', Tokens);

// Initialize RPC connection
export const starknetRpc = new RpcProvider({ nodeUrl: config.chains.starknetRpc });

// Determine Bitcoin network based on config
const bitcoinNetwork = BitcoinNetwork[config.sdk.network];
// Create swapper instance with proper configuration
export const swapper = Factory.newSwapper({
  chains: {
    STARKNET: {
      rpcUrl: starknetRpc
      // Contract addresses will be automatically loaded for mainnet/testnet/sepolia
      // For custom networks, they can be specified here via env variables
    }
  },
  bitcoinNetwork,

  // NodeJS requires SQLite storage (browser uses IndexedDB by default)
  swapStorage: (chainId: string) => new SqliteUnifiedStorage(`CHAIN_${chainId}.sqlite3`),
  chainStorageCtor: (name: string) => new SqliteStorageManager(`STORE_${name}.sqlite3`),

  // Optional: Custom LP discovery URL if specified
  ...(config.sdk.lpDiscoveryUrl && {
    registryUrl: config.sdk.lpDiscoveryUrl
  }),

  mempoolApi: config.sdk.mempoolApi==null ? undefined : new MempoolApi(config.sdk.mempoolApi)
});

