import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { AppContext, type AppState, type RunState, type Tab, type Toast, type Wallet } from './context'
import { CHAIN_ID, explorerTx } from '../lib/chain'
import {
  connectAccount, currentChainId, existingAccount, getProvider, readSnapshot, switchToStudioNext, writeContract,
} from '../lib/contract'
import type { DataMode, Snapshot } from '../lib/types'
import { guestSnapshot, simulateEvaluate, simulateStake } from '../data/guestData'

const EMPTY_RUN: RunState = { bundleId: null, phase: 'idle', simulated: false, feeWei: null, txHash: null, votes: [], verdict: null, error: null }
const EMPTY_SNAPSHOT: Snapshot = {
  sequencers: [], bundles: [], verdicts: [],
  metrics: {
    totalSlashed: 0n, activeBonds: 0n, insurancePool: 0n, restitutionPaid: 0n, bundlesAnalyzed: 0, bundlesTotal: 0,
    toxicCount: 0, benignCount: 0, sequencerCount: 0, contractBalance: 0n, minBond: 0n, solvent: true,
  },
}
const TABS: Tab[] = ['terminal', 'mempool', 'bonds', 'about']
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

function stored(key: string): string | null {
  try { return localStorage.getItem(key) } catch { return null }
}
function store(key: string, v: string) {
  try { localStorage.setItem(key, v) } catch { /* storage unavailable */ }
}
const errText = (e: unknown) => (e instanceof Error ? e.message : String(e)).split('\n')[0].slice(0, 220)

export function AppProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<DataMode>(() => (stored('fs.mode') === 'guest' ? 'guest' : 'live'))
  const [snapshot, setSnapshot] = useState<Snapshot>(EMPTY_SNAPSHOT)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [tab, setTabState] = useState<Tab>(() => {
    const h = window.location.hash.replace('#', '') as Tab
    return TABS.includes(h) ? h : 'terminal'
  })
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [wallet, setWallet] = useState<Wallet>(() => ({ hasProvider: getProvider() !== null, account: null, chainId: null }))
  const [run, setRun] = useState<RunState>(EMPTY_RUN)
  const [toasts, setToasts] = useState<Toast[]>([])
  const guestRef = useRef<Snapshot>(guestSnapshot())
  const toastId = useRef(1)

  const toast = useCallback((kind: Toast['kind'], text: string, href?: string) => {
    const id = toastId.current++
    setToasts((t) => [...t, { id, kind, text, href }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 9000)
  }, [])
  const dismissToast = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), [])

  const setTab = useCallback((t: Tab) => {
    setTabState(t)
    window.history.replaceState(null, '', `#${t}`)
  }, [])

  // ------------------------------------------------------------- data ---
  const refresh = useCallback(async () => {
    if (mode === 'guest') {
      setSnapshot(guestRef.current)
      setLoading(false)
      setLoadError(null)
      return
    }
    try {
      setSnapshot(await readSnapshot())
      setLoadError(null)
    } catch (e) {
      setLoadError(errText(e))
    } finally {
      setLoading(false)
    }
  }, [mode])

  useEffect(() => {
    void refresh()
    if (mode !== 'live') return
    const t = setInterval(() => { if (!document.hidden) void refresh() }, 20000)
    return () => clearInterval(t)
  }, [mode, refresh])

  const setMode = useCallback((m: DataMode) => {
    store('fs.mode', m)
    setLoading(true)
    setModeState(m)
    setRun(EMPTY_RUN)
    setSelectedId(null)
  }, [])

  // ----------------------------------------------------------- wallet ---
  useEffect(() => {
    const p = getProvider()
    if (!p) return
    let alive = true
    void (async () => {
      try {
        const [account, chainId] = [await existingAccount(p), await currentChainId(p)]
        if (alive) setWallet({ hasProvider: true, account, chainId })
      } catch { /* wallet locked or unavailable */ }
    })()
    const onAccounts = (a: unknown) => setWallet((w) => ({ ...w, account: (a as string[])[0] ?? null }))
    const onChain = (c: unknown) => setWallet((w) => ({ ...w, chainId: parseInt(String(c), 16) }))
    p.on?.('accountsChanged', onAccounts)
    p.on?.('chainChanged', onChain)
    return () => {
      alive = false
      p.removeListener?.('accountsChanged', onAccounts)
      p.removeListener?.('chainChanged', onChain)
    }
  }, [])

  const connect = useCallback(async () => {
    const p = getProvider()
    if (!p) { toast('err', 'No injected wallet found. Install MetaMask, or use Guest Mode.'); return }
    try {
      const account = await connectAccount(p)
      setWallet({ hasProvider: true, account, chainId: await currentChainId(p) })
    } catch (e) { toast('err', errText(e)) }
  }, [toast])

  const switchNetwork = useCallback(async () => {
    const p = getProvider()
    if (!p) return
    try {
      await switchToStudioNext(p)
      setWallet((w) => ({ ...w }))
    } catch (e) { toast('err', errText(e)) }
  }, [toast])

  const wrongNetwork = mode === 'live' && wallet.account !== null && wallet.chainId !== null && wallet.chainId !== CHAIN_ID

  // ---------------------------------------------------------- actions ---
  const selectBundle = useCallback((id: number) => setSelectedId(id), [])
  const resetRun = useCallback(() => setRun(EMPTY_RUN), [])

  const requireLive = useCallback((): string | null => {
    if (!wallet.account) { toast('err', 'Connect a wallet to send transactions - or switch to Guest Mode.'); return null }
    if (wallet.chainId !== CHAIN_ID) { toast('err', 'Switch your wallet to Studio Next (61997) first.'); return null }
    return wallet.account
  }, [wallet, toast])

  const evaluate = useCallback(async (bundleId: number) => {
    if (run.phase === 'ingesting' || run.phase === 'consensus' || run.phase === 'settling') return
    setSelectedId(bundleId) // keep the runner on this bundle after it stops being PENDING
    const base: RunState = { ...EMPTY_RUN, bundleId, phase: 'ingesting', simulated: mode === 'guest' }
    if (mode === 'guest') {
      setRun(base)
      await sleep(1500)
      setRun((r) => ({ ...r, phase: 'consensus' }))
      await sleep(2400)
      setRun((r) => ({ ...r, phase: 'settling' }))
      await sleep(1400)
      const out = simulateEvaluate(guestRef.current, bundleId)
      guestRef.current = out.snapshot
      setSnapshot(out.snapshot)
      setRun((r) => ({ ...r, phase: 'done', votes: out.votes, verdict: out.verdict }))
      return
    }
    const account = requireLive()
    if (!account) return
    setRun(base)
    try {
      const res = await writeContract(account, 'evaluate_bundle_forensics', [BigInt(bundleId)], 0n, {
        onFeeQuote: (fee) => setRun((r) => ({ ...r, feeWei: fee })),
        onSubmitted: (hash) => setRun((r) => ({ ...r, phase: 'consensus', txHash: hash })),
      })
      setRun((r) => ({ ...r, phase: 'settling', votes: res.votes, txHash: res.hash }))
      const fresh = await readSnapshot()
      setSnapshot(fresh)
      const verdict = fresh.verdicts.find((v) => v.bundleId === bundleId) ?? null
      setRun((r) => ({ ...r, phase: 'done', verdict }))
      toast('ok', 'Consensus reached - verdict settled on-chain.', explorerTx(res.hash))
    } catch (e) {
      const msg = errText(e)
      setRun((r) => ({ ...r, phase: 'error', error: /reject|denied|cancel/i.test(msg) ? 'Transaction rejected in wallet.' : msg }))
    }
  }, [mode, run.phase, requireLive, toast])

  const stake = useCallback(async (name: string, builderHex: string, amountGen: string): Promise<boolean> => {
    const clean = amountGen.trim()
    if (!/^\d+(\.\d{1,6})?$/.test(clean) || Number(clean) <= 0) { toast('err', 'Enter a valid GEN amount.'); return false }
    const [w, f = ''] = clean.split('.')
    const wei = BigInt(w) * 10n ** 18n + BigInt(f.padEnd(18, '0'))
    if (mode === 'guest') {
      if (wei < snapshot.metrics.minBond) { toast('err', 'Below the 0.25 GEN minimum bond.'); return false }
      guestRef.current = simulateStake(guestRef.current, name.trim() || 'Guest Builder', wei)
      setSnapshot(guestRef.current)
      toast('ok', `Simulated bond of ${clean} GEN posted (guest mode - nothing was sent).`)
      return true
    }
    const account = requireLive()
    if (!account) return false
    try {
      const res = await writeContract(account, 'stake_builder_bond', [name.trim(), builderHex.trim()], wei)
      await refresh()
      toast('ok', 'Bond posted on-chain.', explorerTx(res.hash))
      return true
    } catch (e) { toast('err', errText(e)); return false }
  }, [mode, snapshot.metrics.minBond, requireLive, refresh, toast])

  const claim = useCallback(async (bundleId: number) => {
    if (mode === 'guest') { toast('info', 'Restitution claims are simulated in guest mode.'); return }
    const account = requireLive()
    if (!account) return
    try {
      const res = await writeContract(account, 'claim_restitution', [BigInt(bundleId)], 0n)
      await refresh()
      toast('ok', 'Restitution transfer queued.', explorerTx(res.hash))
    } catch (e) { toast('err', errText(e)) }
  }, [mode, requireLive, refresh, toast])

  const selectedBundle = useMemo(() => {
    const bs = snapshot.bundles
    return bs.find((b) => b.id === selectedId) ?? bs.find((b) => b.status === 'PENDING') ?? bs[bs.length - 1] ?? null
  }, [snapshot.bundles, selectedId])

  const value: AppState = {
    mode, setMode, snapshot, loading, loadError, refresh, tab, setTab, selectedBundle, selectBundle,
    wallet, connect, switchNetwork, wrongNetwork, run, evaluate, resetRun, stake, claim, toasts, dismissToast,
  }
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}
