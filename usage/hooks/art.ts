// Everything the band draws with: the Calm Utility palette for each canvas, the
// price table, the formatters, and the SVG drawings (chip, robot, cache card).
// Pure: nothing here touches the engine.

import { ADVANCE, INTER_400, INTER_500, INTER_600 } from './font'
import type { Tone } from '../types'

export type Mode = 'warm' | 'cold'
export type Kind = 'wide' | 'stacked' | 'tight'

// ---------- Palette ----------
// From the Scandinavian / Calm Utility design system. Light sits on Linen with
// Deep Nordic Slate ink; dark sits on Dark Slate Charcoal with Linen ink. The
// three accents are the system's sage, seaglass teal and ochre, deepened on
// light and lifted on dark so text in them clears 4.5:1 on its canvas.
export type Palette = {
  tone: Tone
  /** The band's canvas. */
  bg: string
  /** Primary text and filled dots. */
  ink: string
  /** Labels, captions, reset times. */
  muted: string
  /** Empty dots and tracks: ink blended into the canvas. */
  empty: string
  /** Text on a filled accent chip. */
  onAccent: string
  /** Warm cache: live, positive. */
  sage: string
  /** Cold cache: informational. */
  teal: string
  /** LOW: the one warning. */
  amber: string
  /** Alpha of ink for zone fills on the card. */
  zoneAlpha: number
}

export const mix = (a: string, b: string, t: number): string =>
  '#' +
  [1, 3, 5]
    .map(i => Math.round(parseInt(a.slice(i, i + 2), 16) * (1 - t) + parseInt(b.slice(i, i + 2), 16) * t).toString(16).padStart(2, '0'))
    .join('')

const LIGHT_BG = '#eae4d4' // backgrounds-linen
const LIGHT_INK = '#2a304a' // typography-deep
const DARK_BG = '#181c28' // backgrounds-charcoal
const DARK_INK = '#eae4d4' // linen as ink

export const PALETTE: Record<Tone, Palette> = {
  light: {
    tone: 'light',
    bg: LIGHT_BG,
    ink: LIGHT_INK,
    muted: '#555d6c', // typography-ash, one step deeper: #606878 is 4.4:1 on Linen
    empty: mix(LIGHT_INK, LIGHT_BG, 0.72),
    onAccent: LIGHT_BG,
    sage: '#4a6a3c',
    teal: '#22697c',
    amber: '#94540f',
    zoneAlpha: 0.05,
  },
  dark: {
    tone: 'dark',
    bg: DARK_BG,
    ink: DARK_INK,
    muted: '#959cab',
    empty: mix(DARK_INK, DARK_BG, 0.72),
    onAccent: DARK_BG,
    sage: '#93b283',
    teal: '#6cbccf',
    amber: '#e3a35e',
    zoneAlpha: 0.055,
  },
}

/** The person's theme setting to a canvas: anything that is not a light theme draws dark. */
export const toneOf = (theme: unknown): Tone => (typeof theme === 'string' && theme.startsWith('light') ? 'light' : 'dark')

export const hueOf = (p: Palette, mode: Mode): string => (mode === 'warm' ? p.sage : p.teal)
export const WORD: Record<Mode, string> = { warm: 'WARM', cold: 'COLD' }

// ---------- The cache clock ----------
/** The prompt cache lives an hour after the last request that read or wrote it. */
export const TTL_MIN = 60
export const TTL_MS = TTL_MIN * 60 * 1000

// ---------- Prices ----------
// Estimates, not your bill. $ per million tokens: input, and the cache read.
// A cold message re-writes the whole context to the 1-hour cache at 2x input;
// a warm one reads it at the cache-read rate. Edit this table when prices change.
export type Model = { id: string; name: string; input: number; read: number }
export const MODELS: Model[] = [
  { id: 'fable', name: 'Fable', input: 10, read: 0.25 },
  { id: 'opus', name: 'Opus', input: 4, read: 0.2 },
  { id: 'sonnet', name: 'Sonnet', input: 2, read: 0.2 },
  { id: 'haiku', name: 'Haiku', input: 0.5, read: 0.05 },
]

/** Which row of MODELS a model id belongs to, or null for one the band doesn't price. */
export const familyOf = (model: string | null | undefined): string | null => {
  const m = (model ?? '').toLowerCase()
  return MODELS.find(x => m.includes(x.id))?.id ?? null
}

export const coldCost = (m: Model, tokens: number): number => (tokens / 1e6) * m.input * 2
export const warmCost = (m: Model, tokens: number): number => (tokens / 1e6) * m.read
export const costOf = (m: Model, mode: Mode, tokens: number): number => (mode === 'cold' ? coldCost(m, tokens) : warmCost(m, tokens))
export const usd = (n: number): string => '$' + n.toFixed(2)
/** Where the context bar turns ochre, as a percent of the window. */
export const CTX_AT = 80
/** Where the last turn's cache hit rate stops reading as healthy, as a percent. */
export const HIT_OK = 80
/** The share of a turn's input the cache served, 0 to 1; null when it had no input. */
export const hitOf = (read: number, write: number, input: number): number | null => {
  const all = read + write + input
  return all > 0 ? read / all : null
}
export const tok = (n: number): string => (n >= 1e6 ? `${Number((n / 1e6).toFixed(1))}M` : `${Math.round(n / 1000)}k`)

/** A span the way the band writes it: 18m, 2h 5m, 3d 9h. */
export const fmtSpan = (ms: number): string => {
  const mins = Math.max(0, Math.floor(ms / 60000))
  if (mins < 60) return `${mins}m`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ${mins % 60}m`
  return `${Math.floor(hours / 24)}d ${hours % 24}h`
}

/** What every drawing of the cache reads. */
export type CacheView = {
  mode: Mode
  /** How long since the last request, written out: 3d 9h, 18m. */
  idle: string
  /** The same in whole minutes, for the warm countdown. */
  idleMin: number
  /** Minutes until the cache goes cold; 0 once it has. */
  leftMin: number
  /** Context the next request re-sends. */
  tokens: number
  /** The model's context window; 0 when unknown. */
  window: number
  /** This session's MODELS id, or null when the model isn't priced. */
  mine: string | null
  /** Share of the last turn's input the cache served, 0 to 1; null before a turn. */
  hit: number | null
  /** What the session has cost, in dollars; null when the host keeps no ledger. */
  spend: number | null
  /** Of that, the estimated cost of cache re-writes after the cache had gone cold. */
  cold: number
}

export const mineModel = (v: CacheView): Model | undefined => MODELS.find(m => m.id === v.mine)

// ---------- SVG helpers ----------
const FACES: Record<400 | 500 | 600, string> = { 400: INTER_400, 500: INTER_500, 600: INTER_600 }

export const svgDoc = (w: number, h: number, body: string, weights: readonly (400 | 500 | 600)[]): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">` +
  (weights.length
    ? '<style>' +
      weights.map(wt => `@font-face{font-family:CU;font-weight:${wt};src:url(data:font/woff;base64,${FACES[wt]}) format('woff')}`).join('') +
      "text{font-family:CU,Inter,system-ui,'Segoe UI',sans-serif;font-variant-numeric:tabular-nums}</style>"
    : '') +
  body +
  '</svg>'

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** A word's width in px at a size, weight and tracking (em), measured from Inter's advances. */
export const measure = (word: string, size: number, weight: 400 | 500 | 600, tracking = 0): number => {
  const adv = ADVANCE[weight]
  let em = 0
  for (const ch of word) em += adv[ch] ?? 0.6
  return em * size + Math.max(0, [...word].length - 1) * tracking * size
}

type TextOpts = { size?: number; weight?: 400 | 500 | 600; fill: string; tracking?: number; anchor?: 'start' | 'middle' | 'end' }
const text = (x: number, y: number, s: string, o: TextOpts): string =>
  `<text x="${r1(x)}" y="${r1(y)}" font-size="${o.size ?? 12}" font-weight="${o.weight ?? 400}" fill="${o.fill}"` +
  (o.tracking ? ` letter-spacing="${o.tracking}em"` : '') +
  (o.anchor && o.anchor !== 'start' ? ` text-anchor="${o.anchor}"` : '') +
  `>${esc(s)}</text>`

const r1 = (n: number): number => Math.round(n * 10) / 10

/** An overline: tiny, semibold, uppercase, tracked. The one place the band uses capitals for words. */
const overline = (x: number, y: number, s: string, p: Palette): string => text(x, y, s, { size: 12, weight: 600, fill: p.muted, tracking: 0.08 })

/** A slim rounded track with a filled share, the card's one kind of meter. */
const track = (x: number, y: number, w: number, share: number, fill: string, p: Palette): string => {
  const f = Math.max(0, Math.min(1, share)) * w
  return (
    `<rect x="${r1(x)}" y="${r1(y)}" width="${r1(w)}" height="4" rx="2" fill="${p.empty}"/>` +
    (f > 0 ? `<rect x="${r1(x)}" y="${r1(y)}" width="${r1(Math.max(4, f))}" height="4" rx="2" fill="${fill}"/>` : '')
  )
}

// ---------- Chips (WARM, COLD, YOU) ----------
// A text background can't be rounded, so a chip is a small drawing, sized from
// the font's own advances: the word plus 7 px each side.
export const chipShapes = (x: number, y: number, word: string, fill: string, ink: string, size: number): { w: number; h: number; svg: string } => {
  const tracking = 0.06
  const pad = Math.round(size * 0.65)
  const w = Math.ceil(measure(word, size, 600, tracking) + pad * 2)
  const h = Math.round(size * 1.7)
  return {
    w,
    h,
    svg:
      `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${Math.round(h * 0.28)}" fill="${fill}"/>` +
      text(x + w / 2 + (tracking * size) / 2, y + h / 2 + size * 0.36, word, { size, weight: 600, fill: ink, tracking, anchor: 'middle' }),
  }
}

/** The WARM or COLD chip beside the robot in the band's row. */
export const chipSvg = (mode: Mode, p: Palette): { source: string; w: number; h: number } => {
  const c = chipShapes(0, 0, WORD[mode], hueOf(p, mode), p.onAccent, 11)
  return { source: svgDoc(c.w, c.h, c.svg, [600]), w: c.w, h: c.h }
}

// ---------- The robot: a slow, small bob when warm; still and pale when cold ----------
const ROBO_PIX = ['..X..X..', 'XXXXXXXX', 'XXXXXXXX', 'X.XXXX.X', 'XXXXXXXX', 'XXXXXXXX', 'X..XX..X']

// One path, not a rect per pixel: separate rects at fractional sizes leave seams.
const pixels = (u: number, fill: string): string => {
  let d = ''
  ROBO_PIX.forEach((row, y) =>
    [...row].forEach((ch, x) => {
      if (ch === 'X') d += `M${r1(x * u)} ${r1(y * u)}h${r1(u)}v${r1(u)}h${r1(-u)}z`
    }),
  )
  return `<path d="${d}" fill="${fill}"/>`
}

/** The robot in a box `size` px square at x, y. Warm uses SMIL, so its Svg needs isInteractive. */
export const roboShapes = (x: number, y: number, size: number, mode: Mode, p: Palette): string => {
  const u = size / 9
  const ox = x + (size - 8 * u) / 2
  const oy = y + (size - 7 * u) / 2
  if (mode === 'warm') {
    const ease = 'calcMode="spline" keyTimes="0;0.5;1" keySplines=".45 0 .55 1;.45 0 .55 1"'
    return (
      `<g transform="translate(${r1(ox)} ${r1(oy)})"><g>` +
      `<animateTransform attributeName="transform" type="translate" values="0 0.4;0 ${r1(-0.6 * u)};0 0.4" dur="3.2s" repeatCount="indefinite" ${ease}/>` +
      pixels(u, p.sage) +
      `</g></g>`
    )
  }
  return `<g transform="translate(${r1(ox)} ${r1(oy)})">${pixels(u, mix(p.teal, p.bg, 0.35))}</g>`
}

/** The robot beside the chip in the band's row. */
export const ROBO_SIZE = 20
export const roboSvg = (mode: Mode, p: Palette): string => svgDoc(ROBO_SIZE, ROBO_SIZE, roboShapes(0, 0, ROBO_SIZE, mode, p), [])

// ---------- The cache card ----------
/** The card's layout for its width in px: three zones in a row, two over one, or one column. */
export const cardKindOf = (W: number): Kind => (W >= 900 ? 'wide' : W >= 560 ? 'stacked' : 'tight')

/**
 * The band's width in CSS pixels for a column count: a cell is about 12 px in
 * the app's code font, and the engine keeps five cells for its [-]. Rounds down,
 * so the card never runs past the slot.
 */
export const bandPx = (columns: number): number => (columns + 5) * 12

const PAD = 12 // outer margin and the gap between zones
const IN = 16 // inner padding of a zone
const ZONE_H = 136

export const cardSvg = (v: CacheView, W: number, p: Palette): { source: string; w: number; h: number; alt: string } => {
  const cold = v.mode === 'cold'
  const hue = hueOf(p, v.mode)
  const zone = (x: number, y: number, w: number, h: number) =>
    `<rect x="${r1(x)}" y="${r1(y)}" width="${r1(w)}" height="${h}" rx="8" fill="${p.ink}" fill-opacity="${p.zoneAlpha}"/>`

  // How long since the last reply, and how much of the warm hour is left.
  const zoneIdle = (x: number, y: number, w: number) => {
    const cx = x + IN
    const cw = w - IN * 2
    let g = zone(x, y, w, ZONE_H)
    g += roboShapes(cx - 2, y + 12, 18, v.mode, p)
    const chip = chipShapes(cx + 20, y + 12, WORD[v.mode], hue, p.onAccent, 12)
    g += chip.svg + overline(cx + 20 + chip.w + 8, y + 27, 'IDLE', p)
    g += text(cx, y + 70, v.idle, { size: 30, weight: 500, fill: p.ink, tracking: -0.02 })
    g += track(cx, y + 86, cw, cold ? 0 : v.leftMin / TTL_MIN, hue, p)
    g += text(cx, y + 116, cold ? 'cache expired' : `cold in ${v.leftMin}m`, { size: 14, weight: 500, fill: hue })
    g += text(cx + cw, y + 116, '1h after a reply', { size: 14, fill: p.muted, anchor: 'end' })
    return g
  }

  // How much the cache holds, as a share of the context window.
  const zoneSize = (x: number, y: number, w: number) => {
    const cx = x + IN
    const cw = w - IN * 2
    const share = v.window > 0 ? Math.min(1, v.tokens / v.window) : 0
    let g = zone(x, y, w, ZONE_H)
    g += overline(cx, y + 27, cold ? 'RE-SENT IN FULL' : 'IN CACHE', p)
    g +=
      `<text x="${cx}" y="${y + 70}" fill="${p.ink}"><tspan font-size="30" font-weight="500" letter-spacing="-0.02em">${tok(v.tokens)}</tspan>` +
      `<tspan font-size="15" font-weight="400" fill="${p.muted}" dx="6">tokens</tspan></text>`
    g += track(cx, y + 86, cw, share, p.ink, p)
    g += text(cx, y + 116, v.window > 0 ? `${Math.round(share * 100)}% of the ${tok(v.window)} context` : 'context window unknown', { size: 14, fill: p.muted })
    return g
  }

  // How well the last turn used the cache, and what the session has cost.
  const zoneTurn = (x: number, y: number, w: number) => {
    const cx = x + IN
    const cw = w - IN * 2
    const hit = v.hit
    const ok = hit !== null && hit * 100 >= HIT_OK
    let g = zone(x, y, w, ZONE_H)
    g += overline(cx, y + 27, 'LAST TURN', p)
    g +=
      `<text x="${cx}" y="${y + 70}" fill="${p.ink}"><tspan font-size="30" font-weight="500" letter-spacing="-0.02em">${hit === null ? '–' : `${Math.round(hit * 100)}%`}</tspan>` +
      `<tspan font-size="15" font-weight="400" fill="${p.muted}" dx="6">from cache</tspan></text>`
    g += track(cx, y + 86, cw, hit ?? 0, ok ? p.sage : p.amber, p)
    const spent = v.spend === null ? 'session cost unknown' : `session ${usd(v.spend)}${v.cold > 0 ? ` · ${usd(v.cold)} re-writes` : ''}`
    g += text(cx, y + 116, spent, { size: 14, fill: p.muted })
    return g
  }

  // What the next message costs on each model. One scale for both states (the
  // dearest cold re-cache), so a warm read shows as the small bar it is.
  const zoneCost = (x: number, y: number, w: number, h: number) => {
    const cx = x + IN
    const cw = w - IN * 2
    let g = zone(x, y, w, h)
    g += overline(cx, y + 27, cold ? 'NEXT MESSAGE COSTS' : 'NEXT MESSAGE COSTS, CACHED', p)
    const top = Math.max(...MODELS.map(m => coldCost(m, v.tokens)))
    const nameW = 104
    const priceW = 60
    const barX = cx + nameW
    const barW = Math.max(24, cw - nameW - priceW - 8)
    MODELS.forEach((m, i) => {
      const mine = m.id === v.mine
      const by = y + 54 + i * 22
      const cost = costOf(m, v.mode, v.tokens)
      g += text(cx, by, m.name, { size: 14, weight: mine ? 600 : 400, fill: mine ? p.ink : p.muted })
      if (mine) g += chipShapes(Math.round(cx + measure(m.name, 14, 600) + 6), by - 13, 'YOU', hue, p.onAccent, 10).svg
      g += track(barX, by - 6, barW, top > 0 ? cost / top : 0, mine ? hue : mix(p.muted, p.bg, 0.3), p)
      g += text(cx + cw, by, usd(cost), { size: 14, weight: mine ? 600 : 400, fill: mine ? p.ink : p.muted, anchor: 'end' })
    })
    return g
  }

  const inner = W - PAD * 2
  let H: number
  let g: string
  const kind = cardKindOf(W)
  if (kind === 'wide') {
    const w1 = Math.round(inner * 0.22)
    const w2 = Math.round(inner * 0.24)
    const w3 = Math.round(inner * 0.24)
    const w4 = inner - w1 - w2 - w3 - PAD * 3
    H = ZONE_H
    g =
      zoneIdle(PAD, 0, w1) +
      zoneSize(PAD + w1 + PAD, 0, w2) +
      zoneTurn(PAD + w1 + w2 + PAD * 2, 0, w3) +
      zoneCost(PAD + w1 + w2 + w3 + PAD * 3, 0, w4, ZONE_H)
  } else if (kind === 'stacked') {
    const half = (inner - PAD) / 2
    H = ZONE_H * 2 + PAD
    g =
      zoneIdle(PAD, 0, half) +
      zoneSize(PAD + half + PAD, 0, half) +
      zoneTurn(PAD, ZONE_H + PAD, half) +
      zoneCost(PAD + half + PAD, ZONE_H + PAD, half, ZONE_H)
  } else {
    H = ZONE_H * 4 + PAD * 3
    g =
      zoneIdle(PAD, 0, inner) +
      zoneSize(PAD, ZONE_H + PAD, inner) +
      zoneTurn(PAD, (ZONE_H + PAD) * 2, inner) +
      zoneCost(PAD, (ZONE_H + PAD) * 3, inner, ZONE_H)
  }
  const top = 6
  const h = top + H + PAD
  const body = `<rect width="${W}" height="${h}" fill="${p.bg}"/><g transform="translate(0 ${top})">${g}</g>`
  const mine = mineModel(v)
  const price = mine ? ` Next message on ${mine.name}: ${usd(costOf(mine, v.mode, v.tokens))}.` : ''
  const turn = v.hit === null ? '' : ` Last turn ${Math.round(v.hit * 100)}% read from cache.`
  const spent = v.spend === null ? '' : ` Session ${usd(v.spend)}.`
  const alt = cold
    ? `Cache cold. Idle ${v.idle}. Next message re-sends ${tok(v.tokens)} tokens.${turn}${spent}${price}`
    : `Cache warm. Goes cold in ${v.leftMin} minutes. ${tok(v.tokens)} tokens cached.${turn}${spent}${price}`
  return { source: svgDoc(W, h, body, [400, 500, 600]), w: W, h, alt }
}
