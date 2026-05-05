// frontend/office/iso/rooms.js
// Floating platforms (rooms) — each is a colored isometric diamond floor
// hovering over the void. Agents are assigned to a room.

import { Container, Graphics, Text, TextStyle } from 'pixi.js';
import { isoToScreen, TILE_W, TILE_H } from './isoMath';

// Room layout: gridX, gridY, sizeX (tiles), sizeY (tiles), label, color, agents.
// NOTE: gx/gy remapped to align with painted rooms in /assets/sprites/LAYOUT.png
// (2200x1228 @ scale 0.42, anchored at world 0,0). Each room's CENTER lands
// inside its corresponding painted room.
export const ROOMS = {
  hub_central: {
    gx: -2, gy: -2, sx: 4, sy: 4,
    label: 'HUB CENTRAL', color: 0xFF6B9D,
    agents: ['mariana']
  },
  client_relations: {
    gx: -3, gy: -7, sx: 3, sy: 3,
    label: 'CLIENT RELATIONS', color: 0x9B59B6,
    agents: ['diana']
  },
  creative_studio: {
    gx: -9, gy: -4, sx: 5, sy: 4,
    label: 'CREATIVE STUDIO', color: 0xFF6B35,
    agents: ['carlos', 'diego', 'max', 'valentina']
  },
  content_room: {
    gx: -3, gy: 2, sx: 3, sy: 3,
    label: 'CONTENT', color: 0x3498DB,
    agents: ['alex']
  },
  pm_corner: {
    gx: 2, gy: 2, sx: 3, sy: 3,
    label: 'BUILD', color: 0x27AE60,
    agents: ['sofia']
  },
  analytics_room: {
    gx: 8, gy: -2, sx: 3, sy: 3,
    label: 'ANALYTICS', color: 0xF39C12,
    agents: ['lucas']
  },
  finance_office: {
    gx: -9, gy: 2, sx: 3, sy: 3,
    label: 'FINANCE', color: 0x16A085,
    agents: ['roberto']
  },
  qc_station: {
    gx: -1, gy: 8, sx: 2, sy: 2,
    label: 'QC', color: 0x7F8C8D,
    agents: ['qcbot']
  },
  oracle_tower: {
    // Aligned to painted portal in CLIENT RELATIONS bg (image ~1450,320 → world ~147,-123)
    gx: -3, gy: -8, sx: 3, sy: 3,
    label: 'ORACLE', color: 0xB14FFF,
    agents: ['oracle'], isOracle: true
  }
};

// Map agent slug → room key
export const AGENT_ROOM = {};
Object.entries(ROOMS).forEach(([key, room]) => {
  (room.agents || []).forEach(slug => { AGENT_ROOM[slug] = key; });
});

/**
 * Build the visual platform for one room (a floating isometric slab).
 * Returns a Container positioned at room center.
 */
export function buildRoomPlatform(roomKey) {
  const room = ROOMS[roomKey];
  if (!room) return null;

  const c = new Container();
  c.eventMode = 'static';
  c.cursor = 'pointer';
  c.label = roomKey;

  // Top face: outline of all tiles in the slab (single diamond polygon)
  const top = new Graphics();
  // Compute corners in grid space then transform
  const corners = [
    [0, 0], [room.sx, 0], [room.sx, room.sy], [0, room.sy]
  ].map(([gx, gy]) => isoToScreen(gx, gy));
  top.poly(corners.flatMap(p => [p.x, p.y])).fill({ color: room.color, alpha: 0.18 });
  top.poly(corners.flatMap(p => [p.x, p.y])).stroke({ color: room.color, width: 2, alpha: 0.85 });
  c.addChild(top);

  // Inner grid lines
  const grid = new Graphics();
  for (let i = 1; i < room.sx; i++) {
    const a = isoToScreen(i, 0); const b = isoToScreen(i, room.sy);
    grid.moveTo(a.x, a.y).lineTo(b.x, b.y);
  }
  for (let j = 1; j < room.sy; j++) {
    const a = isoToScreen(0, j); const b = isoToScreen(room.sx, j);
    grid.moveTo(a.x, a.y).lineTo(b.x, b.y);
  }
  grid.stroke({ color: room.color, width: 1, alpha: 0.25 });
  c.addChild(grid);

  // Side / depth shadow (suggests floating slab)
  const shadow = new Graphics();
  const slabH = 8;
  shadow.poly([
    corners[3].x, corners[3].y,
    corners[2].x, corners[2].y,
    corners[2].x, corners[2].y + slabH,
    corners[3].x, corners[3].y + slabH
  ]).fill({ color: 0x000000, alpha: 0.45 });
  shadow.poly([
    corners[2].x, corners[2].y,
    corners[1].x, corners[1].y,
    corners[1].x, corners[1].y + slabH,
    corners[2].x, corners[2].y + slabH
  ]).fill({ color: 0x000000, alpha: 0.6 });
  c.addChildAt(shadow, 0); // behind top face

  // Label on the slab
  const labelStyle = new TextStyle({
    fontFamily: 'system-ui, monospace',
    fontSize: 11,
    fontWeight: '600',
    fill: room.color,
    letterSpacing: 2,
    align: 'center'
  });
  const label = new Text({ text: room.label, style: labelStyle });
  const center = isoToScreen(room.sx / 2, room.sy / 2);
  label.position.set(center.x - label.width / 2, center.y - 6);
  label.alpha = 0.85;
  c.addChild(label);

  // Position the whole platform at its room origin in world space
  const origin = isoToScreen(room.gx, room.gy);
  c.position.set(origin.x, origin.y);

  // For raycasting / click detection
  c.userData = { roomKey };
  return c;
}

/** Get a sub-position inside a room (cell grid coords → screen). */
export function inRoomScreenPos(roomKey, cellX, cellY) {
  const room = ROOMS[roomKey];
  const origin = isoToScreen(room.gx, room.gy);
  const local = isoToScreen(cellX, cellY);
  return { x: origin.x + local.x, y: origin.y + local.y };
}

/** Where each agent stands inside their room.
 *  - Single agent: centered, slightly toward the front (cellY = sy*0.55).
 *  - Multiple agents: distributed in 2D so they don't crowd a single row. */
export function agentScreenPos(slug) {
  const roomKey = AGENT_ROOM[slug];
  if (!roomKey) return { x: 0, y: 0 };
  const room = ROOMS[roomKey];
  const agents = room.agents || [];
  const idx = agents.indexOf(slug);
  const total = agents.length;

  if (total <= 1) {
    // Feet near the BOTTOM of the diamond so the body sits visually inside
    // the room (sprite is 56px tall, small rooms have ~96px diamond height
    // with feet-at-center the body extends above the diamond top edge).
    return inRoomScreenPos(roomKey, room.sx / 2, room.sy * 0.85);
  }

  // Distribute in a small grid: 2 columns when 3-4 agents, else single row.
  if (total <= 2) {
    const spread = Math.min(1.6, room.sx * 0.45);
    const cellX = room.sx / 2 + (idx === 0 ? -spread / 2 : spread / 2);
    const cellY = room.sy / 2;
    return inRoomScreenPos(roomKey, cellX, cellY);
  }

  // 3-4 agents: 2x2 layout with generous margin so they don't crowd
  const col = idx % 2;
  const row = Math.floor(idx / 2);
  const marginX = room.sx * 0.30;
  const marginY = room.sy * 0.30;
  const cellX = marginX + col * (room.sx - 2 * marginX);
  const cellY = marginY + row * (room.sy - 2 * marginY);
  return inRoomScreenPos(roomKey, cellX, cellY);
}
