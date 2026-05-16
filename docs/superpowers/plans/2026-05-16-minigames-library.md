# MiniGames Library Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a neon-themed static landing page that lists standalone browser games, with the existing Snakes & Ladders game relocated into a per-game folder.

**Architecture:** Pure static files, no build step. A single `index.html` at repo root renders a responsive grid of CSS-art game cards linking into `games/<slug>/index.html`. Each game folder is fully self-contained. All paths relative.

**Tech Stack:** HTML5, CSS3 (custom properties, CSS Grid), Google Fonts CDN (`Press Start 2P`, `VT323`). No JS framework, no bundler.

> **Testing note:** This repo has no test framework and the deliverable is static HTML. "Tests" here are concrete manual verification steps (file checks + opening in a browser). Follow them exactly; treat a failed expectation as a blocker.

---

### Task 1: Relocate the existing game into its folder

**Files:**
- Move: `snakes-ladders-80s_3.html` → `games/snakes-and-ladders/index.html`

- [ ] **Step 1: Verify the source file exists**

Run: `git status --porcelain && ls snakes-ladders-80s_3.html`
Expected: `snakes-ladders-80s_3.html` is listed and present (untracked).

- [ ] **Step 2: Create the folder and move the file**

```bash
mkdir -p games/snakes-and-ladders
git mv -f snakes-ladders-80s_3.html games/snakes-and-ladders/index.html 2>/dev/null || (mkdir -p games/snakes-and-ladders && mv snakes-ladders-80s_3.html games/snakes-and-ladders/index.html)
```

(The file is currently untracked, so a plain `mv` is expected; the `git mv` is a best-effort no-op fallback.)

- [ ] **Step 3: Verify the move**

Run: `ls games/snakes-and-ladders/index.html && test ! -f snakes-ladders-80s_3.html && echo MOVED_OK`
Expected: prints the path then `MOVED_OK`.

- [ ] **Step 4: Verify the game still opens and is unchanged**

Open `games/snakes-and-ladders/index.html` in a browser. Expected: the game loads exactly as before (it uses inline CSS/JS and CDN fonts, so relocation does not break it). Confirm the title screen "SNAKES & LADDERS — '85" renders and a game can start.

- [ ] **Step 5: Commit**

```bash
git add games/snakes-and-ladders/index.html
git commit -m "refactor: move snakes & ladders into games/snakes-and-ladders/"
```

---

### Task 2: Create the library landing page

**Files:**
- Create: `index.html`

- [ ] **Step 1: Write `index.html`**

Create `index.html` at the repo root with exactly this content:

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>MINIGAMES — Arcade Library</title>
<link href="https://fonts.googleapis.com/css2?family=Press+Start+2P&family=VT323&display=swap" rel="stylesheet">
<style>
  :root {
    --bg: #0a0420;
    --neon-pink: #ff2bd6;
    --neon-cyan: #00f0ff;
    --neon-yellow: #ffd23f;
    --neon-green: #39ff14;
    --neon-purple: #b537f2;
    --card-bg: #14082e;
    --card-bg-2: #1d0b3d;
  }

  * { box-sizing: border-box; margin: 0; padding: 0; }

  html, body {
    min-height: 100%;
    background: var(--bg);
    font-family: 'VT323', monospace;
    color: var(--neon-cyan);
    -webkit-tap-highlight-color: transparent;
  }

  body::before {
    content: '';
    position: fixed;
    inset: 0;
    background-image:
      linear-gradient(var(--neon-pink) 1px, transparent 1px),
      linear-gradient(90deg, var(--neon-pink) 1px, transparent 1px);
    background-size: 40px 40px;
    opacity: 0.08;
    pointer-events: none;
    z-index: 0;
  }

  body::after {
    content: '';
    position: fixed;
    inset: 0;
    background: radial-gradient(ellipse at center, transparent 0%, var(--bg) 85%);
    pointer-events: none;
    z-index: 1;
  }

  .wrap {
    position: relative;
    z-index: 2;
    max-width: 1100px;
    margin: 0 auto;
    padding: 48px 20px 64px;
  }

  header {
    text-align: center;
    margin-bottom: 48px;
  }

  h1 {
    font-family: 'Press Start 2P', monospace;
    font-size: clamp(22px, 6vw, 52px);
    color: var(--neon-pink);
    text-shadow:
      0 0 8px var(--neon-pink),
      0 0 20px var(--neon-pink),
      0 0 40px rgba(255, 43, 214, 0.5);
    letter-spacing: 2px;
    line-height: 1.4;
  }

  .subtitle {
    margin-top: 18px;
    font-size: clamp(16px, 3vw, 24px);
    color: var(--neon-cyan);
    text-shadow: 0 0 8px var(--neon-cyan);
    letter-spacing: 3px;
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
    gap: 28px;
  }

  .card {
    display: flex;
    flex-direction: column;
    text-decoration: none;
    background: linear-gradient(160deg, var(--card-bg), var(--card-bg-2));
    border: 2px solid var(--neon-purple);
    border-radius: 14px;
    overflow: hidden;
    transition: transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease;
    box-shadow: 0 0 0 rgba(181, 55, 242, 0);
  }

  .card:hover,
  .card:focus-visible {
    transform: translateY(-6px) scale(1.02);
    border-color: var(--neon-cyan);
    box-shadow:
      0 0 16px rgba(0, 240, 255, 0.6),
      0 0 32px rgba(255, 43, 214, 0.35);
    outline: none;
  }

  .card:focus-visible {
    outline: 3px solid var(--neon-yellow);
    outline-offset: 3px;
  }

  .thumb {
    position: relative;
    aspect-ratio: 4 / 3;
    background:
      repeating-linear-gradient(0deg, rgba(0,240,255,0.10) 0 1px, transparent 1px 28px),
      repeating-linear-gradient(90deg, rgba(0,240,255,0.10) 0 1px, transparent 1px 28px),
      radial-gradient(circle at 70% 30%, rgba(181,55,242,0.35), transparent 60%),
      var(--bg);
    overflow: hidden;
  }

  /* Snakes & Ladders motif: a neon ladder + a snake curve, pure CSS */
  .thumb-snl .ladder {
    position: absolute;
    left: 22%;
    top: 12%;
    width: 34px;
    height: 76%;
    border-left: 4px solid var(--neon-yellow);
    border-right: 4px solid var(--neon-yellow);
    box-shadow: 0 0 10px var(--neon-yellow);
  }
  .thumb-snl .ladder::before,
  .thumb-snl .ladder::after {
    content: '';
    position: absolute;
    left: -4px;
    right: -4px;
    height: 4px;
    background: var(--neon-yellow);
    box-shadow: 0 0 8px var(--neon-yellow);
  }
  .thumb-snl .ladder::before { top: 28%; }
  .thumb-snl .ladder::after  { top: 64%; }

  .thumb-snl .snake {
    position: absolute;
    right: 16%;
    top: 16%;
    width: 46%;
    height: 68%;
    border: 5px solid var(--neon-green);
    border-color: var(--neon-green) transparent var(--neon-green) transparent;
    border-radius: 50%;
    transform: rotate(18deg);
    box-shadow: 0 0 12px var(--neon-green);
  }
  .thumb-snl .snake::after {
    content: '';
    position: absolute;
    right: -6px;
    top: -6px;
    width: 14px;
    height: 14px;
    background: var(--neon-green);
    border-radius: 50%;
    box-shadow: 0 0 10px var(--neon-green);
  }

  .card-body {
    padding: 18px 18px 22px;
    border-top: 2px solid rgba(181, 55, 242, 0.5);
  }

  .card-title {
    font-family: 'Press Start 2P', monospace;
    font-size: 13px;
    line-height: 1.6;
    color: var(--neon-yellow);
    text-shadow: 0 0 8px rgba(255, 210, 63, 0.7);
  }

  .card-tag {
    margin-top: 12px;
    font-size: 19px;
    color: var(--neon-cyan);
    opacity: 0.85;
  }

  footer {
    margin-top: 56px;
    text-align: center;
    font-size: 18px;
    color: var(--neon-purple);
    opacity: 0.8;
  }
</style>
</head>
<body>
  <div class="wrap">
    <header>
      <h1>MINIGAMES</h1>
      <div class="subtitle">&#9654; INSERT COIN &#9664;</div>
    </header>

    <main class="grid">
      <a class="card" href="games/snakes-and-ladders/index.html">
        <div class="thumb thumb-snl">
          <div class="ladder"></div>
          <div class="snake"></div>
        </div>
        <div class="card-body">
          <div class="card-title">SNAKES &amp; LADDERS</div>
          <div class="card-tag">Neon '85 board race &mdash; 2-4 players</div>
        </div>
      </a>
    </main>

    <footer>1 GAME LOADED &mdash; MORE COMING SOON</footer>
  </div>
</body>
</html>
```

- [ ] **Step 2: Verify the file structure is correct**

Run: `ls index.html games/snakes-and-ladders/index.html`
Expected: both paths print with no error.

- [ ] **Step 3: Verify the link target resolves**

Run: `grep -n 'href="games/snakes-and-ladders/index.html"' index.html`
Expected: one match. Confirm a file exists at that relative path (verified in Step 2).

- [ ] **Step 4: Visual verification in a browser**

Open `index.html` in a browser. Confirm:
  - "MINIGAMES" neon title and "INSERT COIN" subtitle render with glow.
  - One card titled "SNAKES & LADDERS" with a visible CSS ladder + snake motif.
  - Hovering the card raises it with a cyan/pink glow; the card is keyboard-focusable (Tab) showing a yellow outline.
  - Layout is a centered grid; resizing the window narrow collapses it to one column without horizontal scroll.

- [ ] **Step 5: Verify navigation works end to end**

In the browser, click the card. Expected: the Snakes & Ladders game loads from `games/snakes-and-ladders/index.html` and is playable. Use the browser Back button to confirm you return to the library.

- [ ] **Step 6: Commit**

```bash
git add index.html
git commit -m "feat: add neon-themed MiniGames library landing page"
```

---

## Self-Review

- **Spec coverage:**
  - Directory structure (root `index.html`, `games/snakes-and-ladders/index.html`, spec under `docs/`) → Task 1 + Task 2.
  - Move & rename existing game verbatim → Task 1.
  - CSS/HTML art thumbnails, no images → Task 2 (`.thumb-snl` ladder/snake, pure CSS).
  - 80s synthwave theming (same palette/fonts/grid/vignette) → Task 2 `:root` vars + `body::before/::after`.
  - Responsive grid, mobile-friendly, full-card link, hover/focus glow, keyboard focus → Task 2 `.grid` / `.card` / `:focus-visible`.
  - Relative paths (works locally & if served) → Task 2 `href="games/..."`.
  - Easy to extend (new folder + one card) → structure in Task 2 `<main class="grid">`.
- **Placeholder scan:** No TBD/TODO; all HTML/CSS provided in full; commands concrete with expected output.
- **Type consistency:** CSS class names referenced in HTML (`card`, `thumb thumb-snl`, `ladder`, `snake`, `card-body`, `card-title`, `card-tag`, `grid`, `wrap`) all match their style definitions.
