import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderChildren } from 'claude-code'

import type { CacheFacts, Fold, LastTurn, Spend, Tone, Window } from '../types'
import {
  CTX_AT, HIT_OK, MODELS, PALETTE, ROBO_SIZE, TTL_MIN, TTL_MS, WORD,
  bandPx, cardSvg, chipSvg, coldCost, costOf, familyOf, fmtSpan, hitOf, hueOf, mineModel, roboSvg, toneOf, tok, usd,
} from './art'
import type { CacheView, Palette } from './art'

// A calm band above the prompt (Scandinavian / Calm Utility). It shows how much
// of each usage window is LEFT, 7-day first, then 5-hour, as a dot bar in ink
// with the reset time; a window under 15% adds an ochre LOW.
//
// After the first reply it also tracks the prompt cache: WARM (sage, the robot
// bobs slowly) for an hour after the last main-thread request, then COLD (teal,
// the robot is still) with what the next message costs to re-send the chat.
// Beside the windows it shows how full the context is (CTX, ochre from 80%) and
// what the session has cost (SESSION). The card adds how much of the last turn
// the cache served and how much of the spend was cold re-writes. A chevron at
// the top right folds the card; warm starts folded, cold starts open, and a
// choice holds until the cache flips. Zero token cost: it reads the engine's own
// figures and draws, and never calls a model. Subagents don't move the clock.

const CELLS = 10
const TIGHT_CELLS = 6
const LOW_AT = 15
/** How often the band redraws, so the countdown and the warm-to-cold flip stay current. */
const TICK_MS = 30_000
/** Cells a desktop SVG takes per px, as bandPx counts them. */
const PX_PER_CELL = 12
/** Cells the fold chevron takes. */
const BUTTON_CELLS = 5
/** The fold chevron: up opens the card, down folds it away. */
export const CHEVRON = { open: '∨', closed: '∧' } as const

const windows = atom({ plugin: 'usage', key: 'windows' } as const, [] as Window[])
const cache = atom({ plugin: 'usage', key: 'cache' } as const, null as CacheFacts | null)
const last = atom({ plugin: 'usage', key: 'last' } as const, null as LastTurn | null)
const spend = atom({ plugin: 'usage', key: 'spend' } as const, { usd: null, cold: 0, pendingCold: false } as Spend)
const fold = atom({ plugin: 'usage', key: 'fold' } as const, null as Fold | null)
const tone = atom({ plugin: 'usage', key: 'tone' } as const, 'dark' as Tone)

const NAMES: Record<string, string> = { seven_day: '7D', five_hour: '5H' }
const ORDER: Record<string, number> = { seven_day: 0, five_hour: 1 }

/** Only the two session windows, 7D first; a gateway's spend limit is not this band's. */
export const clean = (list: readonly Window[]): Window[] =>
  list
    .filter(w => w.kind in NAMES)
    .map(w => ({ kind: w.kind, percentUsed: w.percentUsed, resetsAt: w.resetsAt }))
    .sort((a, b) => (ORDER[a.kind] ?? 9) - (ORDER[b.kind] ?? 9))

export const fmtReset = (iso: string | undefined, now: number): string => {
  if (!iso) return ''
  const ms = Date.parse(iso) - now
  if (Number.isNaN(ms)) return ''
  if (ms <= 0) return 'resetting'
  return fmtSpan(ms + 59_999) // round up: "resets 1m" until it has
}

/** What the cache drawings read, or null until a request and its context size are known. */
export const viewOf = (
  c: CacheFacts | null,
  now: number,
  l: LastTurn | null = null,
  sp: Spend | null = null,
): CacheView | null => {
  if (!c || c.lastAt <= 0 || c.tokens <= 0) return null
  const idleMs = Math.max(0, now - c.lastAt)
  const idleMin = Math.floor(idleMs / 60000)
  return {
    mode: idleMs >= TTL_MS ? 'cold' : 'warm',
    idle: fmtSpan(idleMs),
    idleMin,
    leftMin: Math.max(0, TTL_MIN - idleMin),
    tokens: c.tokens,
    window: c.window,
    mine: familyOf(c.model),
    hit: l ? hitOf(l.read, l.write, l.input) : null,
    spend: sp?.usd ?? null,
    cold: sp?.cold ?? 0,
  }
}

/** The context bar: whole percent used, and whether it has crossed the ochre line. */
export const ctxOf = (v: CacheView, cells: number): { pct: number; on: number; off: number; high: boolean } | null => {
  if (v.window <= 0) return null
  const pct = Math.max(0, Math.min(100, Math.round((v.tokens / v.window) * 100)))
  const on = Math.max(0, Math.min(cells, Math.round((pct / 100) * cells)))
  return { pct, on, off: cells - on, high: pct >= CTX_AT }
}

/** One window as the band writes it. */
export type Part = { name: string; on: number; off: number; left: number; low: boolean; reset: string }

export const partOf = (w: Window, cells: number, now: number): Part => {
  const left = Math.max(0, Math.min(100, Math.round(100 - w.percentUsed)))
  const on = Math.max(0, Math.min(cells, Math.round((left / 100) * cells)))
  return { name: NAMES[w.kind] ?? w.kind.toUpperCase(), on, off: cells - on, left, low: left < LOW_AT, reset: fmtReset(w.resetsAt, now) }
}

/** The cache's one-line summary: warm leads with time left, cold with the price. */
export const summaryOf = (v: CacheView): { lead: string; rest: string } => {
  const mine = mineModel(v)
  const price = mine ? `${usd(costOf(mine, v.mode, v.tokens))} next` : ''
  return v.mode === 'cold'
    ? { lead: price || `idle ${v.idle}`, rest: price ? `idle ${v.idle}` : '' }
    : { lead: `${v.leftMin}m left`, rest: price }
}

const len = (s: string): number => [...s].length
const wideLen = (p: Part, cells: number, resetsWord: boolean): number =>
  len(p.name) + 1 + cells + 1 + len(`${p.left}% left`) + (p.low ? 4 : 0) + (p.reset ? 3 + (resetsWord ? 7 : 0) + len(p.reset) : 0)
const blockLen = (p: Part, cells: number): number =>
  Math.max(len(p.name) + 1 + cells, len(`${p.left}% left`) + (p.low ? 4 : 0), p.reset ? 7 + len(p.reset) : 0)

export type Plan = { kind: 'wide' | 'stacked' | 'tight'; resetsWord: boolean }

/** The roomiest layout that fits the band's columns: one row, stacked blocks, or the cache on a row of its own. */
export const planOf = (parts: Part[], cacheCells: number, hasButton: boolean, columns: number, extra = 0): Plan => {
  const label = 5 + 2
  const tail = (cacheCells > 0 ? cacheCells + 2 : 0) + (hasButton ? BUTTON_CELLS : 0) + extra
  for (const resetsWord of [true, false]) {
    const row = label + parts.reduce((n, p) => n + wideLen(p, CELLS, resetsWord) + 3, 0) + tail
    if (row <= columns) return { kind: 'wide', resetsWord }
  }
  const stacked = label + 1 + parts.reduce((n, p) => n + blockLen(p, CELLS) + 3, 0) + tail
  if (stacked <= columns) return { kind: 'stacked', resetsWord: true }
  return { kind: 'tight', resetsWord: true }
}

const pull = async ($: EngineInterface): Promise<void> => {
  const u = await $.session.usage()
  await update($, windows, () => clean(u.rateLimits))
}

const readTone = async ($: EngineInterface): Promise<void> => {
  const row = (await $.config.list()).find(r => r.key === 'theme')
  await update($, tone, () => toneOf(row?.value))
}

/** The session's dollars from the engine's own ledger, onto the spend. */
const measureSpend = async ($: EngineInterface): Promise<void> => {
  const u = await $.session.usage()
  await update($, spend, s => ({ ...s, usd: u.cost?.usd ?? s.usd }))
}

/** Fresh context figures from the engine onto the cache facts, when it has them. */
const measureCache = async ($: EngineInterface, lastAt: number | null, model: string | null): Promise<void> => {
  const u = await $.session.usage()
  const m = model ?? (await $.session.model())
  await update($, cache, c => ({
    lastAt: lastAt ?? c?.lastAt ?? 0,
    tokens: u.context.tokens && u.context.tokens > 0 ? u.context.tokens : (c?.tokens ?? 0),
    window: u.context.window || c?.window || 0,
    model: m || c?.model || null,
  }))
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const r = await next(e)
    await pull($).catch(() => undefined)
    await measureSpend($).catch(() => undefined)
    await readTone($).catch(() => undefined)
    $.clock.every(TICK_MS, () => $.ui.invalidate('ui.render'))
    return r
  })

  // The canvas follows the person's theme as they change it.
  on('config.set', { key: 'theme' }, async ($, e, next) => {
    const r = await next(e)
    if (r.deny === undefined) await update($, tone, () => toneOf(r.value))
    return r
  }).catch(($, e, next) => next(e)) // never stands between the person and their setting

  on('session.measure', async ($, e, next) => {
    if (e.changed.includes('rateLimits')) {
      await update($, windows, () => clean(e.rateLimits))
    }
    if (e.changed.includes('cost')) {
      await measureSpend($).catch(() => undefined)
    }
    if (e.changed.includes('context') && e.context.tokens && e.context.tokens > 0) {
      const tokens = e.context.tokens
      await update($, cache, c => (c ? { ...c, tokens, window: e.context.window || c.window } : c))
    }
    return next(e)
  })

  // A resumed or forked session knows how long it was away and how big it is.
  on('classic.SessionStart', async ($, e, next) => {
    const r = await next(e)
    if (e.source === 'clear' || e.source === 'compact') {
      await update($, cache, () => null)
      await update($, last, () => null)
      await update($, spend, () => ({ usd: null, cold: 0, pendingCold: false }))
      await measureSpend($).catch(() => undefined)
      await update($, fold, () => null)
    } else if ((e.source === 'resume' || e.source === 'fork') && typeof e.seconds_since_last_response === 'number') {
      const now = await $.clock.now()
      const lastAt = now - e.seconds_since_last_response * 1000
      const window = (await $.session.usage()).context.window
      const model = typeof e.model === 'string' ? e.model : await $.session.model()
      const tokens = typeof e.context_tokens === 'number' ? e.context_tokens : 0
      await update($, cache, () => ({ lastAt, tokens, window, model }))
      await update($, last, () => null)
      await update($, spend, () => ({ usd: null, cold: 0, pendingCold: e.prompt_cache_likely_expired === true }))
      await measureSpend($).catch(() => undefined)
    }
    return r
  }).catch(($, e, next) => next(e)) // a band that fails to seed never holds up the session

  // Each main-thread request reads or writes the cache, so its start resets the hour.
  on('turn.step', async function* ($, e, next) {
    if (!e.agentId) {
      const now = await $.clock.now()
      const before = await read($, cache)
      // A request that finds the cache past its hour re-writes the whole context.
      if (before && before.lastAt > 0 && now - before.lastAt >= TTL_MS) {
        await update($, spend, s => ({ ...s, pendingCold: true }))
      }
      await update($, cache, c => ({ lastAt: now, tokens: c?.tokens ?? 0, window: c?.window ?? 0, model: c?.model ?? null }))
    }
    yield* next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const r = await next(e)
    if (e.agentId) return r
    const now = await $.clock.now()
    const c = await read($, cache)
    // turn.step stamps the exact request time; when no step of this turn did, the turn's end is the floor.
    const lastAt = !c || now - c.lastAt > e.durationMs ? now : c.lastAt
    await measureCache($, lastAt, e.usage?.model ?? null)
    await measureSpend($).catch(() => undefined)
    const u = e.usage
    if (u) {
      await update($, last, () => ({ read: u.cache_read_input_tokens, write: u.cache_creation_input_tokens, input: u.input_tokens }))
    }
    const s = await read($, spend)
    if (s.pendingCold && u) {
      const m = MODELS.find(x => x.id === familyOf(u.model))
      const extra = m ? coldCost(m, u.cache_creation_input_tokens) : 0
      await update($, spend, x => ({ ...x, cold: x.cold + extra, pendingCold: false }))
    } else if (s.pendingCold) {
      await update($, spend, x => ({ ...x, pendingCold: false }))
    }
    return r
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)

    const ui = $.ui.resolve(e)
    const { Box, Button, Text } = ui
    // Svg draws on desktop, mobile and VS Code; the terminal gets the text form.
    // Ask the surface, not the table: the terminal's table still lists Svg.
    const Svg = e.surface !== 'terminal' && 'Svg' in ui ? ui.Svg : null
    const p: Palette = PALETTE[await read($, tone)]
    const list = await read($, windows)
    const now = await $.clock.now()
    const view = viewOf(await read($, cache), now, await read($, last), await read($, spend))
    const columns = e.props.bodyColumns ?? e.viewport?.columns ?? 100

    const label = (
      <Box key="label" flexShrink={0} marginRight={2}>
        <Text color={p.ink} bold>USAGE</Text>
      </Box>
    )

    if (list.length === 0 && !view) {
      return (
        <Box flexDirection="row" backgroundColor={p.bg} paddingX={1} paddingY="xs">
          {label}
          <Text color={p.muted}>waiting for the first reply</Text>
        </Box>
      )
    }

    // The cache's fold: warm starts folded, cold open, a choice holds until the cache flips.
    const mode = view?.mode ?? 'warm'
    const cold = mode === 'cold'
    const hue = hueOf(p, mode)
    const stored = await read($, fold)
    const open = view !== null && (stored && stored.mode === mode ? stored.open : cold)
    const toggle = () => update($, fold, f => ({ mode, open: !(f && f.mode === mode ? f.open : mode === 'cold') }))

    const chip = chipSvg(mode, p)
    const badgeCells = Svg ? Math.ceil((ROBO_SIZE + 6 + chip.w) / PX_PER_CELL) + 1 : len(WORD[mode]) + 2
    const sum = view ? summaryOf(view) : null
    const summaryCells = sum ? 1 + len(sum.lead) + (sum.rest ? 3 + len(sum.rest) : 0) : 0
    // The cache state always sits in the row beside the windows, open card or not.
    const inlineCache = view !== null
    const ctxWide = view ? ctxOf(view, CELLS) : null
    const spendText = view && view.spend !== null ? usd(view.spend) : null
    const extra =
      (ctxWide ? len('CTX ') + CELLS + 1 + len(`${ctxWide.pct}%`) + 3 : 0) + (spendText ? len('SESSION ') + len(spendText) + 3 : 0)
    const plan = planOf(
      list.map(w => partOf(w, CELLS, now)),
      inlineCache ? badgeCells + summaryCells : 0,
      view !== null,
      columns,
      extra,
    )
    const cells = plan.kind === 'tight' ? TIGHT_CELLS : CELLS
    const parts = list.map(w => partOf(w, cells, now))

    const dots = (q: Part) => [
      <Text key="on" color={p.ink}>{'●'.repeat(q.on)}</Text>,
      <Text key="off" color={p.empty}>{'●'.repeat(q.off)}</Text>,
    ]
    const low = (q: Part) => (q.low ? <Text key="low" color={p.amber} bold> LOW</Text> : null)

    const wide = (q: Part, i: number) => (
      <Box key={`w-${i}`} flexDirection="row" flexShrink={0} marginRight={3}>
        <Text color={p.muted}>{q.name} </Text>
        {dots(q)}
        <Text color={q.low ? p.amber : p.ink} bold> {q.left}% left</Text>
        {low(q)}
        {q.reset ? <Text color={p.muted}> · {plan.resetsWord ? 'resets ' : ''}{q.reset}</Text> : null}
      </Box>
    )

    const stacked = (q: Part, i: number) => (
      <Box key={`w-${i}`} flexDirection="column" flexShrink={0} marginRight={3}>
        <Box flexDirection="row">
          <Text color={p.muted}>{q.name} </Text>
          {dots(q)}
        </Box>
        <Box flexDirection="row">
          <Text color={q.low ? p.amber : p.ink} bold>{q.left}% left</Text>
          {low(q)}
        </Box>
        {q.reset ? <Text color={p.muted}>resets {q.reset}</Text> : null}
      </Box>
    )

    const usage = parts.length > 0
      ? parts.map(plan.kind === 'wide' ? wide : stacked)
      : [<Box key="nowin" flexShrink={0} marginRight={3}><Text color={p.muted}>no usage windows on this plan</Text></Box>]

    // Context fill and session spend, in the same shape as the windows.
    const meters = (shape: 'wide' | 'stacked' | 'tight') => {
      const c = view ? ctxOf(view, cells) : null
      const out = []
      if (c) {
        const hot = c.high ? p.amber : p.ink
        const bar = [
          <Text key="on" color={hot}>{'●'.repeat(c.on)}</Text>,
          <Text key="off" color={p.empty}>{'●'.repeat(c.off)}</Text>,
        ]
        out.push(
          shape === 'stacked' ? (
            <Box key="ctx" flexDirection="column" flexShrink={0} marginRight={3}>
              <Box flexDirection="row"><Text color={p.muted}>CTX </Text>{bar}</Box>
              <Text color={hot} bold>{c.pct}% full</Text>
            </Box>
          ) : (
            <Box key="ctx" flexDirection="row" flexShrink={0} marginRight={3}>
              <Text color={p.muted}>CTX </Text>
              {bar}
              <Text color={hot} bold> {c.pct}%</Text>
            </Box>
          ),
        )
      }
      if (spendText) {
        out.push(
          shape === 'stacked' ? (
            <Box key="spend" flexDirection="column" flexShrink={0} marginRight={3}>
              <Text color={p.muted}>SESSION</Text>
              <Text color={p.ink} bold>{spendText}</Text>
            </Box>
          ) : (
            <Box key="spend" flexDirection="row" flexShrink={0} marginRight={3}>
              <Text color={p.muted}>SESSION </Text>
              <Text color={p.ink} bold>{spendText}</Text>
            </Box>
          ),
        )
      }
      return out
    }

    // Before the first reply there is no cache to show: the windows alone.
    if (!view || !sum) {
      return (
        <Box flexDirection="row" backgroundColor={p.bg} paddingX={1} paddingY="xs">
          {label}
          {usage}
        </Box>
      )
    }

    const badge = Svg
      ? [
          <Svg key="robo" source={roboSvg(mode, p)} alt={cold ? 'Robot, still' : 'Robot, bobbing'} width={ROBO_SIZE} height={ROBO_SIZE} isInteractive={!cold} />,
          <Text key="gap"> </Text>,
          <Svg key="chip" source={chip.source} alt={WORD[mode]} width={chip.w} height={chip.h} />,
        ]
      : [<Text key="chip" backgroundColor={hue} color={p.onAccent} bold>{` ${WORD[mode]} `}</Text>]

    const summary = [
      <Text key="lead" color={cold ? p.ink : hue} bold>{` ${sum.lead}`}</Text>,
      sum.rest ? <Text key="rest" color={p.muted}>{` · ${sum.rest}`}</Text> : null,
    ]

    const button = (
      <Box key="fold" flexShrink={0} alignSelf="flex-start" marginTop="xs">
        <Button key="cache-fold" plain label={open ? CHEVRON.open : CHEVRON.closed} onPress={toggle} />
      </Box>
    )
    const grow = <Box key="grow" flexGrow={1} />

    let rows
    if (plan.kind === 'wide') {
      rows = (
        <Box key="row" flexDirection="row" paddingX={1} paddingY="xs" alignItems="center">
          {label}
          {usage}
          {meters('wide')}
          {inlineCache ? (
            <Box key="inline" flexDirection="row" flexShrink={0} marginRight={2} alignItems="center">
              {badge}
              {summary}
            </Box>
          ) : null}
          {grow}
          {button}
        </Box>
      )
    } else {
      // Stacked and tight: everything stays on one line; the cache becomes another block, the same shape as 7D and 5H.
      rows = (
        <Box key="row" flexDirection="row" paddingX={1} paddingY="xs">
          {label}
          {usage}
          {meters('stacked')}
          {inlineCache ? (
            <Box key="block" flexDirection="column" flexShrink={0} marginRight={2}>
              <Box flexDirection="row" alignItems="center">{badge}</Box>
              <Text color={cold ? p.ink : hue} bold>{sum.lead}</Text>
              {sum.rest ? <Text color={p.muted}>{sum.rest}</Text> : null}
            </Box>
          ) : null}
          {grow}
          {button}
        </Box>
      )
    }

    let card = null
    if (open && Svg) {
      const c = cardSvg(view, bandPx(columns), p)
      card = (
        <Box key="card" flexDirection="row">
          <Svg source={c.source} alt={c.alt} width={c.w} isInteractive={!cold} />
        </Box>
      )
    } else if (open) {
      // The terminal's card: the same facts as plain text.
      const mine = mineModel(view)
      const line = (key: string, name: string, body: RenderChildren) => (
        <Box key={key} flexDirection="row">
          <Box flexShrink={0} width={10}><Text color={p.muted}>{name}</Text></Box>
          <Box flexDirection="row" flexWrap="wrap">{body}</Box>
        </Box>
      )
      const share = view.window > 0 ? `${Math.round((view.tokens / view.window) * 100)}% of the ${tok(view.window)} context` : ''
      card = (
        <Box key="card" flexDirection="column" paddingX={1} paddingTop={1}>
          {line('idle', 'Idle', [
            <Text key="v" color={p.ink} bold>{view.idle}</Text>,
            <Text key="s" color={hue}>{cold ? ' · cache expired' : ` · cold in ${view.leftMin}m`}</Text>,
          ])}
          {line('size', cold ? 'Re-sent' : 'In cache', [
            <Text key="v" color={p.ink} bold>{tok(view.tokens)} tokens</Text>,
            share ? <Text key="s" color={p.muted}>{` · ${share}`}</Text> : null,
          ])}
          {line('turn', 'Last turn', [
            view.hit === null ? (
              <Text key="v" color={p.muted}>no turn yet</Text>
            ) : (
              <Text key="v" color={view.hit * 100 >= HIT_OK ? p.sage : p.amber} bold>{`${Math.round(view.hit * 100)}% read from cache`}</Text>
            ),
          ])}
          {line('spend', 'Session', [
            view.spend === null ? (
              <Text key="v" color={p.muted}>cost unknown</Text>
            ) : (
              <Text key="v" color={p.ink} bold>{usd(view.spend)}</Text>
            ),
            view.spend !== null && view.cold > 0 ? <Text key="s" color={p.muted}>{` · ${usd(view.cold)} from cold re-writes`}</Text> : null,
          ])}
          {line('cost', 'Next msg', MODELS.map((m, i) => {
            const isMine = m.id === mine?.id
            const sep = i < MODELS.length - 1 ? '   ' : ''
            return (
              <Text key={m.id} color={isMine ? p.ink : p.muted} bold={isMine}>
                {`${m.name} ${usd(costOf(m, view.mode, view.tokens))}${isMine ? ' (you)' : ''}${sep}`}
              </Text>
            )
          }))}
        </Box>
      )
    }

    return (
      <Box flexDirection="column" backgroundColor={p.bg}>
        {rows}
        {card}
      </Box>
    )
  })
}
