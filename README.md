# Atomiq REST API Middleware

REST API middleware for the Atomiq SDK - enables thin client integrations for wallets and other applications.

## Overview

The Atomiq REST API Middleware allows wallet integrators to easily integrate cross-chain swap functionality without embedding the SDK directly in their applications. Clients become "just signers" that only need to sign transactions and return them to the middleware, which handles all the complexity of swap management, blockchain interactions, and liquidity provider communication.

### Key Features

- **Thin Client Architecture**: Clients only handle signing, no chain SDK integration required
- **Stateful Swap Management**: Tracks all swap states in database with pluggable storage adapters
- **Docker Deployment**: Easy containerized deployment
- **RESTful API**: Standard HTTP/JSON interface
- **Client-Side Polling**: Simple status polling model

## Quick Start

### Prerequisites

- Node.js 18+
- npm or pnpm

### Installation

```bash
# Install dependencies
npm install

# Copy environment template
cp .env.example .env

# Build
npm run build

# Start server
npm start
```

### Development Mode

```bash
# Run with hot reload
npm run dev
```

### Docker Deployment

```bash
# Build image
docker build -t atomiq-rest-api .

# Run container
docker run -d \
  -p 3000:3000 \
  -v $(pwd)/data:/app/data \
  -e STORAGE_PATH=/app/data/swaps.db \
  atomiq-rest-api

# Or use docker-compose
docker-compose up -d
```

## API Documentation

### Base URL

```
http://localhost:3000/api/v1
```

### Endpoints

#### Health Check

```http
GET /health
```

Response:
```json
{
  "status": "healthy",
  "version": "0.1.0",
  "uptime": 123456,
  "storage": true,
  "sdk": true
}
```

#### Create Swap Quote

```http
POST /quotes
```

Request:
```json
{
  "srcToken": {
    "chain": "starknet",
    "symbol": "STRK"
  },
  "dstToken": {
    "chain": "bitcoin",
    "symbol": "BTC"
  },
  "amount": "100.0",
  "amountType": "EXACT_IN",
  "srcAddress": "0x...",
  "dstAddress": "bc1..."
}
```

Response:
```json
{
  "swapId": "uuid",
  "state": "CREATED",
  "stateNumber": 0,
  "quote": {
    "input": { "..." },
    "output": { "..." },
    "fees": { "..." },
    "priceInfo": { "..." },
    "quoteExpiry": 1699999999000
  },
  "unsignedTxs": {
    "commit": [ "..." ]
  }
}
```

#### Get Swap State

```http
GET /swaps/:id
```

#### List Swaps

```http
GET /swaps?address=0x...&state=1&limit=20&offset=0
```

#### Submit Commit Transactions

```http
POST /swaps/:id/commit
```

#### Get Unsigned Commit Transactions

```http
GET /swaps/:id/txs/commit
```

#### Get Unsigned Refund Transactions

```http
GET /swaps/:id/txs/refund
```

#### Submit Refund Transactions

```http
POST /swaps/:id/refund
```

#### Get Swap Limits

```http
GET /limits?srcToken=...&dstToken=...
```

#### Get Supported Tokens

```http
GET /tokens
```

## Configuration

Configuration is managed via environment variables. See `.env.example` for all available options.

## Client Integration Example

### 1. Create Quote

```javascript
const response = await fetch('http://localhost:3000/api/v1/quotes', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    srcToken: { chain: 'starknet', symbol: 'STRK' },
    dstToken: { chain: 'bitcoin', symbol: 'BTC' },
    amount: '100.0',
    amountType: 'EXACT_IN',
    srcAddress: '0x...',
    dstAddress: 'bc1...'
  })
});

const { swapId, unsignedTxs } = await response.json();
```

### 2. Sign Transactions

```javascript
// Client-side: Sign transactions using wallet
const signedTxs = await wallet.signTransactions(unsignedTxs.commit);
```

### 3. Submit Signed Transactions

```javascript
await fetch(`http://localhost:3000/api/v1/swaps/${swapId}/commit`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ signedTxs })
});
```

### 4. Poll for Status

```javascript
const pollStatus = async () => {
  const response = await fetch(`http://localhost:3000/api/v1/swaps/${swapId}`);
  const { state, stateText, needsClientAction } = await response.json();

  console.log(`Swap state: ${stateText}`);

  if (needsClientAction) {
    // Handle refund or claim if needed
  }

  if (state === 'CLAIMED' || state === 'REFUNDED') {
    return; // Swap complete
  }

  // Poll again after 5 seconds
  setTimeout(pollStatus, 5000);
};

pollStatus();
```

## Development

### Project Structure

```
atomiq-rest-api/
├── src/
│   ├── api/
│   │   ├── controllers/      # Request handlers
│   │   ├── middleware/       # Express middleware
│   │   └── routes/           # Route definitions
│   ├── config/               # Configuration management
│   ├── services/             # Business logic layer
│   ├── storage/              # Storage adapters
│   ├── types/                # TypeScript types
│   ├── app.ts                # Express app setup
│   └── index.ts              # Entry point
├── docker/                   # Docker configs
├── docs/                     # Documentation
└── data/                     # SQLite databases
```

### Testing

```bash
# Run tests
npm test

# Integration tests (requires atomiq-sandbox)
cd ../atomiq-sandbox
./start-atomiq-stack.sh
cd ../atomiq-rest-api
npm test
```

### Building

```bash
# Clean build
npm run clean
npm run build

# Check TypeScript types
tsc --noEmit
```

## Storage Adapters

The middleware uses pluggable storage adapters. Currently supported:

- **SQLite** (default, built-in)
- **PostgreSQL** (planned)
- **MongoDB** (planned)

## Deployment

### Single-Tenant Model

Each wallet integrator should deploy their own instance of the middleware.

### Security

- Add API keys or JWT for production
- Configure CORS via environment variable
- Input validation on all endpoints
- Helmet.js for security headers

## License

ISC
