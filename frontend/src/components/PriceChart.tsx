import type { PricePath } from '../lib/types'

/** Four-point pool price path: before -> after frontrun -> victim fill -> after backrun. */
export function PriceChart({ path }: { path: PricePath }) {
  const pts = [path.before, path.afterFrontrun, path.victimExec, path.afterBackrun]
  const all = path.external === null ? pts : [...pts, path.external]
  const lo = Math.min(...all)
  const hi = Math.max(...all)
  const span = hi - lo || 1
  const W = 320, H = 110, PX = 22, PY = 14
  const x = (i: number) => PX + (i * (W - PX * 2)) / 3
  const y = (p: number) => H - PY - ((p - lo) / span) * (H - PY * 2)
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p).toFixed(1)}`).join(' ')
  const labels = ['pre', 'frontrun', 'victim', 'backrun']
  const dec = hi < 1 ? 7 : hi < 100 ? 2 : 0
  return (
    <svg viewBox={`0 0 ${W} ${H + 16}`} className="h-auto w-full" role="img" aria-label="Pool price path across the bundle">
      {path.external !== null && (
        <g>
          <line x1={PX} x2={W - PX} y1={y(path.external)} y2={y(path.external)} stroke="#5ad2ff" strokeDasharray="3 4" strokeWidth="1" opacity="0.7" />
          <text x={W - PX} y={y(path.external) - 4} textAnchor="end" fontSize="8" fill="#5ad2ff">external ref {path.external.toFixed(dec)}</text>
        </g>
      )}
      <path d={d} fill="none" stroke="#ff6b6b" strokeWidth="2" strokeLinejoin="round" />
      {pts.map((p, i) => (
        <g key={labels[i]}>
          <circle cx={x(i)} cy={y(p)} r="3.5" fill={i === 2 ? '#ffc857' : '#ff6b6b'} />
          <text x={x(i)} y={H + 10} textAnchor="middle" fontSize="8.5" fill="#8b98ad">{labels[i]}</text>
        </g>
      ))}
    </svg>
  )
}
