import { useState, useRef, useEffect, useCallback } from 'react';
import {
  useAccount, useConnect, useDisconnect,
  useChainId, useSwitchChain, useBlockNumber, useBalance,
} from 'wagmi';
import { injected }          from 'wagmi/connectors';
import { Sidebar }           from './components/Sidebar.js';
import type { Page }         from './components/Sidebar.js';
import { NAV }               from './components/Sidebar.js';
import { Home }              from './pages/Home.js';
import { Lookup }            from './pages/Lookup.js';
import { LendingDemo }       from './pages/LendingDemo.js';
import { SendPAS }           from './pages/SendPAS.js';
import { FeeCalculator }     from './pages/FeeCalculator.js';
import { Leaderboard }      from './pages/Leaderboard.js';
import { CreateWallet }     from './pages/CreateWallet.js';
import { SendStablecoin }   from './pages/SendStablecoin.js';
import { pasTestnet, SCORE_NFT_PROXY } from './utils/wagmi.js';

const EXPLORER = 'https://polkadot.testnet.routescan.io';

export default function App() {
  const { address, isConnected } = useAccount();
  const { connect }              = useConnect();
  const { disconnect }           = useDisconnect();
  const chainId                  = useChainId();
  const { switchChain }          = useSwitchChain();

  const { data: balData, refetch: refetchBal } = useBalance({
    address,
    chainId: pasTestnet.id,
    query:   { refetchInterval: 4_000 },
  });
  const balNum   = balData ? Number(balData.value) / 1e18 : null;
  const balShort = balNum !== null
    ? balNum.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' PAS'
    : '—';
  const balFull  = balNum !== null
    ? balNum.toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 4 }) + ' PAS'
    : '—';

  const [page,        setPage]        = useState<Page>('home');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [walletOpen,  setWalletOpen]  = useState(false);
  const [copied,      setCopied]      = useState(false);

  const walletRef  = useRef<HTMLDivElement>(null);
  const sidebarRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onOut(e: MouseEvent) {
      if (walletRef.current && !walletRef.current.contains(e.target as Node))
        setWalletOpen(false);
    }
    document.addEventListener('mousedown', onOut);
    return () => document.removeEventListener('mousedown', onOut);
  }, []);

  useEffect(() => {
    function onOut(e: MouseEvent) {
      if (sidebarRef.current && !sidebarRef.current.contains(e.target as Node))
        setSidebarOpen(false);
    }
    document.addEventListener('mousedown', onOut);
    return () => document.removeEventListener('mousedown', onOut);
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { setSidebarOpen(false); setWalletOpen(false); }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const navigate = useCallback((p: Page) => {
    setPage(p);
    setSidebarOpen(false);
  }, []);

  function copyAddress() {
    if (!address) return;
    navigator.clipboard.writeText(address).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  const { data: blockNumber } = useBlockNumber({
    chainId: pasTestnet.id,
    query:   { refetchInterval: 6_000 },
  });

  const isWrongNetwork = isConnected && chainId !== pasTestnet.id;

  return (
    <div className="min-h-screen bg-polkadot-dark text-white flex">

      {/* Desktop sidebar */}
      <aside className="hidden lg:flex flex-col w-56 shrink-0 border-r border-polkadot-border bg-polkadot-card fixed top-0 left-0 h-full z-30">
        <Sidebar page={page} onNavigate={navigate} />
      </aside>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="absolute inset-0 bg-black/60"
            onClick={() => setSidebarOpen(false)}
          />
          <aside
            ref={sidebarRef}
            className="absolute left-0 top-0 h-full w-56 bg-polkadot-card border-r border-polkadot-border z-50"
          >
            <Sidebar page={page} onNavigate={navigate} />
          </aside>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col min-h-screen lg:ml-56">

        {/* Topbar */}
        <header className="sticky top-0 z-20 border-b border-polkadot-border bg-polkadot-dark/95 backdrop-blur px-4 sm:px-6 py-3 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(o => !o)}
              className="lg:hidden p-1.5 rounded-lg hover:bg-white/5 text-gray-400 hover:text-white transition-colors"
              aria-label="Toggle sidebar"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <div className="text-sm font-medium text-gray-300 hidden sm:block">
              {NAV.find(n => n.id === page)?.label}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="hidden sm:flex items-center gap-2 text-[11px] text-gray-500 border border-polkadot-border rounded-lg px-3 py-1.5 font-mono bg-polkadot-card">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
              <span>PAS TestNet</span>
              {blockNumber !== undefined && (
                <><span className="text-polkadot-border">·</span><span>#{blockNumber.toLocaleString()}</span></>
              )}
            </div>

            {isWrongNetwork && (
              <button
                onClick={() => switchChain({ chainId: pasTestnet.id })}
                className="text-xs bg-yellow-500 hover:bg-yellow-400 text-black px-3 py-1.5 rounded-lg font-medium transition-colors"
              >
                Switch Network
              </button>
            )}

            {isConnected ? (
              <div ref={walletRef} className="relative">
                <button
                  onClick={() => setWalletOpen(o => !o)}
                  className={`flex items-center gap-2 text-xs border px-3 py-1.5 rounded-lg font-mono transition-colors ${
                    walletOpen
                      ? 'border-polkadot-pink text-white bg-polkadot-pink/10'
                      : 'border-polkadot-border hover:border-gray-500 text-gray-300'
                  }`}
                >
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-green-500 shrink-0" />
                  <span className="text-polkadot-pink font-semibold hidden sm:inline">{balShort}</span>
                  <span className="text-gray-400 hidden sm:inline text-[10px]">·</span>
                  <span>{address!.slice(0, 6)}…{address!.slice(-4)}</span>
                  <svg
                    className={`w-3 h-3 transition-transform ${walletOpen ? 'rotate-180' : ''}`}
                    fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {walletOpen && (
                  <div className="absolute right-0 mt-2 w-72 bg-polkadot-card border border-polkadot-border rounded-xl shadow-2xl z-50 overflow-hidden">
                    <div className="px-4 py-3 border-b border-polkadot-border">
                      <div className="text-[10px] text-gray-500 uppercase tracking-widest mb-1">Connected Wallet</div>
                      <div className="font-mono text-xs text-gray-200 break-all">{address}</div>
                    </div>
                    <div className="px-4 py-3 border-b border-polkadot-border flex items-center justify-between">
                      <div className="text-[10px] text-gray-500 uppercase tracking-widest">Balance</div>
                      <div className="font-mono text-sm text-polkadot-pink font-bold">{balFull}</div>
                    </div>
                    <div className="px-4 py-2.5 border-b border-polkadot-border flex items-center justify-between">
                      <div className="text-[10px] text-gray-500 uppercase tracking-widest">Network</div>
                      <div className="text-[11px] flex items-center gap-1.5">
                        {isWrongNetwork
                          ? <span className="text-yellow-400">⚠ Wrong network</span>
                          : <><span className="inline-block w-1.5 h-1.5 rounded-full bg-green-500" /><span className="text-gray-300">PAS TestNet</span></>
                        }
                      </div>
                    </div>
                    <div className="py-1">
                      <button
                        onClick={copyAddress}
                        className="w-full text-left px-4 py-2.5 text-sm text-gray-300 hover:bg-polkadot-dark hover:text-white transition-colors flex items-center gap-3"
                      >
                        {copied
                          ? <><span className="text-green-400">✓</span><span className="text-green-400">Copied!</span></>
                          : <><span>📋</span><span>Copy address</span></>
                        }
                      </button>
                      <a
                        href={`${EXPLORER}/address/${address}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={() => setWalletOpen(false)}
                        className="w-full text-left px-4 py-2.5 text-sm text-gray-300 hover:bg-polkadot-dark hover:text-white transition-colors flex items-center gap-3"
                      >
                        <span>↗</span><span>View on Explorer</span>
                      </a>
                      <button
                        onClick={() => { navigate('send'); setWalletOpen(false); }}
                        className="w-full text-left px-4 py-2.5 text-sm text-gray-300 hover:bg-polkadot-dark hover:text-white transition-colors flex items-center gap-3"
                      >
                        <span>↑</span><span>Send PAS</span>
                      </button>
                      <div className="border-t border-polkadot-border mx-4 my-1" />
                      <button
                        onClick={() => { disconnect(); setWalletOpen(false); }}
                        className="w-full text-left px-4 py-2.5 text-sm text-red-400 hover:bg-red-950 hover:text-red-300 transition-colors flex items-center gap-3"
                      >
                        <span>⏏</span><span>Disconnect</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <button
                onClick={() => connect({ connector: injected() })}
                className="bg-polkadot-pink hover:bg-pink-600 text-white text-sm px-4 py-2 rounded-lg font-medium transition-colors"
              >
                Connect Wallet
              </button>
            )}
          </div>
        </header>

        {/* Wrong network banner */}
        {isWrongNetwork && (
          <div className="flex items-center justify-between bg-yellow-900/40 border-b border-yellow-800/50 px-5 py-2.5 text-sm">
            <span className="text-yellow-300 text-xs font-medium">
              ⚠ Wrong network — switch to Polkadot Hub TestNet to transact
            </span>
            <button
              onClick={() => switchChain({ chainId: pasTestnet.id })}
              className="ml-4 shrink-0 bg-yellow-500 hover:bg-yellow-400 text-black font-bold px-3 py-1 rounded-lg text-xs transition"
            >
              Switch
            </button>
          </div>
        )}

        {/* Page content */}
        <main className="flex-1">
          {page === 'home'    && <Home    onNavigate={navigate} />}
          {page === 'lookup'      && <Lookup />}
          {page === 'leaderboard' && <Leaderboard />}
          {page === 'lending' && <LendingDemo />}
          {page === 'send'    && <SendPAS onSuccess={() => refetchBal()} />}
          {page === 'fees'    && <FeeCalculator />}
          {page === 'stables' && <SendStablecoin />}
          {page === 'wallet'  && <CreateWallet onNavigateHome={() => navigate('home')} />}
        </main>

        {/* Footer */}
        <footer className="border-t border-polkadot-border px-5 py-4 shrink-0">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-2 text-[11px] text-gray-700">
            <span>VeraScore · AI Credit Scoring · Polkadot Hub PAS TestNet · Hackathon 2026</span>
            <a
              href={`${EXPLORER}/address/${SCORE_NFT_PROXY}`}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-gray-500 font-mono transition-colors"
            >
              ScoreNFT: {SCORE_NFT_PROXY?.slice(0, 10)}…{SCORE_NFT_PROXY?.slice(-6)} ↗
            </a>
          </div>
        </footer>
      </div>
    </div>
  );
}