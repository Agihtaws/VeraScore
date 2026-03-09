import { Mistral } from '@mistralai/mistralai';
import type { WalletChainData } from '../chain/papiReader.js';

const mistral = new Mistral({ apiKey: process.env.MISTRAL_API_KEY! });

export interface ScoreBreakdown {
  transactionActivity: number; // 0–200
  accountAge:          number; // 0–100
  nativeBalance:       number; // 0–150
  usdtHolding:         number; // 0–200
  usdcHolding:         number; // 0–150
  accountComplexity:   number; // 0–200
  runtimeModernity:    number; // 0–100
}

export interface ScoreResult {
  score:     number;
  reasoning: string;
  breakdown: ScoreBreakdown;
}

const PAS_UNITS = 10n ** 18n;

function formatPAS(wei: string): string {
  const val   = BigInt(wei);
  const whole = val / PAS_UNITS;
  const frac  = (val % PAS_UNITS) / (PAS_UNITS / 100n);
  return `${whole}.${frac.toString().padStart(2, '0')} PAS`;
}

function formatStablecoin(raw: string, decimals = 6): string {
  const val     = BigInt(raw);
  const divisor = BigInt(10 ** decimals);
  return `${(val / divisor).toString()} units`;
}

function formatWETH(raw: string): string {
  try {
    const val     = BigInt(raw);
    if (val === 0n) return '0 WETH';
    const eth     = val / (10n ** 18n);
    const frac    = (val % (10n ** 18n)) / (10n ** 14n); // 4 decimal places
    return `${eth}.${frac.toString().padStart(4, '0')} WETH`;
  } catch { return '0 WETH'; }
}

// Retry with exponential backoff — handles 503 Mistral overload
async function callMistralWithRetry(prompt: string, maxRetries = 3): Promise<string> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`[mistral] Attempt ${attempt}/${maxRetries}...`);

      const response = await mistral.chat.complete({
        model:          'mistral-medium-latest',
        messages:       [{ role: 'user', content: prompt }],
        responseFormat: { type: 'json_object' },
        temperature:    0.1,
      });

      const raw = response.choices?.[0]?.message?.content;
      if (!raw || typeof raw !== 'string') {
        throw new Error('Mistral returned empty response');
      }

      return raw;

    } catch (err: unknown) {
      lastError = err;

      // Check if it's a retryable error (503, 429, 502, network errors)
      const isRetryable =
        (err instanceof Error && (
          err.message.includes('503') ||
          err.message.includes('502') ||
          err.message.includes('429') ||
          err.message.includes('overflow') ||
          err.message.includes('upstream connect') ||
          err.message.includes('ECONNRESET') ||
          err.message.includes('fetch failed')
        )) ||
        // Check statusCode on SDK errors
        (typeof err === 'object' && err !== null && 'statusCode' in err &&
          [429, 502, 503].includes((err as { statusCode: number }).statusCode));

      if (!isRetryable || attempt === maxRetries) {
        throw err;
      }

      // Exponential backoff: 2s, 4s, 8s
      const delay = Math.min(1000 * Math.pow(2, attempt), 8000);
      console.log(`[mistral] Retryable error on attempt ${attempt}. Waiting ${delay}ms before retry...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

export async function scoreWallet(data: WalletChainData): Promise<ScoreResult> {
  const prompt = `You are a blockchain credit scoring engine for Polkadot Hub PAS TestNet (Chain ID: 420420417).

Analyze this wallet and return ONLY a valid JSON object. No markdown, no extra text outside the JSON.

Wallet on-chain data:
- Address: ${data.address}
- EVM transaction count (nonce): ${data.nonce}
- Confirmed substrate nonce: ${data.confirmedNonce}
- Wallet age (days, from Sidecar historical query): ${data.walletAgeDays} days
- Bridged foreign assets detected: [${data.bridgedAssets?.join(', ') || 'none'}]
- Native PAS free balance: ${formatPAS(data.freeBalance)}
- Native PAS reserved balance: ${formatPAS(data.reservedBalance)}
- Native PAS frozen balance: ${formatPAS(data.frozenBalance)}
- USDT balance (${data.usdtMetadata.symbol}, Asset 1984): ${formatStablecoin(data.usdtBalance, data.usdtMetadata.decimals)}
- USDC balance (${data.usdcMetadata.symbol}, Asset 1337): ${formatStablecoin(data.usdcBalance, data.usdcMetadata.decimals)}
- WETH balance (foreign asset bridged from Ethereum via Snowbridge): ${formatWETH(data.wethBalance)}
- Has cross-chain bridged assets: ${data.hasForeignAssets}
- Account consumers: ${data.consumers}
- Account providers: ${data.providers}
- Account sufficients: ${data.sufficients}
- Chain metadata versions supported: [${data.metadataVersions.join(', ')}]

Scoring rules — total MUST equal exact sum of all breakdown values, max 1000:
- transactionActivity (0–200): Score based on COMBINED nonce (EVM nonce + confirmed substrate nonce):
    0 transactions = 0 pts
    1–5            = 30 pts  (brand new wallet)
    6–20           = 70 pts  (occasional user)
    21–50          = 110 pts (regular user)
    51–100         = 140 pts (active user)
    101–300        = 160 pts (power user)
    301–500        = 185 pts (heavy power user)
    500+           = 200 pts (protocol-level power user — extremely rare, maximum credibility)
  NOTE: A wallet with nonce 500+ has submitted hundreds of on-chain transactions — this is the strongest possible activity signal. Weight it at maximum.
- accountAge (0–100): Use walletAgeDays as the PRIMARY signal for age scoring:
    walletAgeDays = 0 (unknown/new)  = 10 pts — use providers/consumers as fallback
    walletAgeDays 1–30               = 20 pts (brand new wallet)
    walletAgeDays 31–90              = 40 pts (1–3 months old)
    walletAgeDays 91–180             = 60 pts (3–6 months old)
    walletAgeDays 181–365            = 80 pts (6–12 months old)
    walletAgeDays 365+               = 100 pts (over 1 year old — seasoned wallet)
  If walletAgeDays = 0 (Sidecar data unavailable), fall back to: providers>0 gives 50, consumers>0 adds 25, sufficients>0 adds 25
- nativeBalance (0–150): 0 PAS=0, 0.01–1=50, 1–10=80, 10–100=120, 100+=150
- usdtHolding (0–200): 0=0, 1–100 units=80, 101–1000=140, 1000+=200
- usdcHolding (0–150): 0=0, 1–100 units=60, 101–1000=110, 1000+=150
- accountComplexity (0–200): reserved>0 adds 30, frozen>0 adds 30, sufficients>0 adds 30, both USDT and USDC held adds 30, WETH>0 adds 30, bridgedAssets array has 1+ items (any Snowbridge foreign asset detected by Sidecar) adds 50 — this is the strongest cross-chain signal
- runtimeModernity (0–100): measures how modern the Polkadot runtime tooling this wallet interacts with.
    Only v14 supported            = 10 pts  (legacy tooling only)
    v14 + v15 supported           = 40 pts  (modern but not latest)
    v14 + v15 + v16 supported     = 100 pts (full modern Polkadot runtime — highest credibility)
    No metadata versions detected = 0 pts
  NOTE: metadata v16 is the latest Polkadot runtime standard. A wallet whose chain supports all three versions is interacting with the most modern Polkadot infrastructure. This is a unique Polkadot-native signal no other blockchain has.

Return ONLY this exact JSON structure:
{
  "score": <number 0-1100, must equal sum of all 7 breakdown values>,
  "reasoning": "<exactly 2 sentences explaining the score>",
  "breakdown": {
    "transactionActivity": <0-200>,
    "accountAge": <0-100>,
    "nativeBalance": <0-150>,
    "usdtHolding": <0-200>,
    "usdcHolding": <0-150>,
    "accountComplexity": <0-200>,
    "runtimeModernity": <0-100>
  }
}`;

  const raw   = await callMistralWithRetry(prompt);
  const clean = raw.replace(/```json|```/g, '').trim();

  let parsed: ScoreResult;
  try {
    parsed = JSON.parse(clean) as ScoreResult;
  } catch {
    throw new Error(`Failed to parse Mistral response: ${clean}`);
  }

  if (parsed.score < 0 || parsed.score > 1100) {
    throw new Error(`Score out of range: ${parsed.score}`);
  }

  // Clamp all breakdown values to their maximums
  parsed.breakdown.transactionActivity = Math.min(parsed.breakdown.transactionActivity, 200);
  parsed.breakdown.accountAge          = Math.min(parsed.breakdown.accountAge,          100);
  parsed.breakdown.nativeBalance       = Math.min(parsed.breakdown.nativeBalance,       150);
  parsed.breakdown.usdtHolding         = Math.min(parsed.breakdown.usdtHolding,         200);
  parsed.breakdown.usdcHolding         = Math.min(parsed.breakdown.usdcHolding,         150);
  parsed.breakdown.accountComplexity   = Math.min(parsed.breakdown.accountComplexity,   200);
  parsed.breakdown.runtimeModernity    = Math.min(parsed.breakdown.runtimeModernity    ?? 0, 100);

  // Recompute score from clamped breakdown to stay consistent
  parsed.score = Object.values(parsed.breakdown).reduce((a, b) => a + b, 0);

  return parsed;
}