import { BitcoinNetwork, SwapperFactory, MempoolApi } from '@atomiqlabs/sdk';
import { StarknetInitializer, StarknetInitializerType } from '@atomiqlabs/chain-starknet';
import { RpcProvider } from 'starknet';
import { SqliteStorageManager, SqliteUnifiedStorage } from '@atomiqlabs/storage-sqlite';
import { AppConfig } from '../config';

// Define the chain initializers for type safety
type ChainInitializers = [StarknetInitializerType];
type Factory = SwapperFactory<ChainInitializers>;
type SwapperInstance = Awaited<ReturnType<Factory['newSwapper']>>;

/**
 * Service for initializing and managing the Atomiq SDK
 * Currently configured for Starknet only (Solana can be added later)
 */
export class SdkService {
  private swapper: SwapperInstance | null = null;
  private config: AppConfig;

  constructor(config: AppConfig) {
    this.config = config;
  }

  /**
   * Initialize the SDK Swapper with chain initializers
   */
  async initialize(): Promise<SwapperInstance> {
    console.log('[SdkService] Initializing Atomiq SDK...');
    console.log(`[SdkService] Network: ${this.config.sdk.network}`);
    console.log(`[SdkService] Starknet RPC: ${this.config.chains.starknetRpc}`);

    // Create SwapperFactory with Starknet initializer
    // Note: Solana can be added here in the future if needed
    const Factory = new SwapperFactory<[StarknetInitializerType]>([
      StarknetInitializer
    ]);

    // Initialize RPC connection
    const starknetRpc = new RpcProvider({ nodeUrl: this.config.chains.starknetRpc });

    // Determine Bitcoin network based on config
    const bitcoinNetwork = this.getBitcoinNetwork(this.config.sdk.network);

    // Create swapper instance with proper configuration
    this.swapper = Factory.newSwapper({
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
      ...(this.config.sdk.lpDiscoveryUrl && {
        registryUrl: this.config.sdk.lpDiscoveryUrl
      }),

      // Optional: Custom mempool API for testnet/regtest
      ...(bitcoinNetwork !== BitcoinNetwork.MAINNET && {
        mempoolApi: new MempoolApi(["http://localhost:8999/api/"])
      })
    });

    // Initialize the swapper (connects to LPs, checks existing swaps)
    console.log('[SdkService] Calling swapper.init()...');
    await this.swapper.init();

    console.log('[SdkService] SDK initialized successfully');
    return this.swapper;
  }

  /**
   * Map network config string to BitcoinNetwork enum
   */
  private getBitcoinNetwork(network: string): BitcoinNetwork {
    switch (network.toLowerCase()) {
      case 'mainnet':
        return BitcoinNetwork.MAINNET;
      case 'testnet':
      case 'testnet3':
        return BitcoinNetwork.TESTNET;
      case 'testnet4':
        return BitcoinNetwork.TESTNET4;
      case 'regtest':
        return BitcoinNetwork.REGTEST;
      default:
        console.warn(`[SdkService] Unknown network "${network}", defaulting to MAINNET`);
        return BitcoinNetwork.MAINNET;
    }
  }

  /**
   * Get the swapper instance
   */
  getSwapper(): SwapperInstance {
    if (!this.swapper) {
      throw new Error('SDK not initialized. Call initialize() first.');
    }
    return this.swapper;
  }

  /**
   * Check if SDK is initialized
   */
  isInitialized(): boolean {
    return this.swapper !== null;
  }

  /**
   * Shutdown SDK connections and cleanup
   */
  async shutdown(): Promise<void> {
    console.log('[SdkService] Shutting down SDK...');
    if (this.swapper) {
      await this.swapper.stop();
      this.swapper = null;
    }
  }
}
