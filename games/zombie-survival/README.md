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
* Points for hits, kills, headshots, barricade repairs and revives. Spend them on doors (750 for the first buildings, 1000 for alleys, avenue and lots, 1250/1500 for the theatre), wall weapons, ammo, perk machines and the **Mystery Box** (950).
* **The map – Ashford Street.** A ruined small town at night: Main Street (the start) crosses Foundry Avenue at a burning bus wreck. North of the start: **THE RUSTY NAIL** bar (two storeys, a street balcony with a drop-down gap, a plank bridge over the north alley onto the **PHARMACY** roof nest), the alley and the fountain **plaza**. South: the **DINER** ruin and a collapsed apartment block whose rubble ramp leads up to a surviving floor fragment overlooking the street, plus the back alley. East of the avenue: **THE PALACE** theatre (lobby with two grand staircases to a mezzanine, auditorium and stage), the **AUTO GARAGE** (roof reachable only by the external fire escape from the parking lot) and the parking lot. Eleven areas (the garage roof is its own zone), 15 doors, 8 wall weapons, 8 Mystery Box spots (two upstairs), 4 perk machines (Quick Revive at the start, Juggernog in the plaza, Speed Cola in the diner, Double Tap on the garage roof) and the Pack-a-Punch on the theatre stage. Every place you can stand is reachable by zombies on foot – stairs, ramps and fire escapes – while balcony gaps and roof edges let you drop down to escape.
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

Presets LOW / MEDIUM / HIGH / ULTRA plus render resolution scale, shadows (PCF / cascaded), texture size, effects, anti-aliasing (FXAA / MSAA), ambient occlusion, bloom, VSync, FPS limit and FOV. Settings persist in the browser.

## Developer notes

* `npm start` runs the server; `node server/index.js --port 8090 --no-browser` starts a second instance for local testing; `--dev` enables cheat messages used by the test helpers (`window.dev` in the browser console).
* `node tools/test-sim.js 60 2` runs the headless simulation (map sanity checks + 60 s of two bots); `node tools/test-sim.js 60 2 high` adds the high-ground scenario (zombies must climb to a bot on the highest floor).
* `node tools/probe-route.mjs lot_e1 33.25,-26.75,5.2` force-spawns one zombie at an entry with a bot at a position and logs its route (deterministic check that a stair / fire escape is walkable for the server physics).
* `node tools/validate-map.mjs` checks the map data for geometry hygiene (prop overlaps, floating props, coplanar faces, upper-slab clearance) and gameplay placement (entries, wall buys, machines, box spots, spawns). It must report zero problems.
* `node tools/snap.mjs --serve --port 8102 --god --pos X,Z[,Y] --look YAW,PITCH --out tools/shots/name.png` takes headless WebGL screenshots of the running game (see the file header for `--js`/`--eval`).
* Map data lives in `shared/map/` (areas/floors/stairs, one module per building block, streets, gameplay) and is assembled by `shared/mapdata.js`; `shared/mapbuild.js` documents the schema.
