# Usage

A calm band above the prompt, drawn in the Scandinavian / Calm Utility style. It shows how much of your 7-day (7D) and 5-hour (5H) usage windows is **left**, as an ink dot bar with the reset time. A window under 15% gets an ochre **LOW**.

After your first reply it also tracks the prompt cache. The cache keeps your chat cheap to continue for an hour after your last message:

- **WARM** (sage, the robot bobs slowly): the cache is live. The band shows the minutes left and what your next message costs at the cache-read rate.
- **COLD** (teal, the robot is still): the hour has passed, so your next message re-sends the whole chat. The band shows the price first.

Next to the windows, the band shows two more figures once there is a reply:

- **CTX** is how full the context window is, as a dot bar. It turns ochre from 80%, when compaction is near.
- **SESSION** is what the session has cost so far, from the app's own ledger.

The chevron at the top right folds the cache card: **∧** opens it and **∨** folds it away. Warm starts folded and cold starts open, so you see the price before you send. The card shows how long you've been idle, how many tokens are in the cache, how much of the last turn the cache served (**hit rate**, sage from 80%, ochre below), the session spend with the part that came from cold re-writes, and what the next message would cost on each model, with yours marked YOU. In the terminal the card is plain text.

## Install

At the prompt of a Claude Code terminal session:

```bash
/plugin install usage --marketplace grozdanov/claude-mods
```

From a shell:

```bash
claude plugin install usage --marketplace grozdanov/claude-mods
```

Answer `y` to add the marketplace, then pick a scope (user is first). The band shows above the prompt from then on.

In the desktop app, where `/plugin` does not run: click + next to the prompt box, then Plugins, Add marketplace with `grozdanov/claude-mods`, then Add plugin.

The band draws in the terminal and the desktop app; the VS Code extension does not show bands above the prompt.

## Fits any width

- **Wide:** everything sits on one row.
- **Half width:** each window stacks into a small block.
- **Narrow:** CTX and SESSION take a row of their own, and the cache another.
- **Terminal:** the same facts as plain text.

## Theme

The band follows your Claude theme setting. A light theme draws on Linen (#EAE4D4) with Deep Nordic Slate ink. Any other theme draws on Dark Slate Charcoal (#181C28) with Linen ink.

## Cost

Running the band costs nothing. It reads the app's own figures and never calls a model. Session spend is the app's own figure. The next-message prices and the cold re-write figure are estimates from the `MODELS` table in `hooks/art.ts`, not from your bill, so edit that table when prices change. Subagents don't count: only your main chat resets the cache clock.

## Files

- `hooks/register.tsx` holds the hooks and the band's layout.
- `hooks/art.ts` holds the palette, the prices and the SVG drawings (chip, robot, card).
- `hooks/font.ts` holds Inter 4.0 (SIL OFL 1.1), subset and embedded, because an SVG can't reach the app's fonts.
- `hooks/usage.test.tsx` holds the tests, which run with `claude plugin test <folder>`.

## License

MIT (see `../LICENSE`). The embedded Inter font is under the SIL Open Font License 1.1 (see `../LICENSE-Inter.txt`).
