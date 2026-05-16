# Busfahren Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a self-contained "Busfahren" Watt-card minigame at `games/busfahren/index.html` and link it from the arcade index.

**Architecture:** Single HTML file (HTML + CSS + vanilla JS), same neon synthwave shell as `games/snakes-and-ladders/index.html`. State machine drives turn-based play across 1–4 players through a 4-stage gauntlet on a shared 33-card deck with a discard/reshuffle cycle. Cards are rendered as inline illustrated SVG.

**Tech Stack:** Plain HTML/CSS/ES2015 JS. No build, no test framework (codebase convention). Verification is via the browser preview tools.

**Codebase note:** No unit-test harness exists; other games are static HTML. "Verify" steps mean: open the file in preview, exercise the path, check console + DOM. Commit after each task.

---

### Task 1: Page shell + theme + setup menu

**Files:**
- Create: `games/busfahren/index.html`

- [ ] **Step 1: Scaffold the shell.** Copy the structural conventions from `games/snakes-and-ladders/index.html`: `<!DOCTYPE html>`, `lang="de"`, viewport meta, Google Fonts link (`Press Start 2P`, `VT323`), `:root` neon vars (`--bg`, `--neon-*`, `--p1`..`--p4`), `* { box-sizing }`, synthwave `body::before/::after` grid, `#app` with `--app-vh` height handling, `.topbar` with a back breadcrumb `<a href="../../index.html">` and the fullscreen button + its IIFE script (port the `fsBtn` script verbatim from snakes-and-ladders).

- [ ] **Step 2: Build the setup menu.** A `.menu` view containing: title `BUSFAHREN`, a player-count selector (buttons 1/2/3/4, default 2), four name inputs (`Spieler 1`..`Spieler 4`, only the first N visible/enabled per selected count), and a `SPIELEN` button. Hidden game view container `#game` (empty for now).

- [ ] **Step 3: Verify.** `preview_start` the file; `preview_snapshot` confirms the menu renders, fonts/theme load, player-count buttons toggle name-input visibility, no console errors.

- [ ] **Step 4: Commit.** `git add games/busfahren/index.html && git commit -m "feat(busfahren): page shell + setup menu"`

---

### Task 2: Deck model + card SVG rendering

**Files:**
- Modify: `games/busfahren/index.html`

- [ ] **Step 1: Card data model.** In a `<script>`, define suits `['schell','eichel','herz','laub']`, ranks with values `{7:7,8:8,9:9,10:10,unter:11,ober:12,koenig:13,ass:14}`, build the 32 suit×rank cards + one `weli` card (value `Infinity`). Helpers: `colorOf(card)` → `'rot'` for herz/laub, `'schwarz'` for eichel/schell, `weli` → null (always-win); `shuffle(arr)` (Fisher–Yates).

- [ ] **Step 2: SVG card faces.** `cardSVG(card)` returns an illustrated SVG string: suit emblem shapes for **schell** (bell), **eichel** (acorn), **herz** (heart), **laub** (leaf); pip layouts for 7–10; figure faces for `unter`/`ober`/`koenig`; single large emblem for `ass`; a sun/globe motif for `weli`. Plus `cardBackSVG()` for face-down cards. Rank corner labels: `7 8 9 10 U O K A` and `W`.

- [ ] **Step 3: Verify.** Temporarily render the full deck into `#game`; `preview_screenshot` to eyeball all 33 faces + back; remove the temp render after.

- [ ] **Step 4: Commit.** `git commit -am "feat(busfahren): deck model + illustrated SVG cards"`

---

### Task 3: Game layout + per-player controls

**Files:**
- Modify: `games/busfahren/index.html`

- [ ] **Step 1: Game view markup.** Build `#game`: a status header (current player name, `Stufe (n/4)`, question text), a center row with the deck stack (+remaining count badge), 4 stage slots, and a discard pile, and a controls region rendering one panel per active player. Each panel: player name, stage/`FERTIG` status, two decision buttons.

- [ ] **Step 2: Wire setup → game.** `SPIELEN` reads count + names, builds `players` state (`{name, stage:1, finished:false, revealed:[]}`), builds + shuffles the deck, hides `.menu`, shows `#game`, renders panels, sets active player 0.

- [ ] **Step 3: Stage-aware button labels.** `buttonLabels(stage)` → `['TIEFER','HÖHER']` (1 & 2), `['INNEN','AUSSEN']` (3), `['ROT','SCHWARZ']` (4). Render labels on the active player's two buttons; disable all non-active players' buttons.

- [ ] **Step 4: Verify.** `preview` a 3-player game; snapshot shows header, deck/slots/discard, 3 panels, only player 1's buttons enabled with `TIEFER/HÖHER`.

- [ ] **Step 5: Commit.** `git commit -am "feat(busfahren): game layout + per-player controls"`

---

### Task 4: Stage rules engine + turn flow

**Files:**
- Modify: `games/busfahren/index.html`

- [ ] **Step 1: Resolver.** `resolveStage(stage, guess, cards, drawn)` returning `'win'|'lose'`:
  - Stage 1: `weli`→win; value 10→lose; guess `HÖHER` correct iff value>10; `TIEFER` iff value<10.
  - Stage 2: `weli`→win; equal value to card1→lose; else compare to card1 by guess.
  - Stage 3: `weli`→win; let lo/hi = sorted(card1,card2 values); equal to lo or hi → lose; `INNEN` correct iff lo<v<hi; `AUSSEN` iff v<lo or v>hi.
  - Stage 4: `weli`→win; correct iff `colorOf(drawn)` matches guess (`ROT`/`SCHWARZ`).

- [ ] **Step 2: Turn flow.** On an active player's button: draw top card, push to `revealed`, animate into stage slot (Task 5 hook — for now place immediately), call `resolveStage`. On win: stage++ ; if stage>4 mark `finished`, move revealed→discard. On lose: reset stage=1, move revealed→discard. Either terminal outcome (finish OR lose) → advance turn to next non-finished player. If draw pile empty at draw time, reshuffle discard into it.

- [ ] **Step 3: End detection.** When all players `finished`, show an end overlay ranking by finish order; last finisher labeled `BUSFAHRER`. Add a `NOCHMAL` button → back to setup menu.

- [ ] **Step 4: Verify.** Play a full 2-player game in preview via `preview_click` on buttons; confirm wins advance stages, a wrong guess resets to stage 1 + passes turn, deck reshuffles when emptied, end screen names the Busfahrer. Check console clean.

- [ ] **Step 5: Commit.** `git commit -am "feat(busfahren): stage rules engine + turn flow"`

---

### Task 5: Animations

**Files:**
- Modify: `games/busfahren/index.html`

- [ ] **Step 1: Deal + flip.** CSS: a dealt card element starts at the deck stack's position and transitions `transform` to its stage slot, then a `rotateY` 3D flip from back to face. JS sequences: append card at deck origin → next frame translate to slot → on `transitionend` flip to reveal, then resolve the stage.

- [ ] **Step 2: Fail sweep + reshuffle.** On lose/finish, animate the slot cards translating to the discard pile then clearing. On reshuffle, animate the discard stack moving onto the deck origin before the next draw.

- [ ] **Step 3: Turn-change highlight.** CSS transition on the active player's panel (glow/border) when the active index changes.

- [ ] **Step 4: Verify.** Preview a game; `preview_screenshot` mid-deal and after a fail to confirm motion; ensure animations don't block input (buttons re-enable only after the deal+resolve completes) and no console errors.

- [ ] **Step 5: Commit.** `git commit -am "feat(busfahren): deal/flip/fail/reshuffle animations"`

---

### Task 6: Link from arcade index + final pass

**Files:**
- Modify: `index.html`

- [ ] **Step 1: Add grid card.** In `index.html` `<main class="grid">`, add a 3rd `<a class="card" href="games/busfahren/index.html">` with an inline SVG thumb (Watt-card motif) and title `BUSFAHREN`, tag `Südtiroler Kartenspiel — 1-4 Spieler`. Match existing card markup.

- [ ] **Step 2: Final verification.** Preview the root `index.html`; click through to Busfahren; play one full game at 4 players including a reshuffle and the end screen; resize (`preview_resize`) to a phone width to confirm layout holds; console clean.

- [ ] **Step 3: Commit.** `git commit -am "feat: add Busfahren to arcade index"`

---

## Self-Review

- **Spec coverage:** shell/theme/topbar (T1) ✓; setup menu 1–4 + names (T1) ✓; 33-card deck + suits + Weli + values + color map (T2) ✓; illustrated SVG faces (T2) ✓; game layout deck/slots/discard (T3) ✓; per-player two-button controls, active-only (T3) ✓; 4-stage rules incl. draw=lose + Weli-always-win + Innen/Außen + Rot/Schwarz (T4) ✓; reset-to-1 + turn pass on fail (T4) ✓; reshuffle on empty (T4) ✓; Busfahrer end screen (T4) ✓; deal/flip/fail/reshuffle/turn animations (T5) ✓; arcade index card (T6) ✓. No gaps.
- **Placeholders:** none — each task states concrete files, rules, and verification.
- **Type consistency:** shared identifiers `players[].{stage,finished,revealed}`, `resolveStage`, `colorOf`, `cardSVG`, `buttonLabels`, draw/discard piles used consistently across T2–T5.
