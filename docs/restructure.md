New Directory Structure Proposal

 atomiq-rest-api/
 ├── src/
 │   ├── index.ts                    # Entry point (minimal logic)
 │   ├── App.ts                      # Express app setup (like Runner)
 │   ├── AppWrapper.ts               # API routes & middleware (like RunnerWrapper)
 │   ├── chains/                     # Multi-chain support (registry pattern) >flatten
 │   │   ├── ChainRegistry.ts        # Chain registration & types
 │   │   ├── starknet/
 │   │   │   ├── StarknetHandler.ts  # Starknet transaction handling
 │   │   │   └── StarknetTypes.ts    # Starknet-specific types
 │   │   └── solana/
 │   │       ├── SolanaHandler.ts    # Solana transaction handling (TODO)
 │   │       └── SolanaTypes.ts      # Solana-specific types
 │   ├── swaps/                       # Swap type handlers (extensible)
 │   │   ├── SwapRegistry.ts         # Swap type registration >xxx
 │   │   ├── ToBtcOnchain.ts         # BTC on-chain swaps (TODO)
 │   │   ├── FromBtcOnchain.ts       # From BTC on-chain (TODO)
 │   │   ├── ToBtcLightning.ts       # Lightning swaps (TODO)
 │   │   └── FromBtcLightning.ts     # From Lightning (TODO)
 │   ├── api/                         # REST API layer
 │   │   ├── SwapApi.ts               # Swap endpoints (quotes, commit, state)
 │   │   ├── TokenApi.ts              # Token & limits endpoints
 │   │   └── HealthApi.ts             # Health check endpoint
 │   ├── http/                        # HTTP middleware
 │   │   ├── ErrorHandler.ts         # Global error handling
 │   │   ├── RateLimiter.ts          # Rate limiting (future)
 │   │   └── BodySizeLimiter.ts      # Body size limiting (future)
 │   ├── sdk/                         # SDK integration
 │   │   └── SdkService.ts            # SwapperFactory initialization
 │   ├── utils/                       # Utility functions
 │   │   ├── TransactionUtils.ts     # TX serialization & metadata
 │   │   ├── StateUtils.ts            # State name mapping
 │   │   └── TokenUtils.ts            # Token amount conversions
 │   └── types/                       # Shared TypeScript types
 │       ├── ApiTypes.ts              # REST API request/response types
 │       └── CommonTypes.ts           # Cross-cutting types
 ├── config/                          # Configuration files
 │   ├── config.yaml                  # Default config
 │   ├── config.regtest.yaml          # Regtest config
 │   ├── config.testnet.yaml          # Testnet config
 │   └── config.mainnet.yaml          # Mainnet config
 ├── scripts/                         # Test/utility scripts
 │   └── TestCommitFlow.ts            # E2E test script
 ├── storage/                         # SQLite databases (gitignored)
 ├── dist/                            # Compiled output (gitignored)
 ├── package.json
 ├── tsconfig.json
 ├── Dockerfile
 ├── docker-compose.yml
 └── README.md
