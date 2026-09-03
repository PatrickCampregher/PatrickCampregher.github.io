# Zombie Survival — Ashford Street

A browser-based, first-person, round-based **co-op zombie survival** game for LAN play.
Original assets only: every texture, model, sound and map is generated procedurally at runtime (no downloads, no copyrighted content).

* Engine: [Babylon.js](https://www.babylonjs.com/) (WebGL2), vendored locally — works fully offline.
* Server: Node.js 18+, **zero npm dependencies** (own WebSocket + UDP discovery implementation).
* Players: 1–4 by default (host can raise the limit up to 8).

## Quick start

1. Install [Node.js LTS](https://nodejs.org) (only requirement).
2. Double-click **`START_GAME.bat`** (Windows) or run `./start_game.sh` (macOS/Linux).
   The local game server starts and your browser opens `http://localhost:8080`.
3. If Windows Firewall asks, click **Allow access** (private networks) so friends can join.

### Playing with friends on the same Wi-Fi / LAN

Every player runs their own copy (copy the whole folder to each PC):

| Host                                              | Friends                                                     |
|---------------------------------------------------|-------------------------------------------------------------|
| Start the game → **MULTIPLAYER → HOST GAME**      | Start the game → **MULTIPLAYER → FIND LAN GAMES**           |
| Choose a lobby name (e.g. *Patrick's Game*)        | The lobby appears with players, ping and status → **JOIN**  |
| Wait for everyone, then **START GAME**            | Press **READY**                                             |

Also available: **JOIN BY NAME** (type the lobby name) and **DIRECT CONNECT** (host IP, shown in the host's server window, e.g. `192.168.1.20:8080`). A friend without their own copy can simply open the host's LAN address in a browser — the host serves the whole game.

No Internet, accounts or external services are needed. Lobbies are discovered with UDP broadcast on port 47800; the game itself runs over a WebSocket on the HTTP port (8080, or the next free port).

## Controls (remappable in CONTROLS)

| Action            | Key                     |
|-------------------|-------------------------|
| Move              | W A S D                 |
| Look / Shoot / ADS| Mouse / LMB / RMB       |
| Reload            | R                       |
| Interact / Use    | E (hold for revive & barricade repair) |
| Jump / Sprint     | Space / Shift           |
| Crouch            | Ctrl or C               |
| Weapons           | 1 / 2 / Q / mouse wheel |
| Pause             | Esc                     |

## Gameplay

* Infinite rounds with mathematical scaling: more zombies, faster mixes (shamblers → walkers → joggers → runners), bounded health growth, shorter spawn gaps.
* Points for hits, kills, headshots, barricade repairs and revives. Spend them on doors (open the Bar, Corner Store, alleys, parking lot, garage), wall weapons, ammo and the **Mystery Box** (950).
* The Mystery Box rolls a weighted random weapon from 13 originals (pistol → LMG, launcher, Arc Cannon, Ray Rifle). Sometimes the **stuffed bear** appears: refund, the box vanishes and reappears elsewhere — follow the light beam.
* Powerups dropped by zombies: **FULL RESUPPLY**, **ONE-SHOT**, **DOUBLE POINTS**, **BLAST WAVE**.
* Downed players can be revived by teammates (hold E). When everyone is down: game over with stats, then back to the lobby for another run.

## Architecture

```
server/    Node.js: static files, WebSocket (RFC 6455), UDP LAN discovery, lobby, authoritative simulation
shared/    Code used by both sides: map data, collision, nav grid, weapon/zombie definitions, protocol
client/    Browser: Babylon.js rendering, procedural textures/models/audio, input, HUD, menus
```

The **host machine's Node server is the authority** (zombie AI, spawning, rounds, damage validation, points, box, doors, powerups, revives). Browsers send inputs, view direction, shots and interaction requests. Remote players and zombies are interpolated; shots are lag-compensated against zombie position history.

Because the authority lives in the server process (not in the host's browser tab), the game keeps running if the host closes their tab; lobby host rights migrate to the next player.

## Graphics settings

Presets LOW / MEDIUM / HIGH / ULTRA plus render resolution scale, shadows (PCF / cascaded), texture size, effects, anti-aliasing (FXAA / MSAA), ambient occlusion, bloom, **render distance / haze**, **atmosphere particles**, film grain, VSync, FPS limit and FOV. Settings persist in the browser.

* **Render distance** (60–300 m) sets how far you see clearly before the night haze closes in (~30 % haze at half the distance, ~75 % at the full distance). Buildings, vehicles, fires and zombies are never hidden by distance; only small props and decals switch off beyond about half the render distance, and distant fire emitters throttle down.
* **Atmosphere particles**: OFF / LOW (a little ash) / MEDIUM (half budgets) / HIGH (drifting embers, falling ash, smoke columns over burning buildings and cars, spark bursts from damaged electrics and buzzing lamps). Budgets at HIGH: ~120 embers + ~150 ash flakes around the camera, ~26 smoke puffs per structure fire, 3 spark bursts of ≤48. Nothing spawns within 1.2 m of the camera.
* Lighting: moonlight with a camera-following, texel-snapped shadow frustum (PCF on MEDIUM/HIGH, 3 cascades on ULTRA), a cool sky fill so zombies stay readable in alleys, warm street/fire point lights assigned per chunk, ACES tone mapping with colour grading, bloom on emissives only, SSAO on HIGH/ULTRA, a one-shot reflection probe on car paint/glass/metal.
* Textures are procedural PBR sets (albedo, normal, roughness, cavity AO) generated in Web Workers at 256/512/1024 px depending on the texture quality setting.
* `window.dev.g.perf` shows live render stats (fps, frame ms, draw calls, active meshes, particles, LOD-hidden props, shadow casters).

## Developer notes

* `npm start` runs the server; `node server/index.js --port 8090 --no-browser` starts a second instance for local testing; `--dev` enables cheat messages used by the test helpers (`window.dev` in the browser console).
* `node tools/test-sim.js 60 2` runs the headless simulation (map sanity checks + 60 s of two bots).
