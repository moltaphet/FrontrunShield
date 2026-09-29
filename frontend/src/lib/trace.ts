import type { Bundle, PricePath } from './types'

/** Telemetry URLs may carry the trace as query fields (the demo trace service
 *  echoes them back). Parse them for the inspector; absent fields are simply
 *  missing. */
export function parseTrace(url: string): Record<string, string> {
  try {
    const out: Record<string, string> = {}
    new URL(url).searchParams.forEach((v, k) => {
      out[k] = v
    })
    return out
  } catch {
    return {}
  }
}

const num = (v: string | undefined): number | null => {
  if (v === undefined) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/** Price path for the mini chart: real trace values when the bundle carries
 *  them, otherwise a path implied by the recorded victim slippage. */
export function pricePathFor(b: Bundle, trace: Record<string, string>): PricePath {
  const before = num(trace.pool_price_before)
  const front = num(trace.pool_price_after_frontrun)
  const victim = num(trace.victim_exec_price)
  const back = num(trace.pool_price_after_backrun) ?? num(trace.pool_price_after)
  if (before !== null && front !== null && back !== null) {
    return {
      before,
      afterFrontrun: front,
      victimExec: victim ?? front,
      afterBackrun: back,
      external: num(trace.external_ref_price),
    }
  }
  const base = 3000
  const move = (b.slippageBps / 10_000) * base * 0.95
  return {
    before: base,
    afterFrontrun: base + move,
    victimExec: base + move * 0.99,
    afterBackrun: base + move * 0.02,
    external: base + 0.5,
  }
}

/** Human labels for what the bot legs did, from trace fields when available. */
export function legNotes(trace: Record<string, string>) {
  return {
    frontrun: trace.bot_leg1 ?? 'Bot buys the victim’s asset on the same pool',
    backrun: trace.bot_leg2 ?? 'Bot sells back immediately after the victim',
    block: trace.block ? `Block ${Number(trace.block).toLocaleString('en-US')}` : null,
    sameBlock: trace.same_block ? trace.same_block === 'true' : null,
    victimPriority: num(trace.victim_priority_gwei),
  }
}
