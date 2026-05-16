# Gioco dell'Oca — Menu Redesign Design

Date: 2026-05-16
Status: Approved
Scope: single file — `games/gioco-dell-oca/index.html`

## Goal

Rework the setup ("main menu") screen of *Il Gioco dell'Oca*:

1. Remove per-player name rectangles — only choose the number of players.
2. Make the board preview bigger.
3. Add a settings button to configure how many of each perk appear on the
   board, showing remaining free fields and blocking increases when none are
   left. Must work generically for any future perk.
4. Add a Generate button that produces a new random perk layout with sensible
   distribution (no same perk on consecutive occupied fields, well spread).

## Decisions (resolved with user)

- **Perk scope now:** only the existing two perks — Luck Up and Luck Down —
  are wired, but via a generic registry so future perks need one entry only.
  (Unused `prison.png` / `supercharge.png` icons are deliberately left for
  later; not part of this work.)
- **Persistence:** perk *counts* persist in `localStorage`. The layout itself
  is regenerated fresh on every page load (and on Generate) from those counts,
  so layout positions are not persisted.
- **Preview size:** moderately bigger — `min(90vw, 420px)`, aspect ratio 7/9
  preserved, still capped so the action buttons stay visible on short screens.
- **Default layout on load:** auto-generate a fresh random layout each page
  load (in addition to the manual Generate button).

## Architecture

Replace the hardcoded `LUCK_UP` / `LUCK_DOWN` / `LUCK` constants with a
data-driven perk registry plus runtime state.

```js
const PERKS = [
  { id:'luckup',   icon:'icons/luck-up.png',   title:'Fortuna Aumentata',
    text:'<b>+2</b> al dado per i prossimi <b>3 turni</b>.',
    defaultCount:3, fx:{ val:+2, turns:3 } },
  { id:'luckdown', icon:'icons/luck-down.png', title:'Sfortuna',
    text:'<b>&minus;2</b> al dado per i prossimi <b>3 turni</b> &mdash; '
        +'puoi finire in negativo e <b>tornare indietro</b>.',
    defaultCount:3, fx:{ val:-2, turns:3 } }
];
```

Runtime state:

- `perkCounts` — `{ [id]: number }`, loaded from `localStorage` or
  `defaultCount`. Validated against board capacity on load.
- `perkLayout` — `{ [id]: number[] }`, generated from `perkCounts`.

The registry is intentionally shaped so a future per-perk custom landing
handler can be added later without restructuring (a perk could carry its own
`onLand` instead of / alongside `fx`). Not built now (YAGNI).

### Board capacity

- `TOTAL = 63`. Fields `1` (start) and `63` (goal) are reserved.
- Usable fields: `2..62` → **61** slots.
- `freeFields = 61 - Σ perkCounts`.

## Components & changes (all in `index.html`)

### 1. Setup markup

- Remove the `.names` container (`<div class="names" id="names">`).
- Remove `buildNames()` and its call; remove `namesBox` references.
- Setup screen order: title → count buttons → enlarged board preview →
  action button row.
- Action row: Settings (gear) button + Generate button + "Inizia la Partita".

### 2. CSS

- `.menu-board { width: min(90vw, 420px); }` (was `min(74vw,260px)`),
  keep `aspect-ratio:7/9` and the short-screen guard via the existing
  scrollable `.setup` container; add a `max-height`-aware cap if needed so
  buttons remain reachable.
- Reuse existing `.modal` / `.card` styles for the settings dialog. Add
  minimal styles for the perk-row list and stepper controls.

### 3. Perk registry integration

Replace usages:

- `classify(n)` — loop `PERKS`, return the perk `id` whose
  `perkLayout[id]` includes `n` (replaces the `luckup`/`luckdown` branches).
  Keep `goal` / `start` handling.
- `buildCells()` — for a perk cell, render `<img class="ficon" src=BASE+perk.icon>`
  and set the title from `perk.title`.
- `openCellInfo(n)` — perk branch uses matched `perk.title` / `perk.text`.
- `handleLanding()` — perk branch:
  `p.fx.push({ val:perk.fx.val, img:perk.icon, turns:perk.fx.turns })`,
  then `event(perk.title, …)`. Replaces the explicit
  `LUCK_UP.includes/LUCK_DOWN.includes` block. The existing generic
  `p.fx` consumption logic in `resolve()` is unchanged.

### 4. Settings modal

- Gear icon button in the setup action row opens a modal.
- One row per perk (driven by `PERKS`, so future perks appear automatically):
  perk icon + title, then a stepper: `−`  `count`  `+`.
- A live line: **"Caselle libere: N"** (N = `freeFields`).
- `+` disabled for *every* perk when `N === 0`. `−` disabled when that
  perk's count is `0` (minimum 0 = perk disabled).
- Any change: update `perkCounts`, persist to `localStorage`, regenerate
  `perkLayout`, re-render the preview board and the free-fields line.
- Close button reuses modal close wiring.

### 5. Generation algorithm

`generateLayout(perkCounts) -> perkLayout`:

1. `T = Σ perkCounts`. If `T === 0`, all layouts empty.
2. Candidate range = fields `2..62` (61 fields).
3. **Spread:** divide the 61-field range into `T` near-equal segments;
   pick one uniformly random field within each segment → `T` sorted,
   well-spaced positions (prevents clustering / adjacency when not near
   capacity).
4. **Type assignment:** build the multiset of perk ids from `perkCounts`,
   arrange it so the same id is not on consecutive *occupied* slots
   (greedy max-spacing interleave; best-effort if counts are extremely
   lopsided and a perfect interleave is impossible). Zip
   `types[i] → positions[i]`.
5. Group resulting positions by perk id → `perkLayout`.

- Runs on page load (auto-generate) and when the Generate button is pressed.
- After generation, re-render the preview board.

### 6. localStorage

- Key e.g. `goca.perkCounts`. Store JSON `{ [id]: count }`.
- On load: parse; for unknown/missing ids fall back to `defaultCount`;
  clamp so `Σ ≤ 61` (if stored data exceeds capacity, scale down / clamp).
- Failure to read/parse → fall back to defaults silently.

### 7. startGame()

- Build `players` with auto names `"Giocatore " + (i+1)` (no input reads).
- Everything else (tokens, board render using current `perkLayout`,
  turn flow) unchanged.

## Error handling

- Corrupt / overflowing `localStorage` → defaults, no crash.
- `freeFields` can never go negative: `+` is gated on `N > 0`.
- Generation with `T` larger than spacing allows still returns a valid
  layout (adjacency avoided best-effort, never throws).

## Testing (manual, browser)

- Setup shows no name fields; count buttons still switch 2–6.
- Preview is visibly larger; action buttons remain reachable.
- Settings: increment/decrement per perk; free-fields line updates;
  `+` disables at 0 free; `−` disables at 0 count; survives reload.
- Generate: repeated presses give different layouts; no same perk on
  consecutive occupied fields under default counts; preview updates.
- Start a game: players auto-named; board uses the generated layout;
  luck effects still apply and stack as before.
- Reload page: counts persist; a fresh layout is generated.

## Out of scope

- Wiring Prison / Supercharge perks (future, via the same registry).
- Per-perk custom landing handlers.
- Persisting exact layout positions across reloads.
