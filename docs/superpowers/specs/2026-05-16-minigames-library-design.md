# MiniGames Library — Design

Date: 2026-05-16

## Goal

Create a main landing page ("library") for a repository of standalone browser
games, with themed thumbnails linking to each game. Currently one game exists:
Snakes & Ladders. The structure must make adding future games trivial, and every
game must remain completely standalone.

## Constraints & Decisions

- **Standalone games**: each game is a single self-contained HTML file (inline
  CSS/JS, fonts via CDN). No shared runtime, no build step.
- **Thumbnails**: CSS/HTML art cards — no image files. Themed per game.
- **Hosting**: one repo with local folders. All paths relative so it works by
  opening `index.html` from disk and also if served (e.g. GitHub Pages).
- **Existing file**: `snakes-ladders-80s_3.html` is moved and renamed to
  `games/snakes-and-ladders/index.html` (content unchanged).
- **Aesthetic**: 80s synthwave/neon arcade, matching the existing game
  (neon pink `#ff2bd6` / cyan `#00f0ff`, `Press Start 2P` + `VT323` fonts,
  dark `#0a0420` background with faint grid, glow effects).

## Directory Structure

```
MiniGames/
├── index.html                       # library landing page
├── games/
│   └── snakes-and-ladders/
│       └── index.html               # moved from snakes-ladders-80s_3.html
└── docs/superpowers/specs/
    └── 2026-05-16-minigames-library-design.md
```

Adding a future game = create `games/<slug>/index.html` + add one card to the
landing page.

## Landing Page (`index.html`)

A single standalone HTML file.

**Layout**
- Neon arcade header: "MINIGAMES" title with glow, optional subtitle.
- Responsive grid of game cards (CSS Grid, `auto-fill`, min card width
  ~260px, collapses to one column on narrow/mobile screens).
- Footer line (small): count of games / simple credit.

**Game card (one per game)**
- The entire card is an `<a>` linking to `games/<slug>/index.html`.
- Contents:
  - Themed CSS art "thumbnail" panel. For Snakes & Ladders: a stylized
    board motif — a grid hint with a neon snake curve and a ladder, drawn
    with CSS gradients/shapes (no images).
  - Game title (`Press Start 2P`).
  - Short tagline (`VT323`).
- Interaction: on hover/focus/tap → intensified neon glow + slight scale-up;
  keyboard focusable (it is an anchor) with visible focus ring.

**Theming**
- Reuse the game's CSS custom properties / palette for visual consistency.
- Background: dark base with faint synthwave grid overlay and radial vignette,
  mirroring the game's `body::before` / `body::after` treatment.
- Mobile-first / responsive (the game is mobile-first; the library matches).

## Game Folder

`games/snakes-and-ladders/index.html` is the existing file content moved
verbatim. No functional changes to the game.

## Approaches Considered

1. **Static landing + per-game folders (chosen)** — zero dependencies, opens
   by double-click, trivial to extend, satisfies the standalone requirement.
2. **Data-driven (JSON manifest + JS-rendered cards)** — less repetition at
   scale but adds JS and `file://` fetch caveats. Overkill for one game; can
   migrate later if the catalog grows large.
3. **Static site generator** — rejected; introduces a build step, contradicts
   the standalone goal.

## Out of Scope

- No JS framework, bundler, or package manager.
- No automated screenshot generation.
- No analytics, routing, or backend.
- No changes to game logic.

## Success Criteria

- Opening `index.html` (from disk or served) shows a neon-themed library with
  one Snakes & Ladders card.
- Clicking the card loads the playable game from its own folder.
- Library and game share a consistent 80s synthwave look.
- Layout is usable on mobile and desktop widths.
- Adding a new game requires only a new folder and one new card.
