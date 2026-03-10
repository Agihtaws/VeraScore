import { useState, useRef, useEffect, useCallback } from 'react';
import {
  useAccount, useConnect, useDisconnect,
  useChainId, useSwitchChain, useBlockNumber, useBalance,
} from 'wagmi';
import { injected }          from 'wagmi/connectors';
import { Sidebar }           from './components/Sidebar';
import type { Page }         from './components/Sidebar';
import { NAV }               from './components/Sidebar';
import { Home }              from './pages/Home';
import { Lookup }            from './pages/Lookup';
import { LendingDemo }       from './pages/LendingDemo';
import { SendPAS }           from './pages/SendPAS';
import { FeeCalculator }     from './pages/FeeCalculator';
import { Leaderboard }       from './pages/Leaderboard';
import { CreateWallet }      from './pages/CreateWallet';
import { SendStablecoin }    from './pages/SendStablecoin';
import { pasTestnet, SCORE_NFT_PROXY } from './utils/wagmi';

const EXPLORER = 'https://polkadot.testnet.routescan.io';

export default function App() {
  const { address, isConnected } = useAccount();
  const { connect }              = useConnect();
  const { disconnect }           = useDisconnect();
  const chainId                  = useChainId();
  const { switchChain }          = useSwitchChain();

  // ── PAS balance — refetchInterval polls every 6s via React Query ────────────
  // NOTE: do NOT use watch:true — with HTTP transport + custom chain it can
  //       silently fail. query.refetchInterval is reliable for all networks.
  const { data: balData, refetch: refetchBal } = useBalance({
    address,
    chainId: pasTestnet.id,
    query: {
      enabled:         !!address,  // don't fire until wallet is connected
      refetchInterval: 6_000,      // poll every 6s
      staleTime:       0,          // always treat cached value as stale → refetch immediately
      retry:           3,          // retry up to 3 times on RPC error
    },
  });

  const balNum   = balData ? Number(balData.value) / 1e18 : null;
  const balShort = balNum !== null
    ? balNum.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' PAS'
    : '—';
  const balFull  = balNum !== null
    ? balNum.toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 4 }) + ' PAS'
    : '—';

  // ── Block number — query.refetchInterval works reliably on HTTP transports ───
  // watch:true uses watchBlockNumber (needs WebSocket/long-poll) and silently
  // fails for custom chains on plain HTTP. Use refetchInterval instead.
  const { data: blockNumber } = useBlockNumber({
    chainId: pasTestnet.id,
    query: {
      refetchInterval: 4_000,   // poll every 4s
      staleTime:       0,
      retry:           3,
    },
  });

  const [page,        setPage]        = useState<Page>('home');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [walletOpen,  setWalletOpen]  = useState(false);
  const [copied,      setCopied]      = useState(false);

  const walletRef  = useRef<HTMLDivElement>(null);
  const sidebarRef = useRef<HTMLDivElement>(null);

  // Close dropdowns on outside click
  useEffect(() => {
    function onOut(e: MouseEvent) {
      if (walletRef.current  && !walletRef.current.contains(e.target  as Node)) setWalletOpen(false);
      if (sidebarRef.current && !sidebarRef.current.contains(e.target as Node)) setSidebarOpen(false);
    }
    document.addEventListener('mousedown', onOut);
    return () => document.removeEventListener('mousedown', onOut);
  }, []);

  const navigate = useCallback((p: Page) => {
    setPage(p);
    setSidebarOpen(false);
    window.scrollTo(0, 0);
  }, []);

  function copyAddress() {
    if (!address) return;
    navigator.clipboard.writeText(address).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  const isWrongNetwork = isConnected && chainId !== pasTestnet.id;

  return (
    <div className="min-h-screen bg-polkadot-dark text-white flex font-sans">

      {/* ── Desktop sidebar ───────────────────────────────────────────────── */}
      <aside className="hidden lg:flex flex-col w-64 shrink-0 border-r border-polkadot-border bg-polkadot-card fixed top-0 left-0 h-full z-30 shadow-2xl">
        <Sidebar page={page} onNavigate={navigate} />
      </aside>

      {/* ── Mobile sidebar overlay ────────────────────────────────────────── */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            onClick={() => setSidebarOpen(false)}
          />
          <aside
            ref={sidebarRef}
            className="absolute left-0 top-0 h-full w-64 bg-polkadot-card border-r border-polkadot-border z-50"
          >
            <Sidebar page={page} onNavigate={navigate} />
          </aside>
        </div>
      )}

      {/* ── Main content ──────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-h-screen lg:ml-64">

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <header className="sticky top-0 z-20 border-b border-polkadot-border bg-polkadot-dark/80 backdrop-blur-xl px-4 sm:px-8 py-4 flex items-center justify-between">

          <div className="flex items-center gap-4">
            {/* Mobile hamburger */}
            <button
              onClick={() => setSidebarOpen(o => !o)}
              className="lg:hidden p-2 rounded-xl bg-white/5 border border-white/10 text-gray-400 hover:text-white transition-all"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>

            {/* Current page label */}
            <div className="text-xs font-black uppercase tracking-[0.2em] text-gray-500 hidden sm:block">
              {NAV.find(n => n.id === page)?.label}
            </div>
          </div>

          <div className="flex items-center gap-3">

            {/* ── Network + live block pill ──────────────────────────────── */}
            <div className="hidden md:flex items-center gap-2 text-[9px] font-black uppercase tracking-widest text-gray-500 border border-polkadot-border rounded-lg px-3 py-1.5 bg-black/20">
              <span className="relative flex h-1.5 w-1.5 shrink-0">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
              </span>
              <span>PAS HUB</span>
              {blockNumber !== undefined ? (
                <span className="text-gray-400 font-mono">#{blockNumber.toLocaleString()}</span>
              ) : (
                <span className="text-gray-700 animate-pulse">syncing…</span>
              )}
            </div>

            {/* ── Wallet button / dropdown ───────────────────────────────── */}
            {isConnected ? (
              <div ref={walletRef} className="relative">
                <button
                  onClick={() => setWalletOpen(o => !o)}
                  className={`flex items-center gap-2 text-[11px] border px-3 py-1.5 rounded-lg font-mono transition-all ${
                    walletOpen
                      ? 'border-polkadot-pink text-white bg-polkadot-pink/10'
                      : 'border-polkadot-border bg-white/5 text-gray-300'
                  }`}
                >
                  <span className="text-polkadot-pink font-black hidden sm:inline">
                    {balNum !== null ? balShort : <span className="animate-pulse text-gray-600">···</span>}
                  </span>
                  <span>{address!.slice(0, 6)}…{address!.slice(-4)}</span>
                </button>

                {walletOpen && (
                  <div className="absolute right-0 mt-2 w-64 bg-polkadot-card border border-polkadot-border rounded-xl shadow-2xl z-50 overflow-hidden">
                    <div className="p-4 space-y-3">

                      <div>
                        <div className="text-[9px] text-gray-600 font-black uppercase tracking-widest mb-1">Active Identity</div>
                        <div className="font-mono text-[10px] text-white break-all bg-black/20 p-2 rounded-lg border border-white/5 leading-relaxed">
                          {address}
                        </div>
                      </div>

                      <div className="flex justify-between items-center border-t border-white/5 pt-3">
                        <div>
                          <div className="text-[9px] text-gray-600 font-black uppercase tracking-widest mb-0.5">Balance</div>
                          <div className="font-mono text-sm font-black text-polkadot-pink">
                            {balNum !== null ? balFull : <span className="animate-pulse text-gray-600 text-xs">Loading…</span>}
                          </div>
                        </div>
                        <button
                          onClick={copyAddress}
                          className="text-[9px] font-black uppercase text-gray-500 hover:text-white transition-colors"
                        >
                          {copied ? '✓' : 'Copy'}
                        </button>
                      </div>

                      <button
                        onClick={() => { disconnect(); setWalletOpen(false); }}
                        className="w-full px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-[10px] font-black uppercase tracking-widest hover:bg-red-500 hover:text-white transition-all"
                      >
                        Disconnect
                      </button>

                    </div>
                  </div>
                )}
              </div>
            ) : (
              <button
                onClick={() => connect({ connector: injected() })}
                className="bg-polkadot-pink hover:bg-pink-600 text-white text-[10px] font-black uppercase tracking-widest px-6 py-2.5 rounded-xl transition-all shadow-lg"
              >
                Connect Wallet
              </button>
            )}

          </div>
        </header>

        {/* ── Wrong network banner ─────────────────────────────────────────── */}
        {isWrongNetwork && (
          <div className="bg-yellow-500 text-black px-6 py-2 text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-4">
            ⚠️ Network Mismatch — switch to Polkadot Hub TestNet
            <button
              onClick={() => switchChain({ chainId: pasTestnet.id })}
              className="bg-black text-white px-3 py-1 rounded-lg text-[9px] hover:opacity-80"
            >
              Switch Now
            </button>
          </div>
        )}

        {/* ── Page content ────────────────────────────────────────────────── */}
        <main className="flex-1">
          {page === 'home'        && <Home        onNavigate={navigate} />}
          {page === 'lookup'      && <Lookup />}
          {page === 'leaderboard' && <Leaderboard />}
          {page === 'lending'     && <LendingDemo />}
          {page === 'send'        && <SendPAS     onSuccess={() => refetchBal()} />}
          {page === 'fees'        && <FeeCalculator />}
          {page === 'stables'     && <SendStablecoin />}
          {page === 'wallet'      && <CreateWallet onNavigateHome={() => navigate('home')} />}
        </main>

        {/* ── Footer ──────────────────────────────────────────────────────── */}
        <footer className="border-t border-polkadot-border px-8 py-6 bg-black/20">
          <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="text-[10px] font-black uppercase tracking-[0.3em] text-gray-600">
              VeraScore Protocol v2.1
            </div>
            <a
              href={`${EXPLORER}/address/${SCORE_NFT_PROXY}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[9px] font-mono text-gray-700 hover:text-polkadot-pink transition-all"
            >
              PROXY: {SCORE_NFT_PROXY?.slice(0, 10)}…{SCORE_NFT_PROXY?.slice(-6)} ↗
            </a>
          </div>
        </footer>

      </div>
    </div>
  );
}