import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

const HOUR = 3_600_000
const START = Date.parse('2026-10-21T12:00:00Z')

const band = (bodyColumns: number) =>
  ({
    plugin: 'usage',
    component: 'AbovePrompt',
    props: { hasSurvey: false, isWorking: false, maxRows: 20, bodyColumns, scroll: { offset: 0, bodyRows: 20 }, view: {} },
  }) as const

/** The engine beneath the band: two windows (7D nearly spent), a 245k context on Opus, a dark theme. */
const world = (on: On, theme = 'dark', tokens = 245_000) => {
  const clock = mock.clock(on, { now: START })
  const usage = {
    startedAt: START,
    context: { tokens, window: 1_000_000 },
    cost: { usd: 4.12 },
    rateLimits: [
      { kind: 'five_hour', percentUsed: 4, resetsAt: new Date(START + 4.5 * HOUR).toISOString() },
      { kind: 'seven_day', percentUsed: 90, resetsAt: new Date(START + 81 * HOUR).toISOString() },
      { kind: 'spend_limit', percentUsed: 10 },
    ],
  }
  on('session.usage', () => ({ value: usage }) as never)
  on('session.model', () => ({ value: 'claude-opus-5-5' }) as never)
  on('config.list', () => ({ value: [{ key: 'theme', label: 'Theme', kind: 'choice', value: theme, provider: { kind: 'engine' }, isLocked: false }] }) as never)
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('turn.complete', () => ({ text: '' }))
  return clock
}

const reply = ($: Engine) =>
  $.turn.complete({ answer: 'ok', durationMs: 1000, isAborted: false, turnId: 't1', reason: 'answer', usage: { model: 'claude-opus-5-5', input_tokens: 5_000, output_tokens: 800, cache_read_input_tokens: 230_000, cache_creation_input_tokens: 10_000 } } as never)

test('windows show what is left, 7D first, with LOW and reset times; the spend limit is left out', async ($, on) => {
  world(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...band(160), surface })
    expect((await ui.find({ type: 'Text', text: /^ 10% left$/ }))?.text).toBe(' 10% left')
    expect((await ui.find({ type: 'Text', text: /LOW/ }))?.text).toBe(' LOW')
    expect((await ui.find({ type: 'Text', text: /resets 3d 9h/ }))?.text).toContain('resets 3d 9h')
    expect((await ui.find({ type: 'Text', text: /96% left/ }))?.text).toBe(' 96% left')
    expect(await ui.find({ type: 'Text', text: /SPEND/ })).toBeUndefined()
    // No reply yet: no cache, no button.
    expect(await ui.find({ type: 'Button', key: 'cache-fold' })).toBeUndefined()
    await ui.unmount()
  }
})

test('warm after a reply: folded, minutes left and the cached price; the chevron opens the card', async ($, on) => {
  const clock = world(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await reply($)
  await clock.advance(6 * 60_000)
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...band(160), surface })
    expect((await ui.find({ type: 'Text', text: /m left$/ }))?.text).toBe(' 54m left')
    expect((await ui.find({ type: 'Text', text: /next/ }))?.text).toBe(' · $0.05 next')
    expect((await ui.find({ type: 'Button', key: 'cache-fold' }))?.props.label).toBe('∧')
    await ui.press({ key: 'cache-fold' })
    expect((await ui.find({ type: 'Button', key: 'cache-fold' }))?.props.label).toBe('∨')
    if (surface === 'terminal') {
      expect((await ui.find({ type: 'Text', text: /\(you\)/ }))?.text).toContain('Opus $0.05 (you)')
    } else {
      expect((await ui.findAll({ type: 'Svg' })).map(x => String(x.props.alt)).find(a => /Cache warm/.test(a))).toContain('Goes cold in 54 minutes')
    }
    await ui.press({ key: 'cache-fold' })
    await ui.unmount()
  }
})

test('cold after an hour: open, price first, and the choice to fold holds until it flips', async ($, on) => {
  const clock = world(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await reply($)
  await clock.advance(HOUR + 8 * 60_000)
  const ui = await $.ui.mount({ ...band(160), surface: 'desktop' })
  // Open: the card carries the price; the row leaves it to the card.
  expect((await ui.find({ type: 'Button', key: 'cache-fold' }))?.props.label).toBe('∨')
  expect((await ui.findAll({ type: 'Svg' })).map(x => String(x.props.alt)).find(a => /Cache cold/.test(a))).toContain('Opus: $1.96')
  await ui.press({ key: 'cache-fold' })
  // Folded: the row leads with the price, then the idle time.
  expect((await ui.find({ type: 'Button', key: 'cache-fold' }))?.props.label).toBe('∧')
  expect((await ui.find({ type: 'Text', text: /next$/ }))?.text).toBe(' $1.96 next')
  expect((await ui.find({ type: 'Text', text: /idle/ }))?.text).toBe(' · idle 1h 8m')
  // A tick later the fold still holds.
  await clock.advance(60_000)
  expect((await ui.find({ type: 'Button', key: 'cache-fold' }))?.props.label).toBe('∧')
  await ui.unmount()
})

test('narrow: windows stack and the cache stays on the same line; light theme draws on Linen', async ($, on) => {
  const clock = world(on, 'light')
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await reply($)
  await clock.advance(60_000)
  const ui = await $.ui.mount({ ...band(40), surface: 'terminal' })
  expect((await ui.find({ type: 'Text', text: /^resets 4h/ }))?.text).toBe('resets 4h 29m')
  expect((await ui.find({ type: 'Text', text: /^ WARM $/ }))?.props.backgroundColor).toBe('#4a6a3c')
  expect((await ui.find({ type: 'Box', key: 'block' }))).toBeDefined()
  expect(await ui.find({ type: 'Box', key: 'cache' })).toBeUndefined()
  await ui.unmount()
})

test('context fill and session spend sit on the row; ochre from 80%; the card adds hit rate and spend', async ($, on) => {
  const clock = world(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await reply($)
  await clock.advance(60_000)
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...band(160), surface })
    expect((await ui.find({ type: 'Text', text: /^ 25%$/ }))?.text).toBe(' 25%')
    expect((await ui.find({ type: 'Text', text: /^\$4\.12$/ }))?.text).toBe('$4.12')
    await ui.press({ key: 'cache-fold' })
    if (surface === 'terminal') {
      expect((await ui.find({ type: 'Text', text: /read from cache/ }))?.text).toBe('94% read from cache')
    } else {
      expect((await ui.findAll({ type: 'Svg' })).map(x => String(x.props.alt)).find(a => /Cache warm/.test(a))).toContain('Last turn 94% read from cache. Session $4.12.')
    }
    await ui.press({ key: 'cache-fold' })
    await ui.unmount()
  }
})

test('context bar turns ochre at 80% full', async ($, on) => {
  const clock = world(on, 'dark', 820_000)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await reply($)
  await clock.advance(60_000)
  const ui = await $.ui.mount({ ...band(160), surface: 'terminal' })
  expect((await ui.find({ type: 'Text', text: /^ 82%$/ }))?.props.color).toBe('#e3a35e')
  await ui.unmount()
})

test('a turn that finds the cache cold adds its re-write to the card\'s cold figure', async ($, on) => {
  const clock = world(on)
  on('turn.step', async function* () {
    return { turnId: 't2', index: 0, answer: '', toolUses: [], stopReason: 'end_turn', usage: null } as never
  })
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await reply($)
  await clock.advance(HOUR + 60_000)
  for await (const _ of $.turn.step({ turnId: 't2', index: 0, model: 'claude-opus-5-5' } as never)) void _
  await reply($)
  const ui = await $.ui.mount({ ...band(160), surface: 'terminal' })
  await ui.press({ key: 'cache-fold' })
  expect((await ui.find({ type: 'Text', text: /cold re-writes/ }))?.text).toBe(' · $0.08 from cold re-writes')
  await ui.unmount()
})
