# VeraScore v2

> AI-powered on-chain credit scoring for Polkadot Hub — OpenGuild Polkadot Solidity Hackathon 2026

**Live demo:** `https://YOUR_FRONTEND_URL`  
**Backend API:** `https://YOUR_BACKEND_URL`  
**GitHub:** `https://github.com/Agihtaws/VeraScore`  
**Chain:** Polkadot Hub TestNet (Chain ID `420420417`, Paseo Asset Hub)  
**Explorer:** [polkadot.testnet.routescan.io](https://polkadot.testnet.routescan.io)

---

## What Is VeraScore?

VeraScore reads your Polkadot Hub wallet history — native balance, USDT/USDC holdings, transaction count, account age, metadata complexity — and feeds it to **Mistral AI** to generate a credit score from **0–1100**.

The score is minted as a **soulbound NFT** on Polkadot Hub TestNet via a backend-controlled issuer key. Scores expire after **2 hours** and can be refreshed after a **5‑minute cooldown**. A leaderboard ranks all scored wallets on-chain.

The entire flow runs on Solidity contracts deployed to Polkadot Hub's EVM, queried via the Polkadot API (`polkadot-api`) and served through a Viem + Wagmi frontend.

---

## Architecture

```
Frontend (Vite + React + Wagmi + Viem)
    │
    ├── reads chain state directly via Viem public client (RPC)
    ├── wallet connect via MetaMask (injected) or WalletConnect
    └── calls Backend API for:
            score minting, leaderboard, stablecoin transfers, fee info

Backend (Node.js + Express + TypeScript)
    │
    ├── polkadot-api (PAPI)   → reads Substrate storage (balances, assets, nonce)
    ├── ethers.js             → calls EVM contracts (ScoreNFT, LendingPool)
    ├── @polkadot/api         → signs & submits Substrate extrinsics (assets.transfer)
    ├── Mistral AI            → generates score + reasoning from chain data
    └── better-sqlite3        → caches scores, history, leaderboard

Contracts (Solidity ^0.8.20, deployed via Hardhat)
    ├── ScoreNFT v3 (proxy)   → soulbound score NFT, breakdown tracking
    └── LendingPool           → collateral deposit / borrow / repay / withdraw
```

---

## Contracts (TestNet)

| Contract | Address |
|---|---|
| ScoreNFT v3 Proxy | `0xbb778Ec1482bbdF08527c1cac1569662caf1faAE` |
| LendingPool | `0xE4a4E3455B0928d02E18C7d0af55a0840cf4de47` |
| USDT Precompile (asset 1984) | `0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF07C0` |
| USDC Precompile (asset 1337) | `0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF0539` |

**RPC:** `https://services.polkadothub-rpc.com/testnet`  
**WS:** `wss://asset-hub-paseo.dotters.network`

---

## Score Breakdown

| Category | Max Points |
|---|---|
| Transaction Activity | 200 |
| USDT Holding | 200 |
| Account Complexity | 200 |
| Native Balance | 150 |
| USDC Holding | 150 |
| Account Age | 100 |
| Runtime Modernity | 100 |
| **Total** | **1100** |

- **Validity period:** 2 hours (testnet, configurable for mainnet)
- **Cooldown:** 5 minutes after the previous mint
- **Backend rate limit:** 3 score requests per hour per address (failed attempts do **not** count)

---

## Features

### Frontend Pages

| Page | Route | Description |
|---|---|---|
| Home / Score | `home` | Connect wallet, request AI score, view NFT + breakdown |
| Score Lookup | `lookup` | Look up any address or compare two wallets |
| Leaderboard | `leaderboard` | On-chain ranking of all scored wallets |
| Lending Demo | `lending` | Deposit PAS, borrow against score, repay/withdraw |
| Send PAS | `send-pas` | Native PAS transfer via MetaMask |
| Send Stablecoin | `send-stable` | Backend-signed USDT/USDC transfer (no wallet needed) |
| Fee Calculator | `fee-calc` | Live gas estimation for all VeraScore operations |
| Create Wallet | `create-wallet` | BIP39 wallet generator, fully client-side |

### Backend API Endpoints

| Method | Path | Description |
|---|---|---|
| `POST` | `/score` | Score a wallet — reads chain, calls Mistral, returns signed payload |
| `POST` | `/score/:address/confirm` | Confirm mint (store tx hash, record breakdown on-chain) |
| `GET` | `/score/:address` | Get current score + breakdown + history |
| `GET` | `/score/leaderboard` | Top 50 scored wallets |
| `GET` | `/verify/:address` | Verify NFT exists and is not expired |
| `GET` | `/balances/:address` | USDT + USDC balance for any EVM address |
| `GET` | `/lending/:address` | Lending pool position for an address |
| `GET` | `/fee-info` | Live gas price + estimated fees per operation |
| `GET` | `/transfer/sender` | Backend wallet SS58 + current USDT/USDC balances |
| `POST` | `/transfer` | Transfer USDT or USDC from backend wallet |
| `GET` | `/health` | Health check |

---

## Project Structure

```
verascore-v2/
├── frontend/                        # Vite + React + TypeScript
│   ├── src/
│   │   ├── pages/
│   │   │   ├── Home.tsx             # Score page (connected + disconnected)
│   │   │   ├── Lookup.tsx           # Score lookup + compare
│   │   │   ├── Leaderboard.tsx      # On-chain leaderboard
│   │   │   ├── LendingDemo.tsx      # Lending pool UI
│   │   │   ├── SendPAS.tsx          # Native token transfer
│   │   │   ├── SendStablecoin.tsx   # Backend-signed stablecoin transfer
│   │   │   ├── FeeCalculator.tsx    # Gas estimator
│   │   │   └── CreateWallet.tsx     # BIP39 wallet generator
│   │   ├── components/
│   │   │   ├── Sidebar.tsx          # Navigation
│   │   │   ├── ScoreCard.tsx        # Score + breakdown display
│   │   │   ├── NFTViewer.tsx        # On-chain NFT metadata viewer
│   │   │   └── HistoryChart.tsx     # Score history sparkline
│   │   ├── hooks/
│   │   │   ├── useScore.ts          # Core scoring & minting logic
│   │   │   └── useTotalScored.ts    # Total scored wallets count
│   │   ├── utils/
│   │   │   └── wagmi.ts             # Chain config + contract addresses
│   │   └── App.tsx                  # Root, wallet connection, routing
│   ├── vite.config.ts               # Dev proxy → backend
│   └── tailwind.config.js
│
└── backend/                         # Express + TypeScript
    └── src/
        ├── routes/
        │   ├── score.ts             # Score + NFT minting (rate-limited)
        │   ├── verify.ts            # NFT verification
        │   ├── lending.ts           # Pool position reads
        │   ├── balances.ts          # USDT/USDC balance reads
        │   ├── feeInfo.ts           # Live gas data
        │   └── transfer.ts          # Substrate assets.transfer
        ├── chain/
        │   └── papiReader.ts        # PAPI: reads Substrate storage
        ├── scoring/
        │   ├── mistralScorer.ts     # Mistral AI scoring
        │   └── signer.ts            # ISSUER_PRIVATE_KEY signing
        └── db/
            └── database.ts          # SQLite score cache
```

---

## Local Setup

### Prerequisites

- Node.js ≥ 22
- MetaMask (or any injected EVM wallet)
- Mistral AI API key ([console.mistral.ai](https://console.mistral.ai))

### 1. Clone

```bash
git clone https://github.com/Agihtaws/VeraScore.git
cd VeraScore
```

### 2. Backend

```bash
cd backend
npm install
```

Create `.env`:

```env
PORT=3001
MISTRAL_API_KEY=your_mistral_api_key

# Issuer wallet — signs NFT mints and records breakdowns on-chain
ISSUER_PRIVATE_KEY=0x...your_private_key...

# Deployed contract addresses
SCORE_NFT_PROXY=0xbb778Ec1482bbdF08527c1cac1569662caf1faAE
LENDING_POOL=0xE4a4E3455B0928d02E18C7d0af55a0840cf4de47

# Polkadot Hub TestNet
RPC_URL=https://services.polkadothub-rpc.com/testnet
WS_URL=wss://asset-hub-paseo.dotters.network
```

```bash
npm run dev        # ts-node with nodemon
# or
npm run build && npm start
```

Backend runs on `http://localhost:3001`.

### 3. Frontend

```bash
cd frontend
npm install
```

Create `.env`:

```env
VITE_SCORE_NFT_PROXY=0xbb778Ec1482bbdF08527c1cac1569662caf1faAE
VITE_LENDING_POOL=0xE4a4E3455B0928d02E18C7d0af55a0840cf4de47
VITE_WALLETCONNECT_PROJECT_ID=        # optional
```

```bash
npm run dev        # Vite dev server on http://localhost:5173
```

The Vite dev proxy forwards `/score`, `/verify`, `/balances`, `/lending`, `/fee-info`, `/transfer` to `localhost:3001`.

```bash
npm run build      # Production build → dist/
```

---

## Demo Walkthrough

The recommended demo flow to showcase all features:

1. **Score Wallet A** — connect `0x16fe…4c9f73`, hit *Get My Score*, watch Mistral reason about the wallet history, see the soulbound NFT mint on-chain.
2. **Send USDT to Wallet B** — go to Send Stablecoin, send USDT from backend wallet to `0x63ee…4a67`.
3. **Score Wallet B** — connect Wallet B, score it — higher USDT holding pushes the score up.
4. **Compare** — go to Lookup → Compare mode, paste both addresses side-by-side.

---

## Key Technical Notes

### EVM → SS58 Address Conversion

Polkadot's Substrate pallets use SS58 addresses, not EVM `0x` addresses. The correct conversion pads the 20-byte EVM address to 32 bytes (left-aligned, zero-padded on the right):

```typescript
const hex   = evmAddress.toLowerCase().replace('0x', '');
const bytes = new Uint8Array(32);
for (let i = 0; i < 20; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
const ss58 = encodeAddress(bytes, 42);
// ⚠  evmToAddress() from @polkadot/util-crypto uses a DIFFERENT encoding — do NOT use it
```

### Stablecoin Transfers

USDT and USDC on Polkadot Hub live in the **Substrate Assets pallet**, not as standard ERC-20 contracts. The backend uses `@polkadot/api` to call `assets.transfer(assetId, dest, amount)` — signed with the issuer key — making wallet-less transfers possible from the UI.

### Score NFT

The ScoreNFT is soulbound (non-transferable). It stores:
- `score` (uint16, 0–1100)
- `issuedAt` / `expiresAt` (unix timestamps, **2 hours TTL** on testnet)
- `dataHash` (keccak256 of the raw chain data used for scoring)
- Per-category `breakdown[6]` recorded via a separate `recordBreakdown` call after minting

### Score Expiry & Cooldown (TestNet)

| Parameter | Value |
|---|---|
| Validity duration | **2 hours** |
| Cooldown after mint | **5 minutes** |
| Backend rate limit | 3 requests per hour (failed attempts **not** counted) |

The contract enforces the cooldown; the backend rate limiter prevents excessive new scoring attempts even if the contract would allow it. The frontend displays live countdowns for both.

### Gas on Polkadot Hub TestNet

- Block time: ~12–15 seconds
- Gas price: ~1 Gwei (very cheap)
- Typical operations: transfer ~21k gas, NFT mint ~145k gas, lending deposit ~95k gas

---

## Stack

| Layer | Technology |
|---|---|
| Frontend framework | React 18 + TypeScript + Vite |
| Styling | Tailwind CSS v3 |
| Wallet / chain reads | Wagmi v2 + Viem 2.38 |
| Backend runtime | Node.js 22 + Express 4 |
| Chain reads (Substrate) | polkadot-api (PAPI) v1 |
| Chain reads (EVM) | ethers.js v6 |
| Substrate transactions | @polkadot/api v14 |
| AI scoring | Mistral AI (`mistral-large-latest`) |
| Score cache | better-sqlite3 |
| Contracts | Solidity 0.8.20, Hardhat + Ignition |

---

## License

MIT — built for the OpenGuild Polkadot Solidity Hackathon 2026.