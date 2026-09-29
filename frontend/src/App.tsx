import { Navbar } from './components/Navbar'
import { NetworkAlert } from './components/NetworkAlert'
import { DataBanner } from './components/DataBanner'
import { Footer } from './components/Footer'
import { Toasts } from './components/Toasts'
import { useApp } from './state/context'
import { TerminalView } from './views/TerminalView'
import { MempoolView } from './views/MempoolView'
import { BondsView } from './views/BondsView'
import { AboutView } from './views/AboutView'

export default function App() {
  const { tab } = useApp()
  return (
    <div className="min-h-screen">
      <Navbar />
      <NetworkAlert />
      <main className="mx-auto max-w-[1400px] space-y-5 px-6 pb-4 pt-6">
        {tab !== 'about' && <DataBanner />}
        {tab === 'terminal' && <TerminalView />}
        {tab === 'mempool' && <MempoolView />}
        {tab === 'bonds' && <BondsView />}
        {tab === 'about' && <AboutView />}
      </main>
      <Footer />
      <Toasts />
    </div>
  )
}
