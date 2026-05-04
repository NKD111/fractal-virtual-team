// frontend/office/iso/isoMath.js
// Isometric helpers — 2:1 ratio (tile width 64, height 32 by default).

export const TILE_W = 64;
export const TILE_H = 32;

/** Grid (gx, gy) → screen (sx, sy). Origin at center of grid (0,0). */
export function isoToScreen(gx, gy) {
  return {
    x: (gx - gy) * (TILE_W / 2),
    y: (gx + gy) * (TILE_H / 2)
  };
}

/** Screen → grid (inverse). */
export function screenToIso(sx, sy) {
  return {
    x: (sx / (TILE_W / 2) + sy / (TILE_H / 2)) / 2,
    y: (sy / (TILE_H / 2) - sx / (TILE_W / 2)) / 2
  };
}

/** Z-order key for sprite stacking (higher = drawn on top). */
export function zOrder(gx, gy) { return (gx + gy) * 1000; }
