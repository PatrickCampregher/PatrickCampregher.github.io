# Busfahren — Design Spec

Date: 2026-05-17
Status: Approved

## Summary

A new self-contained card minigame, "Busfahren", added to the MiniGames
arcade library. It uses Südtiroler Watt (German-suited) cards from rank 7
upward plus a Weli jolly. Turn-based, 1–4 players. Each player must clear a
4-stage guessing gauntlet in a row; any wrong answer resets that player to
stage 1 and passes the turn. The last player to finish is the "Busfahrer".

## Shell & Integration

- File: `games/busfahren/index.html` — single self-contained HTML file,
  `lang="de"`, same neon synthwave theme as existing games.
- Topbar: back breadcrumb to site `index.html` + fullscreen button,
  matching `snakes-and-ladders` conventions (`--p1`..`--p4` colors,
  `Press Start 2P` / `VT323` fonts, synthwave grid background, `--app-vh`).
- A 3rd card added to the main `index.html` grid linking to the game.

## Setup Menu

- Title `BUSFAHREN`.
- Player-count selector: 1, 2, 3, 4.
- Editable player names (defaults `Spieler 1`..`Spieler 4`).
- `SPIELEN` button starts the game.

## Cards

33-card deck = 4 suits × 8 ranks + 1 Weli.

- Suits: **Schell** (bell), **Eichel** (acorn), **Herz** (heart),
  **Laub** (leaf). Realistic illustrated SVG faces.
- Ranks: 7, 8, 9, 10, **Unter** (a.k.a. Junge), **Ober** (a.k.a. Dame),
  **König**, **Ass**. Number cards use traditional pip layouts; Unter/Ober/
  König are illustrated figure faces; Ass is a single large emblem.
- **Weli**: distinct jolly card (sun/globe motif) — always wins any stage.
- Values: 7..10 = 7..10, Unter=11, Ober=12, König=13, Ass=14, Weli=∞.
- Color map: **Schwarz** = Eichel + Schell · **Rot** = Herz + Laub.

## Game Flow (turn-based)

On a player's turn they face 4 stages in a row on the shared deck:

1. **Höher/Tiefer als 10?** Card value < 10 → "Tiefer" correct; value > 10
   (Unter/Ober/König/Ass) → "Höher" correct; exactly 10 → instant fail.
   Weli → win.
2. **Höher/Tiefer als Karte 1?** Equal value (draw) → instant fail.
   Weli → win.
3. **Innen/Außen** relative to cards 1 & 2. Landing exactly on a bound →
   instant fail. Weli → win.
4. **Rot/Schwarz** — guess the suit color. Weli → win.

All 4 correct in a row → player is **FERTIG**. Any wrong answer → that
player resets to stage 1, their revealed cards move to the discard pile,
and the turn passes to the next non-finished player. When all players are
FERTIG, an end screen ranks finish order and crowns the last finisher the
**BUSFAHRER**.

## Player Controls

Up to 4 player panels ("controls"), one per player. Each panel shows the
player name + current stage / `FERTIG`, and has **two decision buttons**
whose labels change per stage (`TIEFER`/`HÖHER`, `TIEFER`/`HÖHER`,
`INNEN`/`AUSSEN`, `ROT`/`SCHWARZ`). Only the active player's two buttons are
enabled; all others are disabled until their turn.

## Deck Recycling

Each attempt's revealed cards move to a discard pile. When the draw pile
empties, the discard pile is reshuffled back into it (with a shuffle
animation).

## Animations

- **Deal**: card slides from the deck stack to its stage slot, then 3D
  flip (`rotateY`) to reveal the face.
- **Fail**: the slot's cards sweep off to the discard pile.
- **Reshuffle**: discard pile animates back onto the deck.
- **Turn change**: active-player highlight transition.

## Layout

- Top: current player + stage `(2/4)` + question text.
- Center: deck stack (with remaining count) · 4 stage slots · discard pile.
- Bottom/sides: the per-player control panels with their two buttons.

## Out of Scope (YAGNI)

Sound effects, betting/drinking counters, online multiplayer, persistence,
animations beyond those listed.
