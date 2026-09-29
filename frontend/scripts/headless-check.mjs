// Headless browser verification for the FrontrunShield dashboard.
//
//   npm run build && npm run preview -- --port 4173 &
//   npm run check:headless                       # URL=http://127.0.0.1:4173
//
// Asserts: zero console errors / page errors / failed requests while the LIVE
// contract loads, live data actually renders, the navbar never wraps to a second
// line at several viewport widths, every tab renders, the wrong-network alert
// appears with a working 1-click switch, and the guest-mode slashing simulation
// runs to a verdict. Exits non-zero on any failure.
import puppeteer from 'puppeteer-core'
import { mkdirSync } from 'node:fs'

const URL = process.env.URL ?? 'http://127.0.0.1:4173'
const CHROME = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const SHOTS = process.env.SHOT_DIR ?? '.headless-shots'
mkdirSync(SHOTS, { recursive: true })

const results = []
const check = (name, ok, detail = '') => {
  results.push({ name, ok })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  - ${detail}` : ''}`)
}

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] })

async function freshPage(width = 1440, height = 900, { fakeWallet } = {}) {
  const page = await browser.newPage()
  await page.setViewport({ width, height })
  const problems = []
  page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) problems.push(`console.${m.type()}: ${m.text()}`) })
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`))
  page.on('requestfailed', (r) => problems.push(`requestfailed: ${r.url()} ${r.failure()?.errorText}`))
  page.on('response', (r) => { if (r.status() >= 400) problems.push(`http ${r.status()}: ${r.url()}`) })
  if (fakeWallet) await page.evaluateOnNewDocument(fakeWallet)
  return { page, problems }
}

const text = (page) => page.evaluate(() => document.body.innerText)
const waitText = (page, needle, timeout = 60000) =>
  page.waitForFunction((n) => document.body.innerText.toLowerCase().includes(n.toLowerCase()), { timeout }, needle)
const clickText = async (page, selector, label) => {
  const ok = await page.evaluate((sel, l) => {
    const el = [...document.querySelectorAll(sel)].find((e) => e.textContent.trim().includes(l))
    if (el) el.click()
    return Boolean(el)
  }, selector, label)
  if (!ok) throw new Error(`no ${selector} with text "${label}"`)
}

// ---- 1. live contract load: zero console errors --------------------------------
{
  const { page, problems } = await freshPage()
  await page.goto(URL, { waitUntil: 'networkidle2', timeout: 60000 })
  let loaded = true
  try { await waitText(page, 'Titan Builder #04') } catch { loaded = false }
  await new Promise((r) => setTimeout(r, 1500))
  const t = await text(page)
  check('live contract data rendered (builders from chain)', loaded && t.includes('Flashbots Alpha Relay'))
  check('live: slashed builder + on-chain verdict visible', t.includes('SLASHED') && t.includes('TOXIC'))
  check('live: KPI banner populated', /Total Slashed/i.test(t) && !/Analyzed Bundles\s*—/.test(t))
  check('live: no "Could not read the live contract" banner', !t.includes('Could not read the live contract'))
  check('zero console errors/warnings on live load', problems.length === 0, problems.slice(0, 4).join(' | '))
  await page.screenshot({ path: `${SHOTS}/01-terminal-live.png`, fullPage: true })

  // tabs
  for (const [label, needle] of [
    ['Mempool Inspector', 'Suspect bundles'],
    ['Sequencer Bonds', 'Post a builder bond'],
    ['Architecture / About', 'Why Solidity fails'],
    ['Terminal', 'Live Consensus Forensics Runner'],
  ]) {
    await clickText(page, 'nav button', label)
    await waitText(page, needle, 10000).then(
      () => check(`tab "${label}" renders`, true),
      () => check(`tab "${label}" renders`, false),
    )
  }
  await clickText(page, 'nav button', 'Architecture / About')
  await page.screenshot({ path: `${SHOTS}/02-about.png`, fullPage: true })
  await clickText(page, 'nav button', 'Sequencer Bonds')
  await page.screenshot({ path: `${SHOTS}/03-bonds-live.png`, fullPage: true })
  check('zero console errors across all tabs (live)', problems.length === 0, problems.slice(0, 4).join(' | '))
  await page.close()
}

// ---- 2. navbar is strictly single-line at every width --------------------------
for (const width of [1280, 1440, 1920]) {
  const { page } = await freshPage(width, 800)
  await page.goto(URL, { waitUntil: 'domcontentloaded' })
  await waitText(page, 'FrontrunShield', 15000)
  const m = await page.evaluate(() => {
    const header = document.querySelector('header')
    const nav = header.querySelector('nav')
    const navRect = nav.getBoundingClientRect()
    let maxLines = 0
    const walker = document.createTreeWalker(nav, NodeFilter.SHOW_TEXT)
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (!n.textContent.trim()) continue
      const r = document.createRange(); r.selectNodeContents(n)
      const tops = new Set([...r.getClientRects()].filter((q) => q.width > 0).map((q) => Math.round(q.top / 4)))
      maxLines = Math.max(maxLines, tops.size)
    }
    const ul = nav.querySelector('ul')
    const cls = nav.className
    return {
      headerHeight: Math.round(header.getBoundingClientRect().height),
      navHeight: Math.round(navRect.height),
      maxLines,
      pageOverflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      navItemsScroll: ul.scrollWidth > ul.clientWidth + 1,
      hasStrictClasses: ['flex', 'items-center', 'justify-between', 'flex-nowrap', 'w-full', 'h-16', 'px-6'].every((c) => cls.split(/\s+/).includes(c)),
      network: nav.innerText.includes('Studio Next (61997)'),
      version: nav.innerText.toLowerCase().includes('v1.0-alpha'),
    }
  })
  check(`navbar ${width}px: exactly one line (64px, no text wraps)`, m.headerHeight <= 65 && m.navHeight === 64 && m.maxLines <= 1,
    `header=${m.headerHeight}px, max text lines=${m.maxLines}`)
  check(`navbar ${width}px: strict class contract`, m.hasStrictClasses)
  check(`navbar ${width}px: no horizontal page overflow`, !m.pageOverflowX)
  console.log(`      info ${width}px: version badge=${m.version}, network label=${m.network}, nav items scroll=${m.navItemsScroll}`)
  await page.close()
}

// ---- 3. wrong network -> sticky red alert + 1-click switch --------------------------
{
  const fake = () => {
    window.__calls = []
    window.ethereum = {
      request: async ({ method, params }) => {
        window.__calls.push({ method, params })
        if (method === 'eth_chainId') return '0x1'
        if (method === 'eth_accounts' || method === 'eth_requestAccounts') return ['0x1111111111111111111111111111111111111111']
        return null
      },
      on: () => {}, removeListener: () => {},
    }
  }
  const { page } = await freshPage(1440, 900, { fakeWallet: fake })
  await page.goto(URL, { waitUntil: 'domcontentloaded' })
  await waitText(page, 'Switch to Studio Next (61997)', 15000).then(
    () => check('wrong-network alert shows the 1-click switch button', true),
    () => check('wrong-network alert shows the 1-click switch button', false),
  )
  const sticky = await page.evaluate(() => {
    const a = document.querySelector('[role="alert"]')
    return a ? getComputedStyle(a).position : null
  })
  check('wrong-network alert is sticky', sticky === 'sticky', String(sticky))
  await page.screenshot({ path: `${SHOTS}/04-wrong-network.png` })
  await clickText(page, 'button', 'Switch to Studio Next (61997)')
  await new Promise((r) => setTimeout(r, 300))
  const calls = await page.evaluate(() => window.__calls.filter((c) => c.method === 'wallet_switchEthereumChain'))
  check('switch button requests chain 0xF22D', calls.length === 1 && calls[0].params[0].chainId === '0xF22D', JSON.stringify(calls))
  await page.close()
}

// ---- 4. guest mode: simulate a slashing end to end ---------------------------------
{
  const { page, problems } = await freshPage(1440, 900, { fakeWallet: () => localStorage.setItem('fs.mode', 'guest') })
  await page.goto(URL, { waitUntil: 'networkidle2', timeout: 60000 })
  await waitText(page, 'Simulated dataset', 10000)
  const before = await text(page)
  check('guest mode: dataset loads without a wallet', before.includes('Nebula Sequencer'))
  await clickText(page, 'button', 'Evaluate Bundle Forensics')
  await waitText(page, 'Consensus running', 5000)
  await page.screenshot({ path: `${SHOTS}/05-guest-running.png`, fullPage: true })
  await waitText(page, 'BOND SLASHED', 20000).then(
    () => check('guest mode: stepper completes with a slashing verdict', true),
    () => check('guest mode: stepper completes with a slashing verdict', false),
  )
  await page.screenshot({ path: `${SHOTS}/06-guest-slashed.png`, fullPage: true })
  await clickText(page, 'nav button', 'Sequencer Bonds')
  const after = await text(page)
  check('guest mode: builder now SLASHED in the registry', /Eden Sequencer[\s\S]{0,160}SLASHED/.test(after))
  check('zero console errors in guest flow', problems.length === 0, problems.slice(0, 4).join(' | '))
  await page.close()
}

await browser.close()
const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} checks passed; screenshots in ${SHOTS}/`)
process.exit(failed.length ? 1 : 0)
