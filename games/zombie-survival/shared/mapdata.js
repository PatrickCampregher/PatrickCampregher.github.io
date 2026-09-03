// "Ashford Street" - a ruined American small town at night: Main Street crossing Foundry Avenue at the
// burning bus, THE RUSTY NAIL bar (two storeys + balcony), PHARMACY (walkable roof), DINER ruin, a collapsed
// apartment block with a rubble ramp, the fountain plaza, THE PALACE theatre (mezzanine + stage with the
// Pack-a-Punch), the AUTO GARAGE (roof via fire escape) and the parking lot.
//
// Pure data, assembled from the modules in shared/map/. Expanded by mapbuild.js into collision boxes and
// visual segments; the nav grid (nav.js) derives ground + upper layers from floors/stairs.
// Coordinate system: x = east, z = north, y = up. Yaw 0 faces +Z.

import { bounds, areas, grounds, floors, stairs } from './map/areas.js';
import { bar, pharmacy } from './map/buildings_nw.js';
import { diner, ruins } from './map/buildings_s.js';
import { garage, theatre } from './map/buildings_e.js';
import { boundaryWalls, streetBoxes, props, signs, outer, markings } from './map/streets.js';
import { doors, entries, boxLocations, wallBuys, machines, playerSpawns } from './map/gameplay.js';

const buildings = [bar, pharmacy, diner, ruins, garage, theatre];

export const MAP = {
  name: 'Ashford Street',
  bounds,
  cell: 0.5,
  startArea: 'street',
  areas,
  grounds,
  floors,
  stairs,
  machines,
  walls: [...buildings.flatMap(b => b.walls), ...boundaryWalls],
  boxes: [...buildings.flatMap(b => b.boxes), ...streetBoxes],
  // decorative boxes without collision (cornices, canopies, curtains ...)
  decor: buildings.flatMap(b => b.decor || []),
  signs,
  markings,
  doors,
  entries,
  boxLocations,
  wallBuys,
  playerSpawns,
  props,
  outer,
};
