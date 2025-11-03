# Atomiq REST API Middleware - Concept Document

## Project Goal

Enable wallet integrators (like Xverse) to integrate Atomiq cross-chain swaps without embedding the SDK directly in their applications. The middleware allows wallets to become "thin clients" that only handle transaction signing, while the middleware manages all swap complexity.

**Primary Objective**: Drive wallet integrations to increase the volume of Atomiq swaps.

## Requirements

### Core Requirements

1. **Dockerized Node.js/Express service** running Atomiq SDK
2. **REST API** exposing swap operations
3. **Client = "just a signer"** - signs transactions and returns them to middleware
4. **Stateless middleware** - all persistence handled by Atomiq SDK
5. **Single-tenant deployment** model (each integrator runs own instance)
6. **Client-side polling** for swap state updates
7. **No authentication** initially (add for production)

### Key User Flows

#### 1. Quote Creation Flow
```
Client → POST /api/v1/quotes → Middleware
   ↓
Middleware calls SDK → Creates swap → Returns quote + unsigned txs
   ↓
Client ← Receives quote with unsigned transactions
```

#### 2. Swap Commit Flow
```
Client signs transactions locally
   ↓
Client → POST /api/v1/swaps/:id/commit (with signedTxs) → Middleware
   ↓
Middleware broadcasts to blockchain → Updates state
   ↓
Client ← Receives confirmation
```

#### 3. Status Polling Flow
```
Client → GET /api/v1/swaps/:id → Middleware
   ↓
Middleware queries SDK/storage → Returns current state
   ↓
Client ← Receives state + actions needed
```

#### 4. Refund Flow (if needed)
```
Client → GET /api/v1/swaps/:id/txs/refund → Middleware
   ↓
Middleware returns unsigned refund txs
   ↓
Client signs → POST /api/v1/swaps/:id/refund → Middleware
   ↓
Middleware broadcasts refund → Updates state
```

## Architecture

### System Components

```
┌─────────────────────────────────────────────────────────────┐
│                 Wallet/Client Application                   │
│                  (iOS/Android/Web/Desktop)                  │
│                                                             │
│  Responsibilities:                                          │
│  - Display swap UI                                          │
│  - Sign transactions                                        │
│  - Poll for status updates                                  │
└──────────────────────┬──────────────────────────────────────┘
                       │ HTTP/REST (JSON)
                       │
┌──────────────────────▼──────────────────────────────────────┐
│     Atomiq REST API Middleware (Express) [STATELESS]       │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │            API Layer (Express + Routes)             │   │
│  │  - Quote management endpoints                       │   │
│  │  - Swap state endpoints                             │   │
│  │  - Transaction submission endpoints                 │   │
│  │  - Utility endpoints                                │   │
│  └──────────────┬──────────────────────────────────────┘   │
│                 │                                           │
│  ┌──────────────▼──────────────┐                           │
│  │     SwapService             │                           │
│  │  [Stateless REST wrapper]   │                           │
│  │  - Create quotes            │                           │
│  │  - Query swap state         │                           │
│  │  - Broadcast transactions   │                           │
│  │  - No persistence logic     │                           │
│  └──────────────┬──────────────┘                           │
│                 │                                           │
│  ┌──────────────▼──────────────┐                           │
│  │       SdkService            │                           │
│  │  - Initialize Swapper       │                           │
│  └──────────────┬──────────────┘                           │
│                 │                                           │
└─────────────────┼───────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────┐
│             Atomiq SDK [Handles ALL Storage]                │
│                                                             │
│  - Swapper (main orchestrator)                              │
│  - Token management                                         │
│  - Fee calculations                                         │
│  - Swap state machines (ToBTC, FromBTC, etc.)               │
│  - Chain integrations (Starknet, Solana, Bitcoin)           │
│  - Built-in SQLite storage for swaps                        │
│  - Persistent state management                              │
└─────────────────────┬───────────────────────────────────────┘
                      │
        ┌─────────────┼─────────────┐
        │             │             │
        ▼             ▼             ▼
┌──────────────┐ ┌─────────┐ ┌──────────────┐
│  LP Nodes    │ │ Bitcoin │ │ Smart Chains │
│  (HTTP API)  │ │ Network │ │ (RPC)        │
└──────────────┘ └─────────┘ └──────────────┘
```

### Data Flow

1. **Initialization**:
   - Middleware starts → Initializes SDK with storage config → SDK creates databases → Ready to serve

2. **Quote Request**:
   - Client sends quote params → Middleware calls `swapper.swap()` → SDK queries LPs → Returns best quote
   - SDK automatically stores swap → Middleware returns quote + unsigned txs to client

3. **Commit**:
   - Client signs txs → Sends to middleware → Middleware broadcasts to network/LP → Waits for confirmation
   - SDK automatically updates state internally → Client polls for status

4. **Payment Wait**:
   - Client polls status → Middleware calls `swapper.getSwapById()` → SDK returns current state from storage
   - LP processes payment → Bitcoin tx confirmed → SDK updates state to CLAIMED

5. **Completion**:
   - Client polls and sees CLAIMED state → Swap complete

**Key Point**: Middleware is stateless - all persistence happens inside the SDK. The middleware just wraps SDK method calls with a REST interface.

## Storage Design

**Handled entirely by Atomiq SDK** - no custom storage needed in middleware.

When initializing the SDK in `SdkService.ts`:

```typescript
Factory.newSwapper({
  // SDK's built-in storage per chain
  swapStorage: (chainId: string) =>
    new SqliteUnifiedStorage(`chain_${chainId}.db`),

  // SDK's chain state storage
  chainStorageCtor: (name: string) =>
    new SqliteStorageManager(`store_${name}.db`)
})
```

The SDK provides:
- `swapper.getSwapById(id)` - Retrieve any swap by ID
- `swapper.getAllSwaps(address)` - Query swaps for an address
- Automatic persistence on state changes
- Built-in SQLite storage
- Indexed queries for performance

**Middleware:**
- Stateless REST wrapper
- Calls SDK methods directly
- Returns SDK responses as JSON
- Caches SDK swap objects in memory for performance

## API Specification

### Endpoints Summary

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/health` | Health check |
| POST | `/api/v1/quotes` | Create swap quote |
| GET | `/api/v1/swaps` | List swaps (with filters) |
| GET | `/api/v1/swaps/:id` | Get swap state |
| GET | `/api/v1/swaps/:id/txs/commit` | Get unsigned commit txs |
| POST | `/api/v1/swaps/:id/commit` | Submit signed commit txs |
| GET | `/api/v1/swaps/:id/txs/refund` | Get unsigned refund txs |
| POST | `/api/v1/swaps/:id/refund` | Submit signed refund txs |
| GET | `/api/v1/limits` | Get swap limits |
| GET | `/api/v1/tokens` | List supported tokens |


## Configuration

### Environment Variables

```bash
# Server
PORT=3000                    # HTTP port
HOST=0.0.0.0                 # Bind address
NODE_ENV=production          # Environment

# Storage
STORAGE_TYPE=sqlite          # Storage backend
STORAGE_PATH=./data/swaps.db # SQLite file path

# Atomiq SDK
ATOMIQ_NETWORK=mainnet       # Network (mainnet/testnet)
LP_DISCOVERY_URL=https://... # LP list URL

# Chains
STARKNET_RPC=http://...      # Starknet RPC endpoint
SOLANA_RPC=http://...        # Solana RPC endpoint
BITCOIN_RPC=http://...       # Bitcoin RPC endpoint

# Logging
LOG_LEVEL=info               # Log verbosity

# CORS
CORS_ORIGIN=*                # Allowed origins

# Rate Limiting
RATE_LIMIT_WINDOW_MS=60000   # Window in ms
RATE_LIMIT_MAX_REQUESTS=100  # Max requests per window
```

---

## Code Composition & Architecture

We have a classic 3-layer REST API architecture:

HTTP Layer       → Routes + Controllers
                     ↓
Business Logic   → SwapService (orchestrates SDK operations)
                     ↓
Infrastructure   → SdkService (SDK initialization)
                     ↓
Data Models      → Types/api.ts (REST contracts)

### OO Structure

Pattern: Service-based architecture with dependency injection

- Controllers - HTTP handlers, minimal logic, delegate to services
- Services - Core business logic, stateless orchestration
- SdkService - Infrastructure service (SDK initialization)
- SwapService - Domain service (swap orchestration)
- Types - Data transfer objects (DTOs), no logic

Three Key Services Explained

#### 1. SdkService.ts (Infrastructure Layer)

Purpose: Manage SDK initialization and lifecycle

Current State: Placeholder with TODO
async initialize(): Promise<any> {
   throw new Error('SDK initialization not yet implemented...');
}

Responsibility:
- Initialize SwapperFactory with chain initializers
- Set up RPC connections
- Return a Swapper<any> instance
- Shutdown/cleanup on app termination

Why it's separate: Isolates infrastructure concerns; easy to mock for testing

---
#### 2. SwapService.ts (Business Logic Layer)

Purpose: Orchestrate swap operations by translating REST requests to SDK calls

Core Operations:
Client Request
   ↓
SwapService translates to SDK calls
   ↓
Returns SDK results as REST DTOs
   ↓
Client Response

Key Methods:
- createQuote() - Calls SDK's swapper.swap(), returns unsigned transactions
- getSwapState() - Gets current state from SDK, checks if refundable/claimable
- submitCommitTransactions() - Broadcasts signed transactions, waits for confirmation
- getCommitTransactions() - Returns unsigned transactions for client signing
- querySwaps() - TODO: Query swaps by address

Design:
- Stateless (no persistent data)
- In-memory swap cache for performance
- Runtime type checking for chain-specific methods (e.g., txsCommit())

---
#### 3. app.ts (Rest initialization)

Sets up Express, initializes services, mounts routes.

const sdkService = new SdkService();
const swapper = await sdkService.initialize();  // Returns Swapper<any>
const swapService = new SwapService(swapper);   // Inject swapper
const swapController = new SwapController(swapService);  // Inject service

This dependency injection pattern makes it easy to mock/test.

---
### Type System: Do We Need All These Types?

Short answer: Not right now. We have forward-declared types for future endpoints.

Breakdown:

| Type                          | Status         | Needed Now? | Notes                          |
|-------------------------------|----------------|-------------|--------------------------------|
| QuoteRequest                  | ✅ Used         | YES         | Posted to /quotes              |
| QuoteResponse                 | ✅ Used         | YES         | Response with mocked data      |
| SwapStateResponse             | ✅ Used         | YES         | Posted to /swaps/{id}          |
| TokenIdentifier               | ✅ Used         | YES         | Part of QuoteRequest           |
| TokenData                     | ✅ Used         | YES         | In multiple responses          |
| CommitTransactionRequest      | ✅ Used         | YES         | POST /swaps/{id}/commit        |
| TransactionSubmissionResponse | ✅ Used         | YES         | Response from commit/refund    |
| HealthResponse                | ✅ Used         | YES         | GET /health                    |
| ErrorResponse                 | ✅ Used         | YES         | Error responses                |
| SwapQuoteData                 | ⚠️ Mocked      | PARTIALLY   | Currently returns mock data    |
| FeeData                       | ⚠️ Mocked      | PARTIALLY   | Currently mocked               |
| SerializedSwap                | ⚠️ Passthrough | PARTIALLY   | Comes directly from SDK        |
| FeeBreakdownItem              | ❌ Not used     | NO          | Part of detailed fee breakdown |
| PriceInfoData                 | ⚠️ Mocked      | PARTIALLY   | Mocked with zeros              |
| SwapLimitsResponse            | ❌ Not used     | NO          | Endpoint not implemented       |
| TokensResponse                | ❌ Not used     | NO          | Endpoint not implemented       |
| SwapListQuery                 | ❌ Not used     | NO          | Endpoint not implemented       |
| SwapListResponse              | ❌ Not used     | NO          | Endpoint not implemented       |

Recommendation: Keep the types. They're good documentation of the intended API contract. As features get
implemented, these go from mocked → real.

---
### Data Flow Example: Creating a Quote

1. Client POST /api/v1/quotes
   ↓ Payload: QuoteRequest

2. SwapController.createQuote()
   ↓ Calls this.swapService.createQuote(request)

3. SwapService.createQuote(request)
   ↓ Resolves tokens (TODO: implement)
   ↓ Calls swapper.swap(srcToken, dstToken, amount, ...)
   ↓ Gets unsigned transactions
   ↓ Builds SwapQuoteData (currently mocked)
   ↓ Returns QuoteResponse

4. Controller returns 200 with QuoteResponse

---
### Summary: Architecture Fit

| Component   | Role                               | Dependencies          |
|-------------|------------------------------------|-----------------------|
| Routes      | Map HTTP paths to handlers         | Controllers           |
| Controllers | Parse requests, call services      | Services              |
| SwapService | Orchestrate SDK, translate to REST | Swapper instance      |
| SdkService  | Initialize SDK                     | None (infrastructure) |
| Types       | Define REST contracts              | None                  |

Quality: Clean separation of concerns, easy to test in isolation.

What's missing: Token resolution, quote data extraction, transaction broadcasting—all marked with TODO comments in SwapService.ts.