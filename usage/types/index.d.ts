/** One usage window: which one, how much is used (0 to 100), when it resets. */
export type Window = { kind: string; percentUsed: number; resetsAt?: string }

/**
 * The prompt cache as the band last saw it: when the main thread last sent a
 * request (clock milliseconds), how much context the next request re-sends,
 * the model's context window, and the model.
 */
export type CacheFacts = { lastAt: number; tokens: number; window: number; model: string | null }

/** The last main-thread turn's input split, in tokens: served by the cache, written to it, uncached. */
export type LastTurn = { read: number; write: number; input: number }

/**
 * The session's spend: dollars from the engine's own ledger (null where the
 * host keeps none), the estimated cost of re-writes after the cache went cold,
 * and whether the turn in flight began cold.
 */
export type Spend = { usd: number | null; cold: number; pendingCold: boolean }

/** Whether the cache card is open, remembered only for the state it was set in. */
export type Fold = { mode: 'warm' | 'cold'; open: boolean }

/** Which Calm Utility canvas the band draws on, from the person's theme setting. */
export type Tone = 'light' | 'dark'

declare module 'claude-code' {
  interface PluginState {
    usage: { windows: Window[]; cache: CacheFacts | null; last: LastTurn | null; spend: Spend; fold: Fold | null; tone: Tone }
  }
}
