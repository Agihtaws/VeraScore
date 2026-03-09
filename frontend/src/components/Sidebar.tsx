import { useBlockNumber }         from 'wagmi';
import { useTotalScored }         from '../hooks/useTotalScored.js';
import { pasTestnet, SCORE_NFT_PROXY } from '../utils/wagmi.js';

const EXPLORER = 'https://polkadot.testnet.routescan.io';

export type Page = 'home' | 'lookup' | 'lending' | 'leaderboard' | 'send' | 'stables' | 'fees' | 'wallet';

export const NAV: { id: Page; icon: string; label: string; badge?: string }[] = [
  { id: 'home',    icon: '◈', label: 'Score'    },
  { id: 'lookup',      icon: '⌕', label: 'Lookup'      },
  { id: 'leaderboard', icon: '🏆', label: 'Leaderboard' },
  { id: 'lending', icon: '⬡', label: 'Lending'  },
  { id: 'send',    icon: '↑', label: 'Send PAS'   },
  { id: 'stables', icon: '◎', label: 'Send USDT',  badge: 'NEW' },
  { id: 'fees',    icon: '⛽', label: 'Fee Calc'  },
  { id: 'wallet',  icon: '⊕', label: 'New Wallet', badge: 'NEW' },
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
    <div className="flex flex-col h-full">

      {/* Logo */}
      <div className="px-5 py-5 border-b border-polkadot-border">
        <button
          onClick={() => onNavigate('home')}
          className="flex items-center gap-3 hover:opacity-80 transition-opacity w-full text-left"
        >
          <div className="w-9 h-9 bg-polkadot-pink rounded-xl flex items-center justify-center text-base font-bold shrink-0">
            V
          </div>
          <div>
            <div className="font-bold text-sm tracking-tight text-white">VeraScore</div>
            <div className="text-[10px] text-gray-500">AI Credit · Polkadot Hub</div>
          </div>
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {NAV.map(({ id, icon, label, badge }) => (
          <button
            key={id}
            onClick={() => onNavigate(id)}
            className={`w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-colors border ${
              page === id
                ? 'bg-polkadot-pink/15 text-white border-polkadot-pink/30 font-medium'
                : 'border-transparent text-gray-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <span className={`text-base w-5 text-center shrink-0 ${page === id ? 'text-polkadot-pink' : ''}`}>
              {icon}
            </span>
            <span className="flex-1">{label}</span>
            {badge && (
              <span className="text-[9px] bg-polkadot-pink text-white px-1.5 py-0.5 rounded-full font-semibold leading-none">
                {badge}
              </span>
            )}
          </button>
        ))}
      </nav>

      {/* Chain status */}
      <div className="px-4 py-4 border-t border-polkadot-border space-y-2">
        <div className="flex items-center gap-2 text-[11px]">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse shrink-0" />
          <span className="text-gray-400">PAS TestNet</span>
          <span className="text-polkadot-border">·</span>
          <span className="text-gray-500">ID {pasTestnet.id}</span>
        </div>
        {blockNumber !== undefined && (
          <div className="text-[11px] text-gray-600 font-mono">
            Block #{blockNumber.toLocaleString()}
          </div>
        )}
        {totalScored !== null && (
          <div className="text-[11px] text-gray-600">
            {totalScored} wallet{totalScored !== 1 ? 's' : ''} scored
          </div>
        )}
        <a
          href={`${EXPLORER}/address/${SCORE_NFT_PROXY}`}
          target="_blank"
          rel="noopener noreferrer"
          className="block text-[10px] font-mono text-gray-700 hover:text-gray-500 transition-colors truncate"
        >
          {SCORE_NFT_PROXY?.slice(0, 14)}…{SCORE_NFT_PROXY?.slice(-6)} ↗
        </a>
      </div>
    </div>
  );
}