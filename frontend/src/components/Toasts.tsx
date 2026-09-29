import { CheckCircle2, Info, X, XCircle } from 'lucide-react'
import { useApp } from '../state/context'

export function Toasts() {
  const { toasts, dismissToast } = useApp()
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-[min(92vw,380px)] flex-col gap-2" aria-live="polite">
      {toasts.map((t) => {
        const Icon = t.kind === 'ok' ? CheckCircle2 : t.kind === 'err' ? XCircle : Info
        const tone = t.kind === 'ok' ? 'border-shield-600 text-shield-400' : t.kind === 'err' ? 'border-toxic-600 text-toxic-400' : 'border-cyanx-500 text-cyanx-400'
        return (
          <div key={t.id} className={`pointer-events-auto animate-fadeUp rounded-xl border ${tone} bg-ink-850 p-3 shadow-2xl`}>
            <div className="flex items-start gap-2.5">
              <Icon size={18} className="mt-0.5 shrink-0" />
              <div className="min-w-0 flex-1 text-sm text-slate-200">
                <p className="break-words">{t.text}</p>
                {t.href && (
                  <a href={t.href} target="_blank" rel="noreferrer" className="mt-1 inline-block text-xs font-semibold text-cyanx-400 hover:underline">
                    View on explorer ↗
                  </a>
                )}
              </div>
              <button type="button" aria-label="Dismiss" onClick={() => dismissToast(t.id)} className="text-slate-500 hover:text-slate-200">
                <X size={14} />
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
