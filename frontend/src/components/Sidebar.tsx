import { useBlockNumber }              from 'wagmi';
import { useTotalScored }              from '../hooks/useTotalScored';
import { pasTestnet, SCORE_NFT_PROXY } from '../utils/wagmi';

const EXPLORER = 'https://polkadot.testnet.routescan.io';

export type Page =
  | 'home' | 'lookup' | 'lending' | 'leaderboard'
  | 'send'  | 'stables' | 'fees'   | 'wallet';

export const NAV: { id: Page; icon: string; label: string }[] = [
  { id: 'home',        icon: '◈', label: 'Score'       },
  { id: 'lookup',      icon: '⌕', label: 'Lookup'      },
  { id: 'leaderboard', icon: '🏆', label: 'Leaderboard' },
  { id: 'lending',     icon: '⬡', label: 'Lending'     },
  { id: 'send',        icon: '↑', label: 'Send PAS'    },
  { id: 'stables',     icon: '◎', label: 'Send USDT'   },
  { id: 'fees',        icon: '⛽', label: 'Fee Calc'    },
  { id: 'wallet',      icon: '⊕', label: 'New Wallet'  },
];

interface SidebarProps {
  page:       Page;
  onNavigate: (p: Page) => void;
}

export function Sidebar({ page, onNavigate }: SidebarProps) {
  const { data: blockNumber } = useBlockNumber({
    chainId: pasTestnet.id,
    query:   { refetchInterval: 6_000 },
  });

  const totalScored = useTotalScored();

  return (
    <div className="flex flex-col h-full bg-polkadot-card border-r border-polkadot-border">

      {/* ── Logo ──────────────────────────────────────────────────────── */}
      <div className="px-5 py-5 border-b border-polkadot-border">
        <button
          onClick={() => onNavigate('home')}
          className="flex items-center gap-3 hover:opacity-80 transition-all w-full text-left group"
        >
          <div className="w-9 h-9 bg-polkadot-pink rounded-2xl flex items-center justify-center text-base font-black shrink-0 shadow-[0_0_14px_rgba(230,0,122,0.35)] group-hover:shadow-[0_0_20px_rgba(230,0,122,0.55)] transition-all">
            V
          </div>
          <div>
            <div className="font-black text-[13px] tracking-tighter text-white uppercase leading-none">
              VeraScore
            </div>
            <div className="text-[9px] text-gray-600 font-black uppercase tracking-[0.25em] mt-0.5">
              Polkadot Hub
            </div>
          </div>
        </button>
      </div>

      {/* ── Nav ───────────────────────────────────────────────────────── */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto scrollbar-none">
        {NAV.map(({ id, icon, label }) => {
          const active = page === id;
          return (
            <button
              key={id}
              onClick={() => onNavigate(id)}
              className={`w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all border ${
                active
                  ? 'bg-polkadot-pink/10 text-white border-polkadot-pink/25 shadow-inner'
                  : 'border-transparent text-gray-600 hover:text-gray-300 hover:bg-white/5'
              }`}
            >
              <span className={`text-base w-5 text-center shrink-0 transition-all ${
                active
                  ? 'text-polkadot-pink drop-shadow-[0_0_6px_rgba(230,0,122,0.6)]'
                  : 'opacity-60'
              }`}>
                {icon}
              </span>
              <span className="flex-1 tracking-widest">{label}</span>
              {active && (
                <span className="w-1 h-1 rounded-full bg-polkadot-pink shadow-[0_0_4px_rgba(230,0,122,0.8)]" />
              )}
            </button>
          );
        })}
      </nav>

      {/* ── Footer ────────────────────────────────────────────────────── */}
      <div className="px-5 py-5 border-t border-polkadot-border space-y-3">

        {/* Live dot + network */}
        <div className="flex items-center gap-2">
          <span className="relative flex h-1.5 w-1.5 shrink-0">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
          </span>
          <span className="text-[9px] font-black text-gray-500 uppercase tracking-[0.25em]">
            PAS TestNet
          </span>
          <span className="text-gray-700 font-mono text-[9px] ml-auto">
            #{pasTestnet.id}
          </span>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-black/30 border border-white/5 rounded-xl px-3 py-2">
            <div className="text-[8px] font-black text-gray-700 uppercase tracking-widest mb-0.5">Block</div>
            <div className="text-[11px] font-black font-mono text-gray-400">
              {blockNumber !== undefined ? blockNumber.toLocaleString() : '—'}
            </div>
          </div>
          <div className="bg-black/30 border border-white/5 rounded-xl px-3 py-2">
            <div className="text-[8px] font-black text-gray-700 uppercase tracking-widest mb-0.5">Scored</div>
            <div className="text-[11px] font-black font-mono text-emerald-500">
              {totalScored !== null ? totalScored : '—'}
            </div>
          </div>
        </div>

        {/* Contract link */}
        <a
          href={`${EXPLORER}/address/${SCORE_NFT_PROXY}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-between w-full px-3 py-2 rounded-xl bg-black/30 border border-white/5 text-[9px] font-mono text-gray-600 hover:text-polkadot-pink hover:border-polkadot-pink/20 transition-all"
        >
          <span className="truncate">
            {SCORE_NFT_PROXY?.slice(0, 10)}…{SCORE_NFT_PROXY?.slice(-4)}
          </span>
          <span className="shrink-0 ml-1 text-gray-700">↗</span>
        </a>
      </div>
    </div>
  );
}