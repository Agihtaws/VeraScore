import { useBlockNumber }         from 'wagmi';
import { useTotalScored }         from '../hooks/useTotalScored'; // Removed .js pa!
import { pasTestnet, SCORE_NFT_PROXY } from '../utils/wagmi'; // Removed .js pa!

const EXPLORER = 'https://polkadot.testnet.routescan.io';

export type Page = 'home' | 'lookup' | 'lending' | 'leaderboard' | 'send' | 'stables' | 'fees' | 'wallet';

export const NAV: { id: Page; icon: string; label: string; badge?: string }[] = [
  { id: 'home',        icon: '◈', label: 'Score'    },
  { id: 'lookup',      icon: '⌕', label: 'Lookup'      },
  { id: 'leaderboard', icon: '🏆', label: 'Leaderboard' },
  { id: 'lending',     icon: '⬡', label: 'Lending'  },
  { id: 'send',        icon: '↑', label: 'Send PAS'   },
  { id: 'stables',     icon: '◎', label: 'Send USDT',  badge: 'NEW' },
  { id: 'fees',        icon: '⛽', label: 'Fee Calc'  },
  { id: 'wallet',      icon: '⊕', label: 'New Wallet', badge: 'NEW' },
];

interface SidebarProps {
  page:       Page;
  onNavigate: (p: Page) => void;
}

export function Sidebar({ page, onNavigate }: SidebarProps) {
  // Polling every 6s to match Paseo block times pa!
  const { data: blockNumber } = useBlockNumber({
    chainId: pasTestnet.id,
    query:   { refetchInterval: 6_000 },
  });
  
  const totalScored = useTotalScored();

  return (
    <div className="flex flex-col h-full bg-polkadot-card border-r border-polkadot-border shadow-2xl">

      {/* Logo Section */}
      <div className="px-6 py-6 border-b border-polkadot-border bg-white/5">
        <button
          onClick={() => onNavigate('home')}
          className="flex items-center gap-4 hover:opacity-80 transition-all w-full text-left group"
        >
          <div className="w-10 h-10 bg-polkadot-pink rounded-2xl flex items-center justify-center text-lg font-black shrink-0 shadow-[0_0_15px_rgba(230,0,122,0.3)] group-hover:scale-105 transition-transform">
            V
          </div>
          <div>
            <div className="font-black text-sm tracking-tighter text-white uppercase">VeraScore</div>
            <div className="text-[9px] text-gray-500 font-bold uppercase tracking-widest">Polkadot Hub</div>
          </div>
        </button>
      </div>

      {/* Navigation Links */}
      <nav className="flex-1 px-4 py-6 space-y-2 overflow-y-auto scrollbar-none">
        {NAV.map(({ id, icon, label, badge }) => (
          <button
            key={id}
            onClick={() => onNavigate(id)}
            className={`w-full text-left flex items-center gap-4 px-4 py-3 rounded-2xl text-sm transition-all border ${
              page === id
                ? 'bg-polkadot-pink/10 text-white border-polkadot-pink/30 font-bold shadow-inner'
                : 'border-transparent text-gray-500 hover:text-gray-200 hover:bg-white/5'
            }`}
          >
            <span className={`text-lg w-6 text-center shrink-0 ${page === id ? 'text-polkadot-pink drop-shadow-[0_0_5px_rgba(230,0,122,0.5)]' : ''}`}>
              {icon}
            </span>
            <span className="flex-1 tracking-tight">{label}</span>
            {badge && (
              <span className="text-[8px] bg-polkadot-pink text-white px-2 py-0.5 rounded-full font-black tracking-tighter shadow-sm">
                {badge}
              </span>
            )}
          </button>
        ))}
      </nav>

      {/* Chain Status Footer */}
      <div className="px-6 py-6 border-t border-polkadot-border bg-black/20 space-y-3">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>
          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">PAS TestNet</span>
          <span className="text-gray-700 font-mono text-[10px]">#{pasTestnet.id}</span>
        </div>

        <div className="space-y-1">
          {blockNumber !== undefined && (
            <div className="text-[10px] text-gray-500 font-mono flex justify-between">
              <span className="text-gray-700">BLOCK</span>
              <span className="text-gray-400 font-bold">{blockNumber.toLocaleString()}</span>
            </div>
          )}
          {totalScored !== null && (
            <div className="text-[10px] text-gray-500 font-mono flex justify-between">
              <span className="text-gray-700">SCORED</span>
              <span className="text-emerald-500 font-bold">{totalScored}</span>
            </div>
          )}
        </div>

        <a
          href={`${EXPLORER}/address/${SCORE_NFT_PROXY}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-between p-2 rounded-lg bg-black/40 border border-white/5 text-[9px] font-mono text-gray-500 hover:text-polkadot-pink hover:border-polkadot-pink/30 transition-all"
        >
          <span className="truncate">{SCORE_NFT_PROXY?.slice(0, 10)}...{SCORE_NFT_PROXY?.slice(-4)}</span>
          <span className="shrink-0 ml-1">↗</span>
        </a>
      </div>
    </div>
  );
}
