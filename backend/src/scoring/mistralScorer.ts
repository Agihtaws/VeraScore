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
  const val = BigInt(raw);
  const divisor = BigInt(10 ** decimals);
  const whole = val / divisor;
  // Show 2 decimal places for the AI to be more precise
  const frac = (val % divisor) / BigInt(10 ** (decimals - 2));
  return `${whole}.${frac.toString().padStart(2, '0')} units`;
}

function formatWETH(raw: string): string {
  try {
    const val     = BigInt(raw);
    if (val === 0n) return '0 WETH';
    const eth     = val / (10n ** 18n);
    const frac    = (val % (10n ** 18n)) / (10n ** 14n); 
    return `${eth}.${frac.toString().padStart(4, '0')} WETH`;
  } catch { return '0 WETH'; }
}

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
      const isRetryable =
        (err instanceof Error && (
          err.message.includes('503') ||
          err.message.includes('502') ||
          err.message.includes('429') ||
          err.message.includes('ECONNRESET') ||
          err.message.includes('fetch failed')
        )) ||
        (typeof err === 'object' && err !== null && 'statusCode' in err &&
          [429, 502, 503].includes((err as { statusCode: number }).statusCode));

      if (!isRetryable || attempt === maxRetries) throw err;

      const delay = Math.min(1000 * Math.pow(2, attempt), 8000);
      console.log(`[mistral] Retryable error. Waiting ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  throw lastError;
}

export async function scoreWallet(data: WalletChainData): Promise<ScoreResult> {
  const prompt = `You are a blockchain credit scoring engine for Polkadot Hub PAS TestNet (Chain ID: 420420417).

Analyze this wallet and return ONLY a valid JSON object.

Wallet on-chain data:
- Address: ${data.address}
- EVM transaction count (nonce): ${data.nonce}
- Confirmed substrate nonce: ${data.confirmedNonce}
- Wallet age: ${data.walletAgeDays} days
- Native PAS balance: ${formatPAS(data.freeBalance)}
- USDT balance (Asset 1984): ${formatStablecoin(data.usdtBalance, data.usdtMetadata.decimals)}
- USDC balance (Asset 1337): ${formatStablecoin(data.usdcBalance, data.usdcMetadata.decimals)}
- WETH balance: ${formatWETH(data.wethBalance)}
- Has cross-chain bridged assets: ${data.hasForeignAssets}
- Account consumers/providers: ${data.consumers}/${data.providers}
- Chain metadata versions: [${data.metadataVersions.join(', ')}]

Scoring rules (Sum MUST equal total score, max 1100):
1. transactionActivity (0–200): Combined nonces. 1-20=70, 21-100=140, 101-500=185, 500+=200.
2. accountAge (0–100): 1-90 days=40, 91-365=80, 365+=100. If 0, use providers/consumers as fallback.
3. nativeBalance (0–150): 0=0, <1 PAS=50, 1-10=80, 10-100=120, 100+=150.
4. usdtHolding (0–200): 0=0, 1-100=80, 101-1000=140, 1000+=200.
5. usdcHolding (0–150): 0=0, 1-100=60, 101-1000=110, 1000+=150.
6. accountComplexity (0–200): reserved>0 (+30), frozen>0 (+30), WETH>0 (+30), bridged assets found (+50).
7. runtimeModernity (0–100): v14/15/16 support. All three = 100 pts.

Return ONLY this structure:
{
  "score": <number 0-1100>,
  "reasoning": "<2 sentences>",
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
    throw new Error(`Failed to parse Mistral response`);
  }

  // ── Deterministic Overrides ──
  // We never trust the AI with the core financial math
  const usdtUnits = Math.floor(Number(data.usdtBalance) / 1e6);
  const usdcUnits = Math.floor(Number(data.usdcBalance) / 1e6);
  
  parsed.breakdown.usdtHolding = usdtUnits === 0 ? 0 : usdtUnits <= 100 ? 80 : usdtUnits <= 1000 ? 140 : 200;
  parsed.breakdown.usdcHolding = usdcUnits === 0 ? 0 : usdcUnits <= 100 ? 60 : usdcUnits <= 1000 ? 110 : 150;

  // Clamp other values for safety
  parsed.breakdown.transactionActivity = Math.min(parsed.breakdown.transactionActivity, 200);
  parsed.breakdown.accountAge          = Math.min(parsed.breakdown.accountAge, 100);
  parsed.breakdown.nativeBalance       = Math.min(parsed.breakdown.nativeBalance, 150);
  parsed.breakdown.accountComplexity   = Math.min(parsed.breakdown.accountComplexity, 200);
  parsed.breakdown.runtimeModernity    = Math.min(parsed.breakdown.runtimeModernity ?? 0, 100);

  // Final re-sum to ensure the total score is mathematically perfect
  parsed.score = Object.values(parsed.breakdown).reduce((a, b) => a + b, 0);

  return parsed;
}
