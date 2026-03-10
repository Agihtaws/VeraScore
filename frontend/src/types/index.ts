export interface ScoreBreakdown {
  transactionActivity: number; // 0–200
  accountAge:          number; // 0–100
  nativeBalance:       number; // 0–150
  usdtHolding:         number; // 0–200
  usdcHolding:         number; // 0–150
  accountComplexity:   number; // 0–200
  runtimeModernity:    number; // 0–100
}

export interface AssetMetadata {
  name:     string;
  symbol:   string;
  decimals: number;
}

export interface RawChainData {
  address:          string;
  nonce:            number;
  freeBalance:      string;
  usdtBalance:      string;
  usdcBalance:      string;
  reservedBalance:  string;
  frozenBalance:    string;
  consumers:        number;
  providers:        number;
  sufficients:      number;
  confirmedNonce:   number;
  usdtMetadata:     AssetMetadata;
  usdcMetadata:     AssetMetadata;
  metadataVersions:  number[];
  wethBalance:       string;
  hasForeignAssets:  boolean;
  bridgedAssets:     string[];
  walletAgeDays:     number;
  queriedAt:         number;
}

export interface ScorePayload {
  wallet:          string;
  score:           number;
  dataHash:        string;
  signature:       string;
  deadline:        number;
  reasoning:       string;
  breakdown:       ScoreBreakdown;
  rawChainData:    RawChainData;
  alreadyHadScore: boolean;
}


export interface HistoryRecord {
  id:        number;
  address:   string;
  score:     number;
  breakdown: string; // JSON string from SQLite
  txHash:    string;
  timestamp: number;
}

export interface LookupResult {
  success:     boolean;
  hasScore:    boolean;
  address:     string;
  score?:      number;
  issuedAt?:   number;
  dataHash?:   string;
  totalScored: number;
  history?:    HistoryRecord[];
}