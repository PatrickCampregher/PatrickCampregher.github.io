# Gioco dell'Oca Menu Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rework the setup screen of *Il Gioco dell'Oca*: drop name fields, enlarge the board preview, and add a data-driven perk registry powering a settings dialog and a random layout generator.

**Architecture:** Replace the hardcoded `LUCK_UP`/`LUCK_DOWN`/`LUCK` constants with a `PERKS` registry plus runtime `perkCounts` (localStorage-persisted) and `perkLayout` (generated each load and on demand). `classify`, board build, landing, and cell-info read the registry generically so future perks need only one registry entry.

**Tech Stack:** Single self-contained `games/gioco-dell-oca/index.html` — vanilla HTML/CSS/JS, no build, no test framework. Verification is manual in a browser via the preview tools.

**Spec:** `docs/superpowers/specs/2026-05-16-gioco-dell-oca-menu-redesign-design.md`

**Conventions:** All edits are in `games/gioco-dell-oca/index.html`. Keep the existing terse code style (compact, semicolon-joined, `$=id=>...`). Commit after each task. There is no automated test runner — each task's verification is a browser check; only commit once the described browser behavior is confirmed.

---

## Task 1: Replace perk constants with the registry + runtime state

**Files:**
- Modify: `games/gioco-dell-oca/index.html` (script, the `LUCK_UP`/`LUCK_DOWN`/`LUCK` block ~lines 291-299, and the state declarations ~lines 306-308)

- [ ] **Step 1: Remove the old perk constants**

Delete these lines (the comment block plus `LUCK_UP`, `LUCK_DOWN`, `LUCK`):

```js
  // Custom special fields — edit these field numbers freely.
  const LUCK_UP=[11,33,51];     // "Increased Luck": +2 on the die for 3 turns
  const LUCK_DOWN=[8,27,46];    // "Decreased Luck": -2 on the die for 3 turns (can go backward)
  const LUCK={
    up:{img:"icons/luck-up.png",title:"Fortuna Aumentata",
        text:"<b>+2</b> al dado per i prossimi <b>3 turni</b>."},
    down:{img:"icons/luck-down.png",title:"Sfortuna",
        text:"<b>&minus;2</b> al dado per i prossimi <b>3 turni</b> &mdash; puoi finire in negativo e <b>tornare indietro</b>."}
  };
```

- [ ] **Step 2: Add the perk registry in their place**

Insert where the deleted block was:

```js
  // Perk registry — add a future perk by appending one entry here.
  // fx: die modifier applied for `turns` turns when a player lands on it.
  const PERKS=[
    {id:"luckup",  icon:"icons/luck-up.png",  title:"Fortuna Aumentata",
     text:"<b>+2</b> al dado per i prossimi <b>3 turni</b>.",
     defaultCount:3, fx:{val:2,turns:3}},
    {id:"luckdown",icon:"icons/luck-down.png",title:"Sfortuna",
     text:"<b>&minus;2</b> al dado per i prossimi <b>3 turni</b> &mdash; puoi finire in negativo e <b>tornare indietro</b>.",
     defaultCount:3, fx:{val:-2,turns:3}}
  ];
  const PERK_BY_ID=Object.fromEntries(PERKS.map(p=>[p.id,p]));
  const USABLE_FIELDS=TOTAL-2;            // fields 2..62 (1=start, 63=goal reserved)
  const LS_KEY="goca.perkCounts";

  let perkCounts={};                       // {id:count} — persisted
  let perkLayout={};                       // {id:[fields]} — regenerated each load
```

- [ ] **Step 3: Verify the file still parses**

Run: `node --check games/gioco-dell-oca/index.html` is NOT valid (HTML). Instead open the page with the preview tool and confirm no console error.

Use preview_start on `games/gioco-dell-oca/index.html`, then preview_console_logs.
Expected: page loads; console will show errors like `classify is not defined`-type breakage is NOT expected yet (classify still references LUCK_UP). It WILL throw `LUCK_UP is not defined` at load because `buildCells($("menuBoard"))` runs. That is expected and fixed in Task 2 — note it and proceed.

- [ ] **Step 4: Commit**

```bash
git add games/gioco-dell-oca/index.html
git commit -m "refactor: introduce perk registry + runtime state"
```

---

## Task 2: Add persistence + generation helpers and wire load sequence

**Files:**
- Modify: `games/gioco-dell-oca/index.html` (script, after the `perkLayout` declaration from Task 1; and the `buildCells($("menuBoard"),false);` call ~line 416)

- [ ] **Step 1: Add load/save/generate helpers**

Insert immediately after `let perkLayout={};`:

```js
  function loadPerkCounts(){
    let stored={};
    try{ stored=JSON.parse(localStorage.getItem(LS_KEY))||{}; }catch(e){ stored={}; }
    const c={};
    PERKS.forEach(p=>{
      let v=Number.isInteger(stored[p.id])?stored[p.id]:p.defaultCount;
      c[p.id]=Math.max(0,v);
    });
    // Clamp total down to capacity if stored data overflows.
    let total=PERKS.reduce((s,p)=>s+c[p.id],0);
    for(let i=PERKS.length-1;i>=0 && total>USABLE_FIELDS;i--){
      const id=PERKS[i].id, cut=Math.min(c[id],total-USABLE_FIELDS);
      c[id]-=cut; total-=cut;
    }
    return c;
  }
  function savePerkCounts(){
    try{ localStorage.setItem(LS_KEY,JSON.stringify(perkCounts)); }catch(e){}
  }
  function freeFields(){
    return USABLE_FIELDS-PERKS.reduce((s,p)=>s+(perkCounts[p.id]||0),0);
  }
  function shuffle(a){
    for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; }
    return a;
  }
  // Spread positions via equal segments; assign types with a max-spacing
  // interleave so the same perk never sits on consecutive occupied slots.
  function generateLayout(){
    const out={}; PERKS.forEach(p=>out[p.id]=[]);
    const T=PERKS.reduce((s,p)=>s+(perkCounts[p.id]||0),0);
    if(T===0){ perkLayout=out; return; }
    // 1. positions: one random field per equal segment of 2..(TOTAL-1)
    const lo=2, hi=TOTAL-1, span=hi-lo+1;          // 2..62 inclusive
    const pos=[];
    for(let i=0;i<T;i++){
      const a=lo+Math.floor(i*span/T), b=lo+Math.floor((i+1)*span/T)-1;
      pos.push(a+Math.floor(Math.random()*(Math.max(a,b)-a+1)));
    }
    // 2. ordered type list, most-frequent first, round-robin placed so
    //    identical ids are maximally separated in sequence.
    const buckets=PERKS.map(p=>({id:p.id,n:perkCounts[p.id]||0}))
                       .filter(x=>x.n>0).sort((x,y)=>y.n-x.n);
    const seq=new Array(T); let idx=0;
    buckets.forEach(bk=>{
      for(let k=0;k<bk.n;k++){ seq[idx]=bk.id; idx+=2; if(idx>=T) idx=1; }
    });
    // 3. zip — pos already ascending by construction
    for(let i=0;i<T;i++) out[seq[i]].push(pos[i]);
    PERKS.forEach(p=>out[p.id].sort((a,b)=>a-b));
    perkLayout=out;
  }
```

- [ ] **Step 2: Initialize state before the menu preview is built**

Replace this line:

```js
  buildCells($("menuBoard"),false); // static menu preview
```

with:

```js
  perkCounts=loadPerkCounts();
  generateLayout();
  buildCells($("menuBoard"),false); // static menu preview
```

- [ ] **Step 3: Update `classify` to use the registry**

Replace these two lines inside `classify(n)`:

```js
    if(LUCK_UP.includes(n)) return "luckup";
    if(LUCK_DOWN.includes(n)) return "luckdown";
```

with:

```js
    for(const p of PERKS){ if(perkLayout[p.id] && perkLayout[p.id].includes(n)) return p.id; }
```

- [ ] **Step 4: Verify the menu board renders perks**

Use preview_start (or reload) on `games/gioco-dell-oca/index.html`.
preview_console_logs → Expected: no `LUCK_UP is not defined` / no errors.
preview_screenshot → Expected: setup screen shows the board preview with luck icons placed at random positions (different from the old fixed 11/33/51 & 8/27/46).

- [ ] **Step 5: Commit**

```bash
git add games/gioco-dell-oca/index.html
git commit -m "feat: perk layout generation + localStorage counts"
```

---

## Task 3: Make board build / landing / cell-info registry-driven

**Files:**
- Modify: `games/gioco-dell-oca/index.html` (`buildCells` ~lines 396-407, `openCellInfo` ~lines 486-489, `handleLanding` ~lines 688-693, `routeSVG` dot loop ~lines 371-376)

- [ ] **Step 1: Update `buildCells` perk rendering**

Replace this block in `buildCells`:

```js
      if(kind==="luckup"||kind==="luckdown"){
        const L=kind==="luckup"?LUCK.up:LUCK.down;
        inner+='<img class="ficon" src="'+BASE+L.img+'" alt="" draggable="false">';
        ttl=L.title;
      }else{
```

with:

```js
      if(PERK_BY_ID[kind]){
        const P=PERK_BY_ID[kind];
        inner+='<img class="ficon" src="'+BASE+P.icon+'" alt="" draggable="false">';
        ttl=P.title;
      }else{
```

- [ ] **Step 2: Update `openCellInfo` perk branch**

Replace:

```js
    }else if(kind==="luckup"||kind==="luckdown"){
      const L=kind==="luckup"?LUCK.up:LUCK.down;
      title=L.title;
      body="Casella <b>"+n+"</b>. "+L.text;
    }else if(kind==="goose"){
```

with:

```js
    }else if(PERK_BY_ID[kind]){
      const P=PERK_BY_ID[kind];
      title=P.title;
      body="Casella <b>"+n+"</b>. "+P.text;
    }else if(kind==="goose"){
```

- [ ] **Step 3: Update `handleLanding` perk branch**

Replace:

```js
    if(LUCK_UP.includes(n) || LUCK_DOWN.includes(n)){
      const up=LUCK_UP.includes(n), L=up?LUCK.up:LUCK.down;
      p.fx.push({val:up?2:-2, img:L.img, turns:3});   // stacks with any existing effects
      event(L.title,(preMsg?preMsg+"<br>":"")+"<b>"+esc(p.name)+"</b> &mdash; "+L.text);
      endRoll(); return;
    }
```

with:

```js
    const lp=PERKS.find(x=>perkLayout[x.id] && perkLayout[x.id].includes(n));
    if(lp){
      p.fx.push({val:lp.fx.val, img:lp.icon, turns:lp.fx.turns});  // stacks with any existing effects
      event(lp.title,(preMsg?preMsg+"<br>":"")+"<b>"+esc(p.name)+"</b> &mdash; "+lp.text);
      endRoll(); return;
    }
```

- [ ] **Step 4: Confirm `routeSVG` needs no perk change**

Read `routeSVG`'s dot loop (~lines 371-376). It only dots `goose`/`peril`/`party`, never `luckup`/`luckdown`. No change needed — note and move on.

- [ ] **Step 5: Verify a full game uses generated perks**

Reload `games/gioco-dell-oca/index.html`.
- preview_click the count button "2", then click "Inizia la Partita".
- preview_screenshot → board shows luck icons at the generated positions.
- Click a perk cell on the board → preview_snapshot: modal shows the correct perk title/text.
- Play a few rolls (preview_click the active player box repeatedly); when a player lands on a perk, the effect flash + die modifier still works.
- preview_console_logs → Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add games/gioco-dell-oca/index.html
git commit -m "refactor: registry-driven board build, landing and cell info"
```

---

## Task 4: Remove player name fields

**Files:**
- Modify: `games/gioco-dell-oca/index.html` (setup markup ~line 224, `buildNames` ~lines 320-330, `namesBox` decl ~line 311, `startGame` ~lines 553-559)

- [ ] **Step 1: Remove the names container from setup markup**

Delete this line:

```html
      <div class="names" id="names"></div>
```

- [ ] **Step 2: Remove `namesBox` reference**

Replace:

```js
  const countRow=$("countRow"), namesBox=$("names");
```

with:

```js
  const countRow=$("countRow");
```

- [ ] **Step 3: Remove `buildNames` and its calls**

Delete the whole `buildNames` function:

```js
  function buildNames(){
    namesBox.innerHTML="";
    for(let i=0;i<chosenCount;i++){
      const w=document.createElement("label"); w.className="name-field";
      const s=document.createElement("span"); s.className="seal"; s.style.background=SEAL_COLORS[i];
      const inp=document.createElement("input"); inp.type="text"; inp.maxLength=14;
      inp.placeholder="Giocatore "+(i+1);
      w.appendChild(s); w.appendChild(inp); namesBox.appendChild(w);
    }
  }
  buildNames();
```

And in the count-button click handler, remove the trailing `buildNames()` call:

```js
    b.addEventListener("click",()=>{chosenCount=c;[...countRow.children].forEach(x=>x.classList.toggle("on",+x.dataset.c===c));buildNames();});
```

becomes:

```js
    b.addEventListener("click",()=>{chosenCount=c;[...countRow.children].forEach(x=>x.classList.toggle("on",+x.dataset.c===c));});
```

- [ ] **Step 4: Auto-name players in `startGame`**

Replace:

```js
    players=[];
    const inputs=namesBox.querySelectorAll("input");
    for(let i=0;i<chosenCount;i++){
      const nm=(inputs[i].value.trim())||("Giocatore "+(i+1));
      players.push({idx:i,name:nm,pos:1,skip:0,trapped:null,lastRoll:null,fx:[]});
    }
```

with:

```js
    players=[];
    for(let i=0;i<chosenCount;i++){
      players.push({idx:i,name:"Giocatore "+(i+1),pos:1,skip:0,trapped:null,lastRoll:null,fx:[]});
    }
```

- [ ] **Step 5: Verify**

Reload `games/gioco-dell-oca/index.html`.
- preview_screenshot → setup screen has NO name fields; count buttons + preview + start button only.
- preview_click count "3" → no errors (preview_console_logs), no name fields appear.
- Click "Inizia la Partita" → game starts; players are "Giocatore 1/2/3" (visible on player boxes).

- [ ] **Step 6: Commit**

```bash
git add games/gioco-dell-oca/index.html
git commit -m "feat: drop per-player name fields, auto-name players"
```

---

## Task 5: Enlarge the board preview

**Files:**
- Modify: `games/gioco-dell-oca/index.html` (CSS `.menu-board` ~line 110)

- [ ] **Step 1: Increase the preview size**

Replace:

```css
  .menu-board{width:min(74vw,260px);aspect-ratio:7/9;flex:none;margin:2px auto;
    border:2px solid var(--ink);outline:1px solid var(--gold);outline-offset:2px;}
```

with:

```css
  .menu-board{width:min(90vw,420px);max-height:58vh;aspect-ratio:7/9;flex:none;margin:2px auto;
    border:2px solid var(--ink);outline:1px solid var(--gold);outline-offset:2px;}
```

(`max-height:58vh` keeps the action buttons reachable on short screens; the `.setup` container already scrolls.)

- [ ] **Step 2: Verify at two viewport sizes**

Reload `games/gioco-dell-oca/index.html`.
- preview_screenshot → preview is visibly larger than before.
- preview_resize to a short landscape (e.g. 800x420) → preview_screenshot: "Inizia la Partita" / buttons still visible/reachable (scroll if needed).
- preview_resize back to a normal phone portrait (e.g. 390x844) → preview_screenshot: looks good.

- [ ] **Step 3: Commit**

```bash
git add games/gioco-dell-oca/index.html
git commit -m "style: enlarge menu board preview"
```

---

## Task 6: Add Generate button + settings/gear button to the setup action row

**Files:**
- Modify: `games/gioco-dell-oca/index.html` (setup markup ~lines 225-226; CSS near `.btn` ~line 77; wire-up section ~line 718)

- [ ] **Step 1: Add the action row markup**

Replace:

```html
      <div class="menu-board"><div class="board" id="menuBoard"></div></div>
      <button class="btn gold" id="startBtn">Inizia la Partita</button>
```

with:

```html
      <div class="menu-board"><div class="board" id="menuBoard"></div></div>
      <div class="setup-actions">
        <button class="btn small" id="settingsBtn" aria-label="Impostazioni perk">⚙ Perk</button>
        <button class="btn small" id="genBtn">↻ Genera</button>
      </div>
      <button class="btn gold" id="startBtn">Inizia la Partita</button>
```

- [ ] **Step 2: Add styles for the action row + small button**

Add after the `.btn.gold` rule (~line 77):

```css
  .setup-actions{display:flex;gap:10px;flex-wrap:wrap;justify-content:center;}
  .btn.small{padding:9px 18px;font-size:clamp(12px,2vw,14px);
    background:linear-gradient(180deg,var(--paper),var(--paper-dark));color:var(--ink);}
```

- [ ] **Step 3: Wire the Generate button**

In the wire-up section, after:

```js
  $("startBtn").addEventListener("click",startGame);
```

add:

```js
  $("genBtn").addEventListener("click",()=>{ generateLayout(); buildCells($("menuBoard"),false); });
```

- [ ] **Step 4: Verify Generate works**

Reload `games/gioco-dell-oca/index.html`.
- preview_screenshot → two new buttons ("⚙ Perk", "↻ Genera") between preview and start.
- preview_click "↻ Genera" several times, preview_screenshot after each → perk icon positions change each press.
- preview_console_logs → no errors.

- [ ] **Step 5: Commit**

```bash
git add games/gioco-dell-oca/index.html
git commit -m "feat: add Generate layout button to setup"
```

---

## Task 7: Add the perk settings modal

**Files:**
- Modify: `games/gioco-dell-oca/index.html` (add modal markup near the existing `#modal` ~line 256; add CSS near `.modal` styles ~line 193; add JS render + wiring in the wire-up section)

- [ ] **Step 1: Add the settings modal markup**

After the closing `</div>` of the existing field-info modal (the `#modal` block, just before `</div>` that closes `#app` ~line 257), add:

```html
  <!-- Perk settings -->
  <div class="modal" id="setModal">
    <div class="card" role="dialog" aria-modal="true">
      <div class="mtag">Impostazioni</div>
      <h3>Perk sul tabellone</h3>
      <div class="perk-list" id="perkList"></div>
      <div class="free-line">Caselle libere: <b id="freeCount">0</b></div>
      <button class="mclose" id="setClose">Fatto</button>
    </div>
  </div>
```

- [ ] **Step 2: Add settings modal styles**

After the `.modal .mclose:active` rule (~line 193), add:

```css
  .perk-list{display:flex;flex-direction:column;gap:10px;margin:6px 0 12px;}
  .perk-row{display:flex;align-items:center;gap:10px;border:1.5px solid var(--ink-soft);
    background:rgba(255,250,232,.5);padding:8px 10px;}
  .perk-row img{width:26px;height:26px;object-fit:contain;flex:none;}
  .perk-row .pt{flex:1;min-width:0;text-align:left;font-family:'Cinzel',serif;
    font-size:13px;color:var(--ink);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
  .step{display:flex;align-items:center;gap:8px;flex:none;}
  .step button{width:30px;height:30px;border:2px solid var(--ink);background:var(--paper);
    color:var(--ink);font-family:'Cinzel',serif;font-weight:700;font-size:18px;line-height:1;}
  .step button:disabled{opacity:.35;cursor:not-allowed;}
  .step .cnt{min-width:22px;text-align:center;font-family:'Cinzel',serif;font-weight:700;font-size:16px;}
  .free-line{font-family:'Cinzel',serif;font-size:13px;color:var(--ink-soft);
    letter-spacing:.08em;margin-bottom:4px;}
  .free-line b{color:var(--oxblood);font-size:1.15em;}
```

- [ ] **Step 3: Add the settings render function**

In the script, add this function near `generateLayout` (anywhere in the function scope, e.g. just after it):

```js
  function renderSettings(){
    const list=$("perkList"); list.innerHTML="";
    const free=freeFields();
    $("freeCount").textContent=String(free);
    PERKS.forEach(p=>{
      const row=document.createElement("div"); row.className="perk-row";
      const c=perkCounts[p.id]||0;
      row.innerHTML='<img src="'+BASE+p.icon+'" alt="">'
        +'<span class="pt">'+p.title+'</span>'
        +'<span class="step">'
        +'<button type="button" data-d="-1"'+(c<=0?" disabled":"")+'>&minus;</button>'
        +'<span class="cnt">'+c+'</span>'
        +'<button type="button" data-d="1"'+(free<=0?" disabled":"")+'>+</button>'
        +'</span>';
      const btns=row.querySelectorAll("button");
      btns[0].addEventListener("click",()=>changePerk(p.id,-1));
      btns[1].addEventListener("click",()=>changePerk(p.id,1));
      list.appendChild(row);
    });
  }
  function changePerk(id,d){
    const next=(perkCounts[id]||0)+d;
    if(next<0) return;
    if(d>0 && freeFields()<=0) return;
    perkCounts[id]=next;
    savePerkCounts();
    generateLayout();
    buildCells($("menuBoard"),false);
    renderSettings();
  }
```

- [ ] **Step 4: Wire the settings open/close**

In the wire-up section, after the `$("genBtn")` line from Task 6, add:

```js
  $("settingsBtn").addEventListener("click",()=>{ renderSettings(); $("setModal").classList.add("show"); });
  $("setClose").addEventListener("click",()=>$("setModal").classList.remove("show"));
  $("setModal").addEventListener("click",e=>{ if(e.target===$("setModal")) $("setModal").classList.remove("show"); });
```

- [ ] **Step 5: Include the settings modal in the Escape handler**

Replace:

```js
  document.addEventListener("keydown",e=>{ if(e.key==="Escape") closeModal(); });
```

with:

```js
  document.addEventListener("keydown",e=>{ if(e.key==="Escape"){ closeModal(); $("setModal").classList.remove("show"); } });
```

- [ ] **Step 6: Verify the settings modal**

Reload `games/gioco-dell-oca/index.html`.
- preview_click "⚙ Perk" → preview_snapshot: modal lists both perks (icon + title), each with `−`/count/`+`, and a "Caselle libere: N" line.
- preview_click `+` on a perk repeatedly → free count drops; preview after closing shows more icons on the preview board.
- Drive free count to 0 (keep pressing `+`) → preview_snapshot: ALL `+` buttons disabled.
- preview_click `−` down to 0 on a perk → its `−` disabled at 0.
- Close modal, reload page → reopen settings: counts persisted (preview_snapshot shows the changed counts).
- preview_console_logs → no errors.

- [ ] **Step 7: Commit**

```bash
git add games/gioco-dell-oca/index.html
git commit -m "feat: perk settings modal with per-perk counts + free-field guard"
```

---

## Task 8: Final regression pass

**Files:**
- None (verification only)

- [ ] **Step 1: Full playthrough**

Reload `games/gioco-dell-oca/index.html`.
- Setup: no name fields; bigger preview; Perk + Genera + Inizia buttons.
- Set perk counts via settings; press Genera a few times; pick 4 players; Inizia.
- preview_screenshot → board uses the generated layout; players auto-named.
- Play until a player lands on a luck field → effect flash, die modifier, stacking still work (play several turns; preview_screenshot the effect card).
- Click cells → field info modal correct for perk and non-perk cells.
- Win a game (or use a high perk-free layout) → win screen → "Un'Altra Partita" returns to setup with the same generated layout intact.
- preview_resize short landscape + phone portrait → layout still usable.
- preview_console_logs → zero errors across the whole run.

- [ ] **Step 2: Confirm no leftover references**

Grep the file for dead identifiers — expect ZERO matches:

Run (Grep tool): pattern `LUCK_UP|LUCK_DOWN|\bLUCK\b|buildNames|namesBox` in `games/gioco-dell-oca/index.html`
Expected: no matches.

- [ ] **Step 3: Final commit (if any cleanup was needed)**

```bash
git add games/gioco-dell-oca/index.html
git commit -m "chore: regression cleanup for menu redesign"
```

(If Step 2 found nothing and no cleanup was needed, skip this commit.)

---

## Self-Review Notes

- **Spec coverage:** Remove names (Task 4), bigger preview (Task 5), perk registry (Tasks 1-3), settings modal w/ free-field guard (Task 7), Generate + auto-generate on load (Tasks 2 & 6), localStorage counts (Task 2/7), generic for future perks (registry-driven Tasks 1-3 & 7). All spec sections mapped.
- **Type consistency:** `perkCounts` (`{id:count}`), `perkLayout` (`{id:[fields]}`), `PERK_BY_ID`, `freeFields()`, `generateLayout()`, `renderSettings()`, `changePerk()`, `loadPerkCounts()`, `savePerkCounts()` used consistently across tasks.
- **No placeholders:** every code step shows full code; verification steps are concrete browser actions (no test runner exists).
