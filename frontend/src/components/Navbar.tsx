import { ShieldCheck, Wallet } from 'lucide-react'
import { useApp, type Tab } from '../state/context'
import { CHAIN_ID, EXPLORER_URL, NETWORK_NAME, explorerAddress, CONTRACT_ADDRESS } from '../lib/chain'
import { shortAddr } from '../lib/format'

const NAV: { tab: Tab; label: string }[] = [
  { tab: 'terminal', label: 'Terminal' },
  { tab: 'mempool', label: 'Mempool Inspector' },
  { tab: 'bonds', label: 'Sequencer Bonds' },
  { tab: 'about', label: 'Architecture / About' },
]

function ModeToggle() {
  const { mode, setMode } = useApp()
  const seg = (m: 'live' | 'guest', label: string) => (
    <button
      type="button"
      onClick={() => setMode(m)}
      aria-pressed={mode === m}
      className={`whitespace-nowrap rounded-md px-2.5 py-1 text-xs font-semibold transition ${
        mode === m
          ? m === 'live' ? 'bg-shield-500 text-ink-950' : 'bg-amberx-500 text-ink-950'
          : 'text-slate-400 hover:text-slate-200'
      }`}
    >
      {label}
    </button>
  )
  return (
    <div className="flex flex-nowrap items-center gap-0.5 rounded-lg border border-ink-600 bg-ink-850 p-0.5" role="group" aria-label="Data mode">
      {seg('live', 'Live Contract')}
      {seg('guest', 'Guest Mode')}
    </div>
  )
}

function WalletButton() {
  const { wallet, connect, mode } = useApp()
  if (mode === 'guest') {
    return (
      <span className="btn-ghost whitespace-nowrap !px-2.5 !py-1.5 text-xs" title="Guest mode needs no wallet">
        <Wallet size={14} /> No wallet needed
      </span>
    )
  }
  if (wallet.account) {
    return (
      <a
        href={explorerAddress(wallet.account)}
        target="_blank"
        rel="noreferrer"
        className="btn-ghost whitespace-nowrap !px-2.5 !py-1.5 font-mono text-xs"
        title={wallet.account}
      >
        <span className="h-1.5 w-1.5 rounded-full bg-shield-400" />
        {shortAddr(wallet.account)}
      </a>
    )
  }
  return (
    <button type="button" onClick={() => void connect()} className="btn-primary whitespace-nowrap !px-3 !py-1.5 text-xs">
      <Wallet size={14} /> 0x… Connect
    </button>
  )
}

export function Navbar() {
  const { tab, setTab } = useApp()
  return (
    <header className="sticky top-0 z-40 border-b border-ink-700 bg-ink-950/90 backdrop-blur">
      <nav className="flex h-16 w-full flex-nowrap items-center justify-between gap-4 px-6" aria-label="Primary">
        <div className="flex shrink-0 flex-nowrap items-center gap-2.5 whitespace-nowrap">
          <ShieldCheck className="text-shield-400" size={24} strokeWidth={2.2} />
          <span className="whitespace-nowrap text-[15px] font-bold tracking-tight text-white">FrontrunShield</span>
          <span className="badge hidden border-ink-500 bg-ink-800 normal-case text-slate-300 lg:inline-flex">v1.0-alpha</span>
          <span className="hidden flex-nowrap items-center gap-1.5 whitespace-nowrap text-xs text-slate-300 min-[1360px]:inline-flex" title={`GenLayer ${NETWORK_NAME}`}>
            <span className="h-2 w-2 animate-pulseRing rounded-full bg-shield-400" />
            {NETWORK_NAME} ({CHAIN_ID})
          </span>
        </div>

        <ul className="no-scrollbar flex min-w-0 flex-nowrap items-center gap-0.5 overflow-x-auto">
          {NAV.map((n) => (
            <li key={n.tab} className="shrink-0">
              <button
                type="button"
                onClick={() => setTab(n.tab)}
                aria-current={tab === n.tab ? 'page' : undefined}
                className={`whitespace-nowrap rounded-md px-2.5 py-1.5 text-[13px] font-medium transition ${
                  tab === n.tab ? 'bg-ink-700 text-white' : 'text-slate-400 hover:bg-ink-800 hover:text-slate-100'
                }`}
              >
                {n.label}
              </button>
            </li>
          ))}
          <li className="shrink-0">
            <a
              href={explorerAddress(CONTRACT_ADDRESS) || EXPLORER_URL}
              target="_blank"
              rel="noreferrer"
              className="inline-flex flex-nowrap items-center gap-1 whitespace-nowrap rounded-md px-2.5 py-1.5 text-[13px] font-medium text-slate-400 transition hover:bg-ink-800 hover:text-slate-100"
            >
              Explorer ↗
            </a>
          </li>
        </ul>

        <div className="flex shrink-0 flex-nowrap items-center gap-2.5">
          <ModeToggle />
          <WalletButton />
        </div>
      </nav>
    </header>
  )
}

