# Busfahren Layout Redesign — Design

Date: 2026-05-17
File: `games/busfahren/index.html` (single self-contained HTML file)

## Goal

Rework the Busfahren game view to match the layout pattern used by the
other arcade games (snakes-and-ladders is the reference), and change the
turn flow so the game is social — every action passes the turn and each
player keeps their own progress.

## Reference pattern

`games/snakes-and-ladders/index.html` uses a flex-column `.game`:

- `controls-bar` (fullscreen + menu) top-right
- `players-top` — 3-column grid, `transform: rotate(180deg)`
- center play area — `flex: 1`
- `players-bottom`

Busfahren currently diverges: absolute-positioned `.table-center`, a
`controls-region` whose panels are placed on an ellipse by JS
(`ringPanels()`), and the four stage card slots live in the shared center.

## Layout

`.game` becomes a flex column (mirrors snakes):

1. `controls-bar` — top-right. Fullscreen + menu buttons. Styling already
   matches the other games; it just needs to participate in the column
   flow at the top instead of the current relative/absolute context.
2. `players-top` — 3-column grid, `rotate(180deg)`, holds P2 / P3 / P4.
3. center `felt` — `flex: 1`, contains **only** Stapel (deck stack +
   count) and Ablage (discard). Status header / question / stage slots
   are removed from the center.
4. `players-bottom` — holds P1.

Constraints:

- Portrait column only. No widescreen/landscape media queries.
- `ringPanels()` and its `resize` / `orientationchange` listeners are
  deleted. `reRing()` removed. No JS layout math for panels.
- Max 4 players (already enforced by the menu).

Per-player-count seating:

- 1 player: P1 bottom only (top row empty/hidden).
- 2 players: P1 bottom, P2 top.
- 3 players: P1 bottom, P2/P3 top.
- 4 players: P1 bottom, P2/P3/P4 top.

## Player controller

Each controller is larger and self-contained:

- Header: colour dot + name + stage badge (`x/4`).
- **Its own 4 card spots** — a row of four mini card slots showing that
  player's currently-revealed cards (their cumulative progress).
- Two answer buttons (stage-appropriate labels).
- **Active panel only**: also shows the stage prompt
  (e.g. "Höher oder tiefer als 10?") and the win/lose result text.
  Inactive panels show header + spots + disabled buttons only.
- Top-row panels inherit `rotate(180deg)` from `players-top` so P2-P4
  read right-side-up from their seat. Finished/disabled styling unchanged.

## State and turn rules

This is the behavioral change.

- `revealed` becomes **per-player and persistent** — each player's four
  spots show their own cumulative progress, held in `state`. (The data
  model already stores `revealed` per player; the change is that it is no
  longer rendered into a shared center and is no longer implicitly the
  "active attempt" only.)
- `advanceTurn()` is called after **every** answer. No player can chain
  multiple stages in a single turn.
- Correct, stage < 4: that player's `stage++`; the drawn card stays in
  that player's slot; turn passes.
- Correct, stage 4: that player is marked finished; their revealed cards
  discard; recorded in `finishOrder`; turn passes.
- Wrong: **only that player** resets to `stage = 1` and their four spots
  clear (cards discarded). Other players' stage/progress is untouched.
  Turn passes.
- Game ends when all players are finished (unchanged) → end overlay
  with finish-order ranking, last = BUSFAHRER (unchanged).

`applyOutcome()` is the seam that changes: the win-non-terminal branch no
longer keeps the same player active (it calls `advanceTurn()` too); the
data bookkeeping otherwise stays.

## Animations (presentational, retargeted)

- Deal + flip: deck stack → the **acting player's** stage slot inside
  their panel (currently flies to the shared center stage-slots).
- Sweep-to-discard: the acting player's panel slots → discard pile, on
  that player's own loss or stage-4 finish.
- Reshuffle animation: unchanged.
- `prefers-reduced-motion` fast path preserved.
- `animBusy` input lock unchanged; menu/restart mid-animation still
  clears `state` and the lock.

## Edge cases

- 1 player: bottom panel only; top row hidden.
- Reduced motion: instant card placement, no fly/flip/sweep.
- Leaving to menu or restarting mid-animation clears `state` and
  `animBusy` (existing behavior, must be preserved).
- Reshuffle (deck empties): unchanged draw/reshuffle logic.

## Out of scope

- Card SVG rendering, deck model, rules resolver (`resolveStage`) logic.
- Fullscreen enter/exit mechanics and `--app-vh` sizing.
- Menu screen and end overlay (kept as-is apart from being children of
  the restructured view).
