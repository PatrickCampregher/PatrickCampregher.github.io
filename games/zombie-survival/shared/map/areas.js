// Ashford Street - playable areas, ground planes, floor slabs (ground + upper levels) and staircases.
//
// Layout (x east, z north):  Main Street runs E-W along z=0; Foundry Avenue (second street) runs N-S at
// x 12..24 and crosses it at the burning bus. West of the avenue: the start street between THE RUSTY NAIL
// (NW, two storeys + balcony) / PHARMACY (N) and the DINER ruin (SW) / collapsed apartment block (S).
// North: alley -> plaza with fountain. East of the avenue: THE PALACE theatre (NE, mezzanine + stage with
// Pack-a-Punch), AUTO GARAGE (SE, roof via fire escape) and the parking lot (far SE).

export const bounds = { minX: -34, maxX: 58, minZ: -33, maxZ: 43 };

export const areas = {
  street: { name: 'Main Street', rects: [[-32, -9, 12, 9]] },
  bar: { name: 'The Rusty Nail', rects: [[-27, 9, -8, 24]] },
  pharmacy: { name: 'Pharmacy', rects: [[-4, 9, 12, 19]] },
  plaza: { name: 'Fountain Plaza', rects: [[-8, 9, -4, 21], [-8, 21, 12, 40]] },
  diner: { name: 'Diner', rects: [[-28, -24, -10, -9]] },
  backlot: { name: 'Back Lot', rects: [[-28, -30, 12, -24], [-10, -24, 12, -9]] },
  xstreet: { name: 'Foundry Avenue', rects: [[12, -30, 24, 40], [24, -9, 56, 9]] },
  garage: { name: 'Auto Garage', rects: [[24, -27, 41, -9]] },
  parking: { name: 'Parking Lot', rects: [[41, -30, 56, -9]] },
  theatre: { name: 'The Palace', rects: [[24, 9, 48, 34]] },
};

// Ground visuals (y = 0). Never overlap two grounds (z-fighting); the base plane sits 2 cm lower.
export const grounds = [
  { x0: -32, z0: -6, x1: 14, z1: 6, mat: 'asphalt' },           // Main Street west (+ intersection west half)
  { x0: 14, z0: -30, x1: 22, z1: 40, mat: 'asphalt' },          // Foundry Avenue
  { x0: 22, z0: -6, x1: 56, z1: 6, mat: 'asphalt' },            // Main Street east
  { x0: 41, z0: -30, x1: 56, z1: -9, mat: 'asphalt_lot' },      // parking lot
  { x0: -28, z0: -30, x1: 12, z1: -24, mat: 'asphalt_old' },    // back alley
  { x0: -10, z0: -24, x1: 12, z1: -9, mat: 'dirt' },            // collapsed block (rubble ground)
  { x0: -8, z0: 9, x1: -4, z1: 21, mat: 'asphalt_old' },        // north alley
  { x0: -8, z0: 21, x1: 12, z1: 40, mat: 'plaza_stone' },       // plaza
  { x0: -4, z0: 19, x1: 12, z1: 21, mat: 'dirt' },              // fenced service strip behind the pharmacy
  { x0: -34, z0: -33, x1: 58, z1: 43, mat: 'rubble_ground', base: true },
];

// Raised slabs (collision + visual). y = top. level > 0 = thin upper slab that declares its nav area.
export const floors = [
  // sidewalks (kerbs 15 cm)
  { x0: -32, z0: 6, x1: 12, z1: 9, y: 0.15, mat: 'sidewalk' },
  { x0: -32, z0: -9, x1: 12, z1: -6, y: 0.15, mat: 'sidewalk' },
  { x0: 12, z0: -30, x1: 14, z1: -6, y: 0.15, mat: 'sidewalk' },
  { x0: 12, z0: 6, x1: 14, z1: 40, y: 0.15, mat: 'sidewalk' },
  { x0: 22, z0: -30, x1: 24, z1: -6, y: 0.15, mat: 'sidewalk' },
  { x0: 22, z0: 6, x1: 24, z1: 40, y: 0.15, mat: 'sidewalk' },
  { x0: 24, z0: 6, x1: 55.5, z1: 9, y: 0.15, mat: 'sidewalk' },      // end at the east rubble wall's inner face
  { x0: 24, z0: -9, x1: 55.5, z1: -6, y: 0.15, mat: 'sidewalk' },
  // ground floors
  { x0: -27, z0: 9, x1: -8, z1: 24, y: 0.15, mat: 'wood_floor' },      // bar
  { x0: -4, z0: 9, x1: 12, z1: 19, y: 0.15, mat: 'tile_floor' },       // pharmacy
  { x0: -28, z0: -24, x1: -10, z1: -9, y: 0.15, mat: 'tile_checker' }, // diner
  { x0: 24, z0: -27, x1: 41, z1: -9, y: 0.15, mat: 'concrete' },       // garage
  { x0: 24, z0: 9, x1: 48, z1: 19, y: 0.15, mat: 'marble' },           // theatre lobby
  { x0: 24, z0: 19, x1: 48, z1: 29, y: 0.15, mat: 'carpet_red' },      // auditorium
  { x0: 24, z0: 29, x1: 48, z1: 34, y: 0.4, mat: 'stage_wood' },       // stage (one 25 cm step up)
  // ---- level 1 (y 3.6 unless noted) ----
  { x0: -27, z0: 9, x1: -11.2, z1: 24, y: 3.6, level: 1, area: 'bar', mat: 'wood_floor' },   // bar upstairs (west of the stairwell)
  { x0: -11.2, z0: 16, x1: -8, z1: 24, y: 3.6, level: 1, area: 'bar', mat: 'wood_floor' },   // bar upstairs (landing strip east)
  { x0: -24, z0: 6.2, x1: -12, z1: 9, y: 3.6, level: 1, area: 'bar', mat: 'concrete' },       // bar balcony over the sidewalk
  { x0: -8, z0: 17, x1: -4, z1: 19, y: 3.6, level: 1, area: 'bar', mat: 'boards' },           // plank bridge over the alley
  { x0: -4, z0: 9.18, x1: 12, z1: 19, y: 3.6, level: 1, area: 'bar', mat: 'roof_tar' },       // pharmacy roof (nest); starts at the facade's inner face
  { x0: 24, z0: 15, x1: 27, z1: 19, y: 3.6, level: 1, area: 'theatre', mat: 'carpet_red' },   // mezzanine west end (stair arrives)
  { x0: 27, z0: 14, x1: 45, z1: 19, y: 3.6, level: 1, area: 'theatre', mat: 'carpet_red' },   // mezzanine centre
  { x0: 45, z0: 15, x1: 48, z1: 19, y: 3.6, level: 1, area: 'theatre', mat: 'carpet_red' },   // mezzanine east end
  { x0: 2, z0: -16, x1: 12, z1: -9, y: 3.4, level: 1, area: 'backlot', mat: 'concrete' },     // surviving floor fragment ("the perch")
  { x0: 41.3, z0: -18.2, x1: 44.3, z1: -15.4, y: 2.9, level: 1, area: 'parking', mat: 'metal_stair' }, // fire escape landing (covers flight 2's first step)
  // ---- level 2 ----
  { x0: 24, z0: -27, x1: 41, z1: -9.18, y: 5.2, level: 2, area: 'parking', mat: 'roof_tar' }, // garage roof (ends at the north wall's inner face)
  { x0: 41.18, z0: -11.4, x1: 44.3, z1: -9.4, y: 5.2, level: 2, area: 'parking', mat: 'metal_stair' }, // fire escape top platform
  { x0: 41.0, z0: -11.38, x1: 41.2, z1: -9.42, y: 5.21, level: 2, area: 'parking', mat: 'metal_dark', thick: 0.27 }, // threshold plate over the wall top in the parapet opening (zombies need a floor box under their centre)
];

// Straight staircases (mapbuild.js schema). Bottom edge centre (x,z) at y0, climbing along yaw.
// rails: visual handrail sides ('w'/'e' relative to the climb direction, 'both', 'none'); metal: fire escape look.
export const stairs = [
  { x: -9.6, z: 10.5, yaw: 0, w: 1.6, len: 5.5, y0: 0.15, y1: 3.6, level: 1, area: 'bar', mat: 'wood_dark', rails: 'w' },
  { x: 25.0, z: 9.6, yaw: 0, w: 1.6, len: 5.4, y0: 0.15, y1: 3.6, level: 1, area: 'theatre', mat: 'marble', rails: 'e' },
  { x: 47.0, z: 9.6, yaw: 0, w: 1.6, len: 5.4, y0: 0.15, y1: 3.6, level: 1, area: 'theatre', mat: 'marble', rails: 'w' },
  { x: 42.05, z: -10.6, yaw: Math.PI, w: 1.4, len: 5.4, y0: 0, y1: 2.9, level: 1, area: 'parking', mat: 'metal_stair', base: -0.2, rails: 'both', metal: true },
  { x: 43.55, z: -16.0, yaw: 0, w: 1.4, len: 4.6, y0: 2.9, y1: 5.2, level: 2, area: 'parking', mat: 'metal_stair', base: 2.6, rails: 'both', metal: true },
  { x: 6, z: -21.6, yaw: 0, w: 2.4, len: 5.6, y0: 0, y1: 3.4, level: 1, area: 'backlot', mat: 'rubble', rails: 'none' },
];
