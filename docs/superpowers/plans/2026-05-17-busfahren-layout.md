# Busfahren Layout Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rework the Busfahren game view to the shared arcade layout (flex column, top/bottom player rows, fullscreen top-right) with bigger self-contained per-player controllers, and make the turn flow social (turn passes every action; each player keeps their own progress, resets only on their own failure).

**Architecture:** Single self-contained file `games/busfahren/index.html`. Replace the absolute-positioned "poker table" + JS ellipse ring with a snakes-and-ladders-style flex column: `controls-bar` (top-right), `players-top` (3-col grid, rotated 180°), `felt` (center, deck+discard only, `flex:1`), `players-bottom`. Each player panel holds its own 4 card spots; the active panel additionally shows the stage prompt and result text. `applyOutcome()` always advances the turn; only the failing player resets.

**Tech Stack:** Vanilla HTML/CSS/JS, no build, no test framework. Verification is browser-based via the preview MCP tools (`preview_start`, `preview_snapshot`, `preview_screenshot`, `preview_console_logs`).

**Reference:** `games/snakes-and-ladders/index.html` (flex column, `.players-top { transform: rotate(180deg) }`, `controls-bar` top-right).

**Spec:** `docs/superpowers/specs/2026-05-17-busfahren-layout-design.md`

**Note on line numbers:** All line numbers below are approximate and from the pre-edit file; they drift as edits land. Locate each region by the quoted anchor text / selector / function name, not the number.

---

## File Structure

- Modify only: `games/busfahren/index.html`
  - CSS region `/* ===== GAME ===== */` … `.status-result.lose` (≈ lines 305–619) — replaced wholesale.
  - CSS region `.panel { transition … }` / `.panel.active { animation … }` / `@keyframes turnPulse` (≈ lines 751–765) — removed (folded into new `.panel` rules).
  - HTML `<div class="game" id="game">` block (≈ lines 901–945) — replaced.
  - JS game-view DOM refs (≈ lines 1016–1031), `render()`, `renderControls()`, `ringPanels()`, `setResult()`, `applyOutcome()`, `animateDealAndFlip()`, `animateSweepToDiscard()`, `onAnswer()`, `startGame()`, and the `reRing` resize listeners (≈ line 1704–1706).

---

## Task 1: Layout shell — CSS + HTML + render/renderControls + remove ring

**Files:**
- Modify: `games/busfahren/index.html`

- [ ] **Step 1: Replace the game-section CSS block**

Find the CSS that starts with the comment `/* ===== GAME ===== */` (≈ line 305) and runs through the `.status-result.lose { … }` rule (≈ line 619, just before `/* ===== END SCREEN OVERLAY ===== */`). Replace that entire region with:

```css
  /* ===== GAME ===== */
  .game {
    display: flex;
    flex-direction: column;
    width: 100%;
    height: 100%;
    padding: 12px 0;
    gap: 10px;
    align-items: stretch;
    overflow: hidden;
  }

  /* Controls: upper-right (fullscreen + exit to menu) */
  .controls-bar {
    display: none;
    justify-content: flex-end;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
    padding: 0 12px;
  }
  .controls-bar.visible { display: flex; }

  .ctrl-btn {
    background: transparent;
    font-size: 12px;
    line-height: 1;
    width: 22px;
    height: 22px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
  }
  .ctrl-btn.fs {
    border: 1.5px solid var(--neon-cyan);
    color: var(--neon-cyan);
    text-shadow: 0 0 4px var(--neon-cyan);
  }
  .ctrl-btn.fs:hover, .ctrl-btn.fs:active {
    background: var(--neon-cyan);
    color: var(--bg);
    text-shadow: none;
  }
  .ctrl-btn.menu {
    border: 1.5px solid var(--neon-purple);
    color: var(--neon-purple);
    text-shadow: 0 0 4px var(--neon-purple);
  }
  .ctrl-btn.menu:hover, .ctrl-btn.menu:active {
    background: var(--neon-purple);
    color: var(--bg);
    text-shadow: none;
  }

  /* Top / bottom player rows */
  .players-top, .players-bottom {
    display: grid;
    gap: 8px;
    flex-shrink: 0;
    padding: 0 10px;
    align-items: start;
    justify-items: center;
  }
  .players-bottom { grid-template-columns: 1fr; }
  .players-top {
    grid-template-columns: repeat(3, 1fr);
    transform: rotate(180deg);
  }
  .players-top:empty, .players-bottom:empty { display: none; }

  /* Center felt: deck + discard only, fills remaining space */
  .felt {
    flex: 1 1 0;
    min-height: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: clamp(12px, 6vw, 36px);
  }

  .pile {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    flex: none;
  }
  .pile-label {
    font-family: 'Press Start 2P', monospace;
    font-size: 8px;
    color: rgba(0, 240, 255, 0.6);
    letter-spacing: 1px;
    text-transform: uppercase;
  }

  /* Card-sized box used by deck/discard and (smaller) by panel spots */
  .slot {
    --card-w: clamp(54px, 16vw, 92px);
    width: var(--card-w);
    height: calc(var(--card-w) * 1.4);
    border-radius: 9px;
    flex: none;
    position: relative;
  }
  .slot.empty {
    border: 2px dashed rgba(0, 240, 255, 0.35);
    background: rgba(0, 240, 255, 0.03);
  }
  .slot .card {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
  }
  .slot-num {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    font-family: 'Press Start 2P', monospace;
    font-size: clamp(9px, 2.6vw, 14px);
    color: rgba(0, 240, 255, 0.3);
    pointer-events: none;
  }
  /* Discard reads a touch smaller so the deck is the centrepiece */
  .felt .pile:not(.pile-deck) .slot { --card-w: clamp(44px, 12vw, 74px); }

  /* Face-down deck stack with offset shadow cards + count badge */
  .deck-stack { position: relative; }
  .deck-stack .deck-shadow {
    position: absolute;
    inset: 0;
    border-radius: 9px;
    background: #14082e;
    border: 2px solid rgba(181, 55, 242, 0.5);
  }
  .deck-stack .deck-shadow.s1 { transform: translate(4px, 4px); }
  .deck-stack .deck-shadow.s2 { transform: translate(8px, 8px); }
  .deck-count {
    position: absolute;
    bottom: -8px;
    right: -8px;
    min-width: 24px;
    height: 24px;
    padding: 0 5px;
    border-radius: 12px;
    background: var(--bg);
    border: 2px solid var(--neon-yellow);
    color: var(--neon-yellow);
    font-family: 'Press Start 2P', monospace;
    font-size: 9px;
    display: flex;
    align-items: center;
    justify-content: center;
    text-shadow: 0 0 4px var(--neon-yellow);
    z-index: 3;
  }

  /* Per-player controller */
  .panel {
    width: 100%;
    max-width: 230px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    padding: 8px;
    border: 2px solid var(--pc, var(--neon-cyan));
    border-radius: 10px;
    background: color-mix(in srgb, var(--bg) 86%, transparent);
    box-shadow: 0 0 8px color-mix(in srgb, var(--pc, var(--neon-cyan)) 30%, transparent);
    transition: background 0.32s ease, box-shadow 0.32s ease,
                border-color 0.32s ease;
  }
  .panel.active {
    background: color-mix(in srgb, var(--pc, var(--neon-cyan)) 12%, transparent);
    box-shadow: 0 0 16px color-mix(in srgb, var(--pc, var(--neon-cyan)) 55%, transparent);
    animation: turnPulse 0.5s ease-out;
  }
  @keyframes turnPulse {
    0%   { transform: scale(1); }
    45%  { transform: scale(1.03); }
    100% { transform: scale(1); }
  }
  .panel-head {
    display: flex;
    align-items: center;
    gap: 6px;
    width: 100%;
    justify-content: center;
  }
  .panel-dot {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    border: 2px solid #fff;
    background: var(--pc);
    color: var(--pc);
    box-shadow: 0 0 6px currentColor;
    flex: none;
  }
  .panel-name {
    font-family: 'VT323', monospace;
    font-size: 18px;
    letter-spacing: 1px;
    color: var(--pc, var(--neon-cyan));
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .panel-stage {
    font-family: 'Press Start 2P', monospace;
    font-size: 8px;
    letter-spacing: 1px;
    color: rgba(0, 240, 255, 0.65);
  }
  .panel-stage.done {
    color: var(--neon-green);
    text-shadow: 0 0 6px var(--neon-green);
  }
  .panel-prompt {
    font-family: 'VT323', monospace;
    font-size: 16px;
    letter-spacing: 1px;
    color: var(--neon-pink);
    text-shadow: 0 0 6px var(--neon-pink);
    text-align: center;
    min-height: 1.1em;
  }
  .panel-result {
    font-family: 'Press Start 2P', monospace;
    font-size: 8px;
    letter-spacing: 1px;
    text-align: center;
    min-height: 1em;
  }
  .panel-result.win {
    color: var(--neon-green);
    text-shadow: 0 0 6px var(--neon-green);
  }
  .panel-result.lose {
    color: var(--neon-pink);
    text-shadow: 0 0 6px var(--neon-pink);
  }
  .panel-slots {
    display: flex;
    gap: 5px;
    justify-content: center;
  }
  .panel-slots .slot { --card-w: clamp(34px, 12vw, 50px); }
  .panel-slots .slot.empty {
    border: 2px dashed color-mix(in srgb, var(--pc, var(--neon-cyan)) 35%, transparent);
    background: transparent;
  }
  .panel-btns {
    display: flex;
    gap: 6px;
    width: 100%;
  }
  .ans-btn {
    flex: 1 1 0;
    min-width: 0;
    background: transparent;
    border: 2px solid var(--pc, var(--neon-cyan));
    color: var(--pc, var(--neon-cyan));
    font-family: 'Press Start 2P', monospace;
    font-size: 9px;
    letter-spacing: 1px;
    padding: 9px 2px;
    cursor: pointer;
    text-shadow: 0 0 4px var(--pc, var(--neon-cyan));
    transition: all 0.12s;
  }
  .ans-btn:not(:disabled):hover,
  .ans-btn:not(:disabled):active {
    background: var(--pc, var(--neon-cyan));
    color: var(--bg);
    text-shadow: none;
  }
  .ans-btn:disabled {
    opacity: 0.28;
    cursor: not-allowed;
    text-shadow: none;
    box-shadow: none;
  }
```

- [ ] **Step 2: Remove the now-duplicated animation panel rules**

Find this block in the `/* ===== ANIMATIONS (Task 5) ===== */` section (≈ lines 751–765):

```css
  /* Smooth turn-change handoff on the active panel highlight. */
  .panel {
    transition: background 0.32s ease, box-shadow 0.32s ease,
                border-color 0.32s ease;
  }
  .panel.active {
    animation: turnPulse 0.5s ease-out;
  }
  /* Keep the ring-centering translate so the pulse doesn't shift the panel. */
  @keyframes turnPulse {
    0%   { transform: translate(-50%, -50%) scale(1); }
    45%  { transform: translate(-50%, -50%) scale(1.04); }
    100% { transform: translate(-50%, -50%) scale(1); }
  }
```

Delete it entirely (transition + animation + non-translate `turnPulse` now live in the `.panel` rules from Step 1). Leave the rest of the `@media (prefers-reduced-motion: reduce)` block and other animation rules intact — but inside that media query, the line `.panel.active { animation: none; }` and `.panel { transition: none; }` should remain (they still match the new `.panel` rules).

- [ ] **Step 3: Replace the `<div class="game">` HTML block**

Find `<div class="game" id="game" style="display:none;">` (≈ line 901) through its closing `</div>` before `<!-- END SCREEN OVERLAY` (≈ line 945). Replace with:

```html
  <!-- GAME -->
  <div class="game" id="game" style="display:none;">
    <!-- Controls: upper-right (fullscreen + exit to menu) -->
    <div class="controls-bar" id="controlsBar">
      <button class="ctrl-btn fs" id="fsBtn" aria-label="Fullscreen" title="Fullscreen">⛶</button>
      <button class="ctrl-btn menu" id="restartBtn" aria-label="Main menu" title="Hauptmenü">☰</button>
    </div>

    <!-- Top row: players 2-4 (rotated 180°) -->
    <div class="players-top" id="playersTop"></div>

    <!-- Center: deck (Stapel) + discard (Ablage) only -->
    <div class="felt" id="felt">
      <div class="pile">
        <div class="pile-label">Ablage</div>
        <div class="slot empty" id="discardSlot"></div>
      </div>
      <div class="pile pile-deck">
        <div class="pile-label">Stapel</div>
        <div class="slot deck-stack" id="deckStack">
          <div class="deck-shadow s2"></div>
          <div class="deck-shadow s1"></div>
          <div class="card" id="deckCard"></div>
          <div class="deck-count" id="deckCount">0</div>
        </div>
      </div>
    </div>

    <!-- Bottom row: player 1 -->
    <div class="players-bottom" id="playersBottom"></div>
  </div>
```

- [ ] **Step 4: Update the game-view DOM ref block**

Find this block (≈ lines 1016–1031), beginning `// ============ DOM (game view) ============`:

```js
  const statusName = document.getElementById('statusName');
  const statusStage = document.getElementById('statusStage');
  const statusQuestion = document.getElementById('statusQuestion');
  const statusResult = document.getElementById('statusResult');
  const endOverlay = document.getElementById('endOverlay');
  const endRanks = document.getElementById('endRanks');
  const endAgainBtn = document.getElementById('endAgainBtn');
  const stageSlots = document.getElementById('stageSlots');
  const deckCard = document.getElementById('deckCard');
  const deckStack = document.getElementById('deckStack');
  const deckCount = document.getElementById('deckCount');
  const discardSlot = document.getElementById('discardSlot');
  const controlsRegion = document.getElementById('controlsRegion');
  const restartBtn = document.getElementById('restartBtn');
```

Replace it with:

```js
  const endOverlay = document.getElementById('endOverlay');
  const endRanks = document.getElementById('endRanks');
  const endAgainBtn = document.getElementById('endAgainBtn');
  const deckCard = document.getElementById('deckCard');
  const deckStack = document.getElementById('deckStack');
  const deckCount = document.getElementById('deckCount');
  const discardSlot = document.getElementById('discardSlot');
  const playersTop = document.getElementById('playersTop');
  const playersBottom = document.getElementById('playersBottom');
  const restartBtn = document.getElementById('restartBtn');
```

- [ ] **Step 5: Replace `render()`**

Find `function render() {` (≈ line 1035) through its closing brace (the function ends right after the `renderControls();` call, ≈ line 1085). Replace the whole function with:

```js
  // (Re)draws deck + discard + per-player panels from `state`.
  function render() {
    if (!state) return;

    // Deck stack: face-down back + remaining count (or empty hint).
    if (state.deck.length > 0) {
      deckCard.style.display = '';
      deckCard.innerHTML = cardBackSVG();
      deckCount.style.display = '';
      deckCount.textContent = String(state.deck.length);
      deckStack.classList.remove('empty');
    } else {
      deckCard.style.display = 'none';
      deckCount.style.display = 'none';
      deckStack.classList.add('empty');
      deckCard.innerHTML = '';
    }

    // Discard: top card face-up, else empty.
    const top = state.discard[state.discard.length - 1];
    if (top) {
      discardSlot.classList.remove('empty');
      discardSlot.innerHTML = '<div class="card">' + cardSVG(top) + '</div>';
    } else {
      discardSlot.classList.add('empty');
      discardSlot.innerHTML = '';
    }

    renderControls();
  }
```

- [ ] **Step 6: Replace `renderControls()` and delete `ringPanels()`**

Find `function renderControls() {` (≈ line 1089) through the end of `function ringPanels() { … }` (≈ line 1164 — the ring helper immediately follows `renderControls`). Replace **both functions** with this single new `renderControls()` (there is no ring replacement — panels are placed by the grid):

```js
  // Per-player panels: name + stage + (active only) prompt/result + the
  // player's own 4 card spots + the two stage-appropriate buttons.
  // P1 -> bottom row; P2..P4 -> top row (rotated by CSS).
  function renderControls() {
    playersTop.innerHTML = '';
    playersBottom.innerHTML = '';

    state.players.forEach((p, idx) => {
      const isActive = idx === state.activePlayer && !p.finished;

      const panel = document.createElement('div');
      panel.className = 'panel' + (isActive ? ' active' : '');
      panel.dataset.player = String(idx);
      panel.style.setProperty('--pc', PLAYER_COLORS[idx]);

      const head = document.createElement('div');
      head.className = 'panel-head';
      const dot = document.createElement('span');
      dot.className = 'panel-dot';
      const nm = document.createElement('span');
      nm.className = 'panel-name';
      nm.textContent = p.name;
      head.appendChild(dot);
      head.appendChild(nm);

      const stg = document.createElement('div');
      stg.className = 'panel-stage' + (p.finished ? ' done' : '');
      stg.textContent = p.finished ? 'FERTIG' : ('Stufe ' + p.stage + '/4');

      // Active-only stage prompt.
      const prompt = document.createElement('div');
      prompt.className = 'panel-prompt';
      prompt.textContent = isActive ? stageQuestion(p.stage) : '';

      // Result text lives on whichever player last acted (state.lastResult).
      const res = document.createElement('div');
      const lr = state.lastResult;
      if (lr && lr.idx === idx) {
        res.className = 'panel-result ' + (lr.kind || '');
        res.textContent = lr.text;
      } else {
        res.className = 'panel-result';
        res.textContent = '';
      }

      // The player's own four card spots (cumulative progress).
      const slots = document.createElement('div');
      slots.className = 'panel-slots';
      for (let s = 1; s <= 4; s++) {
        const slot = document.createElement('div');
        slot.dataset.spot = String(s);
        const card = p.revealed[s - 1];
        if (card) {
          slot.className = 'slot';
          slot.innerHTML = '<div class="card">' + cardSVG(card) + '</div>';
        } else {
          slot.className = 'slot empty';
          slot.innerHTML = '<span class="slot-num">' + s + '</span>';
        }
        slots.appendChild(slot);
      }

      const btns = document.createElement('div');
      btns.className = 'panel-btns';
      if (p.finished) {
        for (let k = 0; k < 2; k++) {
          const b = document.createElement('button');
          b.className = 'ans-btn';
          b.disabled = true;
          btns.appendChild(b);
        }
      } else {
        const labels = buttonLabels(p.stage);
        labels.forEach((label, choiceIndex) => {
          const b = document.createElement('button');
          b.className = 'ans-btn';
          b.textContent = label;
          b.disabled = !isActive;
          b.addEventListener('click', () => onAnswer(idx, choiceIndex));
          btns.appendChild(b);
        });
      }

      panel.appendChild(head);
      panel.appendChild(stg);
      panel.appendChild(prompt);
      panel.appendChild(res);
      panel.appendChild(slots);
      panel.appendChild(btns);

      (idx === 0 ? playersBottom : playersTop).appendChild(panel);
    });
  }
```

- [ ] **Step 7: Replace `setResult()` to write `state.lastResult`**

Find `function setResult(text, kind) {` (≈ line 1261):

```js
  function setResult(text, kind) {
    statusResult.textContent = text;
    statusResult.className = 'status-result' + (kind ? ' ' + kind : '');
  }
```

Replace with:

```js
  // Result feedback is stored on state, keyed to the player who acted, and
  // painted by renderControls into that player's panel. `idx` omitted/null
  // clears it (start/menu).
  function setResult(text, kind, idx) {
    if (!state) return;
    state.lastResult = text
      ? { idx: (idx == null ? -1 : idx), text: text, kind: kind || '' }
      : null;
  }
```

- [ ] **Step 8: Add `lastResult` to the state object**

Find the `state = {` literal inside `function startGame()` (≈ line 1595):

```js
    state = {
      players: names.map(name => ({ name, stage: 1, finished: false, revealed: [] })),
      deck: shuffle(buildDeck()),
      discard: [],
      activePlayer: 0,
      finishOrder: []
    };
```

Replace with (adds `lastResult`):

```js
    state = {
      players: names.map(name => ({ name, stage: 1, finished: false, revealed: [] })),
      deck: shuffle(buildDeck()),
      discard: [],
      activePlayer: 0,
      finishOrder: [],
      lastResult: null
    };
```

- [ ] **Step 9: Remove the `reRing` resize listeners**

Find this block (≈ lines 1703–1706):

```js
  // Keep the player ring fitted when the viewport changes.
  function reRing() { if (state && controlsRegion.children.length) ringPanels(); }
  window.addEventListener('resize', reRing);
  window.addEventListener('orientationchange', reRing);
```

Delete it entirely (no ring to refit; `controlsRegion` no longer exists). Leave the `setAppHeight` resize/orientation listeners directly above it untouched.

- [ ] **Step 10: Verify in browser**

Start the preview server at repo root (`C:\Projects\MiniGames`) and open `games/busfahren/index.html`.

- `preview_console_logs` — expected: no ReferenceErrors (no `statusName`, `controlsRegion`, `ringPanels`, `reRing` errors). The menu renders.
- Click the `4` player button, then `▶ SPIELEN`. `preview_snapshot` — expected: a single P1 panel in the bottom row; P2/P3/P4 panels in the top row; deck + discard centered between them; fullscreen + menu buttons top-right.
- `preview_screenshot` — confirm top-row panels are rotated 180° (text upside-down relative to bottom), bottom panel upright, layout is portrait/column with no horizontal overflow.
- Note: card deal/sweep animations will be inert or skipped this task (they still target the removed center slots) — the game must still be logically playable (cards appear via render). That is expected and fixed in Task 3.

- [ ] **Step 11: Commit**

```bash
git add games/busfahren/index.html
git commit -m "$(cat <<'EOF'
refactor(busfahren): column layout, per-player panels, drop ring

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Social turn flow — pass turn every action, reset only the failing player

**Files:**
- Modify: `games/busfahren/index.html`

- [ ] **Step 1: Replace `applyOutcome()`**

Find `function applyOutcome(p, playerIndex, outcome, stage, cardName) {` (≈ line 1277) through its closing brace / final `return false;` (≈ line 1304). Replace the whole function with:

```js
  // Outcome-continuation seam. Turn ALWAYS passes after an action (social
  // flow — nobody chains stages in one turn). A non-terminal win bumps the
  // player's own stage and KEEPS their revealed cards (cumulative progress).
  // A stage-4 win finishes the player (their cards discard). A loss resets
  // ONLY that player to stage 1 and discards only their cards — other
  // players' progress is untouched. Returns true when the end screen was
  // shown (caller must stop). Synchronous so Task-5 animation can defer it.
  function applyOutcome(p, playerIndex, outcome, stage, cardName) {
    if (outcome === 'win') {
      if (stage < 4) {
        // Advance this player's own stage; keep their revealed cards.
        p.stage = stage + 1;
        setResult('RICHTIG! (' + cardName + ') → Stufe ' + p.stage, 'win', playerIndex);
        advanceTurn();
      } else {
        // Cleared all four stages — player finishes.
        p.finished = true;
        state.finishOrder.push(playerIndex);
        discardRevealed(p);
        setResult(p.name + ' ist FERTIG! (' + cardName + ')', 'win', playerIndex);
        if (checkAllFinished()) {
          render();
          showEndScreen();
          return true;
        }
        advanceTurn();
      }
    } else {
      // Wrong / boundary / auto-loss — ONLY this player resets to Stufe 1
      // and clears their own spots. Turn passes on.
      p.stage = 1;
      discardRevealed(p);
      setResult('FALSCH (' + cardName + ') — zurück zu Stufe 1', 'lose', playerIndex);
      advanceTurn();
    }
    return false;
  }
```

(The behavioral change vs. the old version: the `stage < 4` branch now calls `advanceTurn()` and no longer relies on the same player continuing; `discardRevealed` is NOT called on a non-terminal win, so the player's revealed cards persist across their turns; all `setResult` calls now pass `playerIndex`.)

- [ ] **Step 2: Clear the previous result when a new action starts**

Find `function onAnswer(playerIndex, choiceIndex) {` (≈ line 1482). Just after the existing guard lines and `lockAnswerButtons();`, i.e. change:

```js
    animBusy = true;
    lockAnswerButtons();

    try {
      const stage = p.stage;
```

to:

```js
    animBusy = true;
    lockAnswerButtons();
    state.lastResult = null;

    try {
      const stage = p.stage;
```

- [ ] **Step 3: Verify turn flow in browser**

Reload `games/busfahren/index.html` in the preview. Start a 2-player game (P1 bottom, P2 top).

- `preview_snapshot` — P1 active (highlighted), buttons enabled; P2 buttons disabled.
- Click one of P1's answer buttons. `preview_snapshot` — verify:
  - On a correct answer: P1's stage badge increments, the revealed card appears in P1's spot, the result `RICHTIG!…` shows on P1's panel, and the active panel is now **P2** (turn passed — P1 did NOT get a second action).
  - On a wrong answer: P1's stage badge resets to `Stufe 1/4`, P1's spots clear, result `FALSCH…` on P1's panel, active panel is **P2**.
- Take P2 through a wrong answer, then bring the turn back to a player who had progress — confirm that player's earlier stage/cards are still intact (only the player who fails resets; others are untouched).
- `preview_console_logs` — no errors.

- [ ] **Step 4: Commit**

```bash
git add games/busfahren/index.html
git commit -m "$(cat <<'EOF'
feat(busfahren): social turn flow — pass turn each action, per-player progress

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Retarget deal / sweep animations to the acting player's panel

**Files:**
- Modify: `games/busfahren/index.html`

- [ ] **Step 1: Retarget `animateDealAndFlip` to the player's panel slot**

Find `async function animateDealAndFlip(card, stage) {` (≈ line 1360). Change the signature and the slot lookup. Replace:

```js
  async function animateDealAndFlip(card, stage) {
    const slot = stageSlots.querySelector('[data-stage="' + stage + '"]');
    if (!slot) return;
```

with:

```js
  async function animateDealAndFlip(card, stage, playerIndex) {
    const slot = document.querySelector(
      '.panel[data-player="' + playerIndex + '"] ' +
      '.panel-slots .slot[data-spot="' + stage + '"]');
    if (!slot) return;
```

Leave the rest of the function body unchanged (the flyer logic, the reduced-motion early settle, and the final `slot.classList.remove('empty'); slot.innerHTML = '<div class="card">' + cardSVG(card) + '</div>';` all still work against the panel slot).

- [ ] **Step 2: Retarget `animateSweepToDiscard` to the player's panel slots**

Find `async function animateSweepToDiscard() {` (≈ line 1419). Replace:

```js
  async function animateSweepToDiscard() {
    const reduced = prefersReducedMotion();
    const cards = Array.from(stageSlots.querySelectorAll('.slot .card'));
    if (!cards.length || reduced) return;
```

with:

```js
  async function animateSweepToDiscard(playerIndex) {
    const reduced = prefersReducedMotion();
    const cards = Array.from(document.querySelectorAll(
      '.panel[data-player="' + playerIndex + '"] .panel-slots .slot .card'));
    if (!cards.length || reduced) return;
```

Leave the rest of the function (rect math, sweep transform, `onceTransitionEnd`) unchanged.

- [ ] **Step 3: Pass `playerIndex` from `onAnswer` and paint result before the sweep**

In `onAnswer` (≈ lines 1520–1538), find:

```js
      // Deal + flip the drawn card into its stage slot; it stays visible.
      await animateDealAndFlip(card, stage);

      // Surface the result text before the sweep so the player reads it.
      const willSweep = (outcome === 'lose') || (outcome === 'win' && stage === 4);
      if (willSweep) {
        if (outcome === 'lose') {
          setResult('FALSCH (' + cardName + ') — zurück zu Stufe 1', 'lose');
        } else if (p.revealed.length === 4) {
          setResult(p.name + ' ist FERTIG! (' + cardName + ')', 'win');
        }
        await wait(prefersReducedMotion() ? 0 : 650);
        await animateSweepToDiscard();
      }
```

Replace with (adds `playerIndex` args; `render()` so the result paints on the still-active actor panel during the pause; both `setResult` calls take `playerIndex`):

```js
      // Deal + flip the drawn card into the acting player's stage slot.
      await animateDealAndFlip(card, stage, playerIndex);

      // Surface the result text before the sweep so the player reads it.
      const willSweep = (outcome === 'lose') || (outcome === 'win' && stage === 4);
      if (willSweep) {
        if (outcome === 'lose') {
          setResult('FALSCH (' + cardName + ') — zurück zu Stufe 1', 'lose', playerIndex);
        } else if (p.revealed.length === 4) {
          setResult(p.name + ' ist FERTIG! (' + cardName + ')', 'win', playerIndex);
        }
        render();
        await wait(prefersReducedMotion() ? 0 : 650);
        await animateSweepToDiscard(playerIndex);
      }
```

(`render()` here runs while the acting player is still `state.activePlayer` — `applyOutcome`/`advanceTurn` has not run yet — so the result + filled spots show on the actor's own panel during the 650 ms read pause. The later `render()` after `applyOutcome` then shows the turn handed off, with the result persisting on the actor's now-inactive panel until the next action clears `state.lastResult`.)

- [ ] **Step 4: Verify animations in browser**

Reload `games/busfahren/index.html`. Start a 3-player game.

- Click P1's answer. `preview_screenshot` mid-sequence if possible, and after: the face-down card flies from the deck to **P1's** stage spot and flips face-up there (not to the center).
- Force a loss for P1 (pick the wrong direction): the revealed cards in P1's panel sweep toward the central discard pile, then P1's spots clear and the turn is on the next player.
- Drive a player through all 4 stages over multiple turns to a stage-4 win: confirm the finish sweeps their spots to discard and `… ist FERTIG!` shows on their panel.
- `preview_console_logs` — no errors, no orphaned `.fly-card` / `.reshuffle-card` (input not wedged: buttons re-enable after each sequence).

- [ ] **Step 5: Commit**

```bash
git add games/busfahren/index.html
git commit -m "$(cat <<'EOF'
feat(busfahren): retarget deal/sweep animations to player panels

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Edge-case verification and final pass

**Files:**
- Modify (only if a defect is found): `games/busfahren/index.html`

- [ ] **Step 1: 1-player layout**

Reload, start a **1-player** game. `preview_snapshot` + `preview_screenshot`:
- Expected: top row is hidden (`.players-top:empty { display:none }`), single P1 panel at the bottom, deck+discard fill the space above it, no layout overflow. Play a few actions — turn stays on P1 (only player), stage advances/resets correctly, animations target P1's panel.

- [ ] **Step 2: Reduced motion**

In the preview, emulate `prefers-reduced-motion: reduce` (via `preview_eval` setting the emulation, or note it if the harness exposes it). Start a 2-player game and take several actions.
- Expected: cards appear in spots instantly (no fly/flip/sweep), turn flow and per-player reset still correct, no console errors. (If emulation is not available in the harness, state that explicitly and verify the non-reduced path only.)

- [ ] **Step 3: Menu / restart mid-animation**

Start a 4-player game. Click an answer and, during the deal animation, click the menu (`☰`) button.
- Expected: returns to the menu; `state` and `animBusy` cleared. Start a new game — it is responsive (buttons work; the `animBusy` lock did not latch).

- [ ] **Step 4: Reshuffle**

Play a 4-player game far enough that the deck empties and reshuffles (deck count badge hits 0 then refills). 
- Expected: reshuffle ghost animates discard → deck, deck count refills, the subsequent deal proceeds normally, no errors.

- [ ] **Step 5: Fullscreen control**

Click the fullscreen (`⛶`) button top-right, then exit. Expected: enters/exits fullscreen, icon toggles, layout reflows without clipping the bottom panel (the `setAppHeight`/`forceReflow` path still runs — unchanged by this work).

- [ ] **Step 6: Final spec cross-check**

Re-read `docs/superpowers/specs/2026-05-17-busfahren-layout-design.md`. Confirm every spec section is satisfied by the running game. If any defect was found in Steps 1–5, fix it in `games/busfahren/index.html` and re-verify the affected step.

- [ ] **Step 7: Commit (only if Step 6 produced fixes)**

```bash
git add games/busfahren/index.html
git commit -m "$(cat <<'EOF'
fix(busfahren): layout/turn-flow edge-case fixes from verification

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review (performed while writing this plan)

**Spec coverage:**
- Fullscreen controls top-right → Task 1 Steps 1, 3 (`controls-bar` in column flow, identical `.ctrl-btn` styling).
- No widescreen support → Task 1 Step 1 (no landscape/aspect media queries; portrait column) + Step 9 (removed `reRing` viewport listeners).
- Player controls like other games, no circle, max 4 → Task 1 Steps 1, 6 (grid rows, `ringPanels()` deleted; menu already caps at 4).
- Center = only Stapel + Ablage → Task 1 Steps 1, 3, 5 (felt holds deck+discard; status/stage-slots removed from center and from `render()`).
- Bigger controllers with own 4 spots → Task 1 Steps 1, 6 (`.panel` sizing + `.panel-slots` of 4 per panel from `p.revealed`).
- Switch player every action → Task 2 Step 1 (`advanceTurn()` in every branch).
- Turn the controller around for top → Task 1 Step 1 (`.players-top { transform: rotate(180deg) }`) + Step 6 (P2..P4 → `playersTop`).
- Social per-player progress, reset only on own failure → Task 2 Step 1 (non-terminal win keeps `revealed`; loss `discardRevealed(p)` affects only `p`).
- Animations follow the player → Task 3.

**Placeholder scan:** No TBD/TODO; every code-changing step shows full replacement code. Reduced-motion emulation caveat (Task 4 Step 2) explicitly instructs to state if unavailable rather than leaving it open.

**Type/name consistency:** `setResult(text, kind, idx)` defined Task 1 Step 7; all callers updated to 3-arg (Task 2 Step 1 in `applyOutcome`, Task 3 Step 3 in `onAnswer`); `('', null)` callers in `startGame`/`backToMenu` rely on the `if (!state) return;` guard and 2-arg form (idx → -1, harmless). `state.lastResult` shape `{idx,text,kind}` written by `setResult`, read by `renderControls` (Task 1 Step 6), initialized Task 1 Step 8, cleared Task 2 Step 2. `panel.dataset.player` / `slot.dataset.spot` set in `renderControls` (Task 1 Step 6) and queried by both animations (Task 3 Steps 1–2). `playersTop`/`playersBottom` defined Task 1 Step 4, used Step 6. `animateDealAndFlip(card, stage, playerIndex)` / `animateSweepToDiscard(playerIndex)` signatures (Task 3 Steps 1–2) match the call sites (Task 3 Step 3). No reference to removed `statusName`/`statusStage`/`statusQuestion`/`statusResult`/`stageSlots`/`controlsRegion`/`ringPanels`/`reRing` remains after Task 1.
