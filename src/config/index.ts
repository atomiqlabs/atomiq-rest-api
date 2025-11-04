import dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config();

export interface AppConfig {
  // Server
  port: number;
  host: string;
  nodeEnv: string;

  // Storage
  storage: {
    type: string;
    path: string;
  };

  // SDK
  sdk: {
    network: "MAINNET" | "TESTNET" | "TESTNET4" | "REGTEST";
    lpDiscoveryUrl?: string;
    mempoolApi?: string;
  };

  // Chain RPCs
  chains: {
    starknetRpc: string;
    solanaRpc: string;
  };

  // Logging
  logLevel: string;

  // CORS
  corsOrigin: string;

  // Rate limiting
  rateLimit: {
    windowMs: number;
    maxRequests: number;
  };
}

export const config: AppConfig = {
  port: parseInt(process.env.PORT || '3000', 10),
  host: process.env.HOST || '0.0.0.0',
  nodeEnv: process.env.NODE_ENV || 'development',

  storage: {
    type: process.env.STORAGE_TYPE || 'sqlite',
    path: process.env.STORAGE_PATH || path.join(process.cwd(), 'data', 'swaps.db'),
  },

  sdk: {
    network: process.env.ATOMIQ_NETWORK as "MAINNET" | "TESTNET" | "TESTNET4" | "REGTEST",
    lpDiscoveryUrl: process.env.LP_DISCOVERY_URL,
    mempoolApi: process.env.MEMPOOL_API!,
  },

  chains: {
    starknetRpc: process.env.STARKNET_RPC || 'http://localhost:5050',
    solanaRpc: process.env.SOLANA_RPC || 'http://localhost:8899',
  },

  logLevel: process.env.LOG_LEVEL || 'info',
  corsOrigin: process.env.CORS_ORIGIN || '*',

  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10),
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100', 10),
  },
};

export default config;
