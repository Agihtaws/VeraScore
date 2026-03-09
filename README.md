# VeraScore — AI Credit Scoring on Polkadot Hub

> **Hackathon 2026 · Polkadot Hub (PAS TestNet · Chain ID: 420420417)**

VeraScore analyses your on-chain wallet history using Mistral AI and mints a permanent, soulbound NFT credential directly on Polkadot Hub. No centralised database. No transferable token. Your score lives on-chain forever.

---

## 🔗 Links

| | |
|---|---|
| 🌐 **Live Demo** | `https://YOUR_FRONTEND_URL_HERE` |
| 🎥 **Demo Video** | `https://youtube.com/watch?v=YOUR_VIDEO_ID_HERE` |
| 💻 **GitHub** | `https://github.com/YOUR_USERNAME/verascore` |
| 🔍 **Contract on Routescan** | https://polkadot.testnet.routescan.io/address/0xbb778Ec1482bbdF08527c1cac1569662caf1faAE |

---

## 📦 Deployed Contracts — PAS TestNet

| Contract | Address | Notes |
|---|---|---|
| **ScoreNFT Proxy** (permanent) | `0xbb778Ec1482bbdF08527c1cac1569662caf1faAE` | Never changes — UUPS upgradeable |
| **ScoreNFT v3 Implementation** | `0x00b956ADBeC93EE687975546edAEEffD070B1C57` | Current logic contract |
| **VeraLendingPool** | `0xE4a4E3455B0928d02E18C7d0af55a0840cf4de47` | Demo lending protocol |

> The proxy address is what users and integrations should use. The implementation can be upgraded without changing the proxy address.

---

## 🏗 Architecture

```
┌─────────────────────────────────────────────────────┐
│  Browser (React + Viem + Wagmi)                     │
│  ├── Score page      → request + mint NFT           │
│  ├── Lookup page     → view any wallet's score      │
│  ├── Leaderboard     → top scorers on-chain         │
│  ├── Lending Demo    → borrow against score         │
│  ├── Send PAS        → native token transfer        │
│  ├── Fee Calculator  → estimate tx fees             │
│  └── Create Wallet   → onboard new users            │
└────────────────┬────────────────────────────────────┘
                 │ HTTPS
┌────────────────▼────────────────────────────────────┐
│  Backend (Express + TypeScript)                     │
│  ├── POST /:address   → score + sign EIP-712        │
│  ├── GET  /:address   → fetch score history (DB)    │
│  ├── POST /relay      → relay mint tx (backend pays)│
│  └── GET  /fee-info   → gas estimate + balance check│
└────────────────┬────────────────────────────────────┘
                 │
       ┌─────────┴──────────┐
       │                    │
┌──────▼──────┐    ┌────────▼────────┐
│ Mistral AI  │    │ Polkadot-API    │
│ (scoring)   │    │ (PAPI/WS chain  │
└─────────────┘    │  data reader)   │
                   └─────────────────┘
                            │
                   ┌────────▼────────┐
                   │  ScoreNFT v3    │
                   │  (Solidity)     │
                   │  EIP-712 mint   │
                   │  Soulbound NFT  │
                   │  On-chain SVG   │
                   └─────────────────┘
```

---

## 📁 Project Structure

```
verascore-v2/
├── contracts/               # Hardhat project
│   ├── contracts/
│   │   ├── ScoreNFTv3.sol   # Main NFT contract (current)
│   │   ├── ScoreNFTv2.sol   # Previous implementation
│   │   └── VeraLendingPool.sol
│   ├── scripts/
│   │   ├── deploy.ts        # Fresh deploy (proxy + impl)
│   │   ├── upgrade.ts       # Upgrade proxy to new impl
│   │   ├── upgradeV3.ts     # V2 → V3 upgrade script
│   │   └── deployLending.ts # Deploy lending pool
│   ├── hardhat.config.ts
│   └── .env                 # PRIVATE_KEY
│
├── backend/                 # Express API
│   ├── src/
│   │   ├── routes/
│   │   │   ├── score.ts     # Main scoring + relay route
│   │   │   └── feeInfo.ts   # Gas info endpoint
│   │   ├── scoring/
│   │   │   ├── mistralScorer.ts  # Mistral AI integration
│   │   │   └── signer.ts         # EIP-712 signing
│   │   ├── chain/
│   │   │   └── papiReader.ts     # Polkadot-API chain reader
│   │   └── db/
│   │       └── database.ts       # SQLite score history
│   └── .env                 # API keys + contract address
│
└── frontend/                # Vite + React + Tailwind
    ├── src/
    │   ├── pages/
    │   │   ├── Home.tsx         # Score request + mint
    │   │   ├── Lookup.tsx       # Look up any address
    │   │   ├── Leaderboard.tsx  # Top scores
    │   │   ├── LendingDemo.tsx  # Borrow demo
    │   │   ├── SendPAS.tsx      # Send PAS tokens
    │   │   ├── FeeCalculator.tsx
    │   │   └── CreateWallet.tsx # New user onboarding
    │   ├── components/
    │   │   ├── ScoreCard.tsx    # Score + chain data display
    │   │   ├── NFTViewer.tsx    # On-chain SVG render
    │   │   ├── HistoryChart.tsx # Score history chart
    │   │   └── Sidebar.tsx      # Navigation
    │   ├── hooks/
    │   │   ├── useScore.ts      # Full mint pipeline
    │   │   └── useTotalScored.ts
    │   └── utils/
    │       └── wagmi.ts         # Chain config
    └── .env                 # Contract address
```

---

## ✅ Quick Test Guide

| Page | Key things to check |
|---|---|
| **Score** | Connect MetaMask → Generate Score → confirm MetaMask popup → NFT appears. Try wrong network (auto-switch fires). Type different address → amber mismatch warning blocks submission. Already-minted wallet → cooldown countdown. |
| **Lookup** | Paste any `0x` address → shows score card + chain data (PAS, USDT, USDC, nonce). |
| **Leaderboard** | Top wallets ranked, tier badges coloured, address links to Routescan. |
| **Lending** | Borrow limit scales with score. Borrow/repay buttons trigger contract. |
| **Send PAS** | Address + amount validation, Max button, wrong network prompt, MetaMask → success. |
| **Fee Calc** | Live gas price fetched, estimates shown, refresh works. |
| **Create Wallet** | Generate → reveal seed (blurred) → checkbox → private key (blurred) → Add to MetaMask → faucet link → Go to Score. |
| **Sidebar** | Block number ticks, wallet counter live, NEW badge on wallet page, all nav works. |

---

## 🚀 Local Development

### Prerequisites
- Node.js v22+
- MetaMask browser extension
- Mistral AI API key — https://console.mistral.ai

### 1. Contracts

```bash
cd contracts
cp .env.example .env
# Edit .env — add your PRIVATE_KEY
npm install
npx hardhat compile
```

**Deploy fresh (if needed):**
```bash
npx hardhat run scripts/deploy.ts --network polkadotTestnet
```

**Upgrade to v3 (already done — proxy is live):**
```bash
npx hardhat run scripts/upgradeV3.ts --network polkadotTestnet
```

### 2. Backend

```bash
cd backend
cp .env.example .env
# Edit .env — add MISTRAL_API_KEY and ISSUER_PRIVATE_KEY
npm install
npm run dev       # dev with ts-node
npm run build     # compile to dist/
npm start         # production
```

**Backend `.env`:**
```env
MISTRAL_API_KEY=your_mistral_key
ISSUER_PRIVATE_KEY=0x_your_deployer_private_key
SCORE_NFT_PROXY=0xbb778Ec1482bbdF08527c1cac1569662caf1faAE
PORT=3001
FRONTEND_URL=http://localhost:5173
```

### 3. Frontend

```bash
cd frontend
cp .env.example .env
npm install
npm run dev
```

**Frontend `.env`:**
```env
VITE_SCORE_NFT_PROXY=0xbb778Ec1482bbdF08527c1cac1569662caf1faAE
VITE_WALLETCONNECT_PROJECT_ID=your_project_id_here
```

Open http://localhost:5173

---

## ⏱ Changing Expiry & Cooldown (Testnet → Production)

### Current testnet values (fast for demo)
| Setting | Testnet | Production |
|---|---|---|
| Score expiry | 2 hours | 30 days |
| Refresh cooldown | 5 minutes | 7 days |

---

### Step 1 — Edit the Solidity contract

Open `contracts/contracts/ScoreNFTv3.sol` and find **line ~56**:

```solidity
// TESTNET values — change before mainnet deploy:
uint64 public constant EXPIRY_DURATION   = 2 hours;   // ← change to: 30 days
uint64 public constant COOLDOWN_DURATION = 5 minutes;  // ← change to: 7 days
```

Change to:
```solidity
uint64 public constant EXPIRY_DURATION   = 30 days;
uint64 public constant COOLDOWN_DURATION = 7 days;
```

---

### Step 2 — Recompile and upgrade the proxy

Because `EXPIRY_DURATION` and `COOLDOWN_DURATION` are `constant` values, they are baked into the implementation bytecode — a proxy upgrade is required.

```bash
cd contracts
npx hardhat compile
npx hardhat run scripts/upgrade.ts --network polkadotTestnet
```

The upgrade script will:
1. Deploy a new implementation contract
2. Call `upgradeToAndCall()` on the proxy
3. Print the new implementation address

**The proxy address stays the same** — `0xbb778Ec1482bbdF08527c1cac1569662caf1faAE`. No frontend or backend changes needed for the proxy address.

---

### Step 4 — Update frontend UI text

Open `frontend/src/pages/Home.tsx` and find (~line 47, 60, 233):

```typescript
// Change these strings:
desc:  '...Valid 2 hours, refreshable after 5 minutes...'
// → 'Valid 30 days, refreshable after 7 days'

['2 hours', 'NFT validity'],
['5 minutes', 'Refresh cooldown'],
// → ['30 days', 'NFT validity'],
// → ['7 days', 'Refresh cooldown'],
```

Also update the cooldown text on line ~650:
```typescript
// 'The 7-day cooldown prevents score manipulation.'
// (already correct — no change needed)
```

---

## 🔑 Environment Variables Reference

### `contracts/.env`
```env
PRIVATE_KEY=0x_deployer_wallet_private_key
```

### `backend/.env`
```env
MISTRAL_API_KEY=         # from console.mistral.ai
ISSUER_PRIVATE_KEY=      # same as contracts PRIVATE_KEY
SCORE_NFT_PROXY=0xbb778Ec1482bbdF08527c1cac1569662caf1faAE
PORT=3001
FRONTEND_URL=https://YOUR_FRONTEND_URL_HERE   # for CORS
```

### `frontend/.env`
```env
VITE_SCORE_NFT_PROXY=0xbb778Ec1482bbdF08527c1cac1569662caf1faAE
VITE_WALLETCONNECT_PROJECT_ID=   # from cloud.walletconnect.com
```

---

## Backend (Railway / Render / Fly.io)
```bash
cd backend
npm run build
# Deploy dist/ with node dist/index.js
# Set all env vars in dashboard
# Note your backend URL: https://YOUR_BACKEND_URL_HERE
```

### Frontend (Vercel / Netlify)
```bash
cd frontend
# Set VITE_BACKEND_URL=https://YOUR_BACKEND_URL_HERE in dashboard
# Set VITE_SCORE_NFT_PROXY=0xbb778Ec1482bbdF08527c1cac1569662caf1faAE
npm run build
# Deploy dist/
```

> **CORS**: Update `FRONTEND_URL` in backend `.env` to your live frontend URL, then redeploy backend.

---

## 🧠 How Scoring Works

1. **Chain read** — Polkadot-API reads: PAS balance, USDT (asset 1337), USDC (asset 1984), WETH (foreign asset), nonce (tx count), wallet age (binary search over blocks)
2. **AI scoring** — Mistral AI receives wallet data and scores 6 categories: Payment History, Credit Utilization, Wallet Age, Transaction Activity, Asset Diversity, Protocol Interactions. Total: 0–1000.
3. **EIP-712 sign** — Backend issues a signed payload: `(wallet, score, dataHash, nonce, deadline)`. Signature is valid for 1 hour.
4. **Mint** — User submits the signed payload to `ScoreNFT.mintScore()` via MetaMask (or backend relay). Contract verifies the EIP-712 signature and mints a soulbound NFT.
5. **On-chain SVG** — `tokenURI()` generates the full SVG entirely in Solidity. No IPFS. No off-chain renderer.

---

## 🔒 Security Notes

- **Soulbound** — `_update()` is overridden to block all transfers. Score NFTs cannot be sold.
- **Replay protection** — EIP-712 nonces prevent the same signature being used twice.
- **Issuer-only minting** — Only the wallet set as `issuer` in the contract can produce valid signatures.
- **On-chain cooldown** — 7-day (or testnet: 5-min) cooldown enforced in Solidity, not just the backend.
- **Private keys** — Never committed. Always use `.env` files listed in `.gitignore`.

---

## 🛠 Tech Stack

| Layer | Technology |
|---|---|
| Smart Contract | Solidity 0.8.28, OpenZeppelin UUPS upgradeable, EIP-712 |
| Contract Deploy | Hardhat, ethers.js |
| Backend | Node.js, Express, TypeScript, Polkadot-API, ethers.js |
| AI Scoring | Mistral AI (mistral-small-latest) |
| Database | SQLite (score history) |
| Frontend | React 18, TypeScript, Vite, Tailwind CSS |
| Web3 Frontend | Viem 2.x, Wagmi 2.x, MetaMask injected |
| Chain | Polkadot Hub PAS TestNet (EVM-compatible, Chain ID: 420420417) |

---

*Built for Polkadot Hackathon 2026 · VeraScore*