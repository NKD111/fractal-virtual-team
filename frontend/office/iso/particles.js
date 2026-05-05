// frontend/office/iso/particles.js
// Lightweight particle bursts using PIXI Graphics + GSAP.
// Object-pooled per call (low burst counts), no shared pool needed yet.

import { Container, Graphics } from 'pixi.js';
import { gsap } from 'gsap';

/**
 * Burst N small pixel sprites outward from (x, y) within `parent`.
 * Each particle is a small filled rect, given a random hue from `palette`.
 * Particles fade + drift then auto-remove from parent.
 */
export function burst(parent, x, y, opts = {}) {
  const {
    count = 18,
    palette = [0xff6b9d, 0xffce5c, 0x3498db, 0x9b59b6, 0x27ae60, 0xff6b35],
    spread = 70,
    duration = 1.4,
    size = 4,
    gravity = 0.4
  } = opts;

  for (let i = 0; i < count; i++) {
    const p = new Graphics();
    const color = palette[Math.floor(Math.random() * palette.length)];
    p.rect(-size / 2, -size / 2, size, size).fill(color);
    p.x = x;
    p.y = y;
    p.alpha = 1;
    parent.addChild(p);

    const angle = Math.random() * Math.PI * 2;
    const dist = spread * (0.4 + Math.random() * 0.6);
    const dx = Math.cos(angle) * dist;
    const dy = Math.sin(angle) * dist - spread * 0.3; // initial upward bias
    const dur = duration * (0.7 + Math.random() * 0.5);

    gsap.to(p, {
      x: x + dx,
      y: y + dy + gravity * spread,
      alpha: 0,
      rotation: (Math.random() - 0.5) * 4,
      duration: dur,
      ease: 'power2.out',
      onComplete: () => p.destroy()
    });
  }
}

/**
 * Golden pixel sparkle for Glitch teleport — 5–8 small gold dots
 * that drift outward + fade. Smaller, warmer than `burst`.
 */
export function teleportSparkle(parent, x, y) {
  const count = 6 + Math.floor(Math.random() * 3);
  const palette = [0xfde68a, 0xf59e0b, 0xfbbf24, 0xffffff];
  for (let i = 0; i < count; i++) {
    const p = new Graphics();
    const color = palette[i % palette.length];
    const s = 2 + Math.floor(Math.random() * 2);
    p.rect(-s / 2, -s / 2, s, s).fill(color);
    p.x = x + (Math.random() - 0.5) * 8;
    p.y = y + (Math.random() - 0.5) * 8;
    p.alpha = 1;
    parent.addChild(p);
    const ang = Math.random() * Math.PI * 2;
    const dist = 20 + Math.random() * 22;
    gsap.to(p, {
      x: p.x + Math.cos(ang) * dist,
      y: p.y + Math.sin(ang) * dist,
      alpha: 0,
      duration: 0.6 + Math.random() * 0.3,
      ease: 'power1.out',
      onComplete: () => p.destroy()
    });
  }
}

/**
 * Animated dashed line from (x1, y1) to (x2, y2) of given color.
 * Builds in `buildMs`, persists `holdMs`, then fades in `fadeMs`.
 * Use for Oracle ↔ agent consultation visualization.
 */
export function dashedLine(parent, x1, y1, x2, y2, opts = {}) {
  const {
    color = 0xb14fff,
    width = 2,
    dashLen = 6,
    gapLen = 4,
    buildMs = 500,
    holdMs = 1000,
    fadeMs = 300
  } = opts;

  const line = new Graphics();
  const total = Math.hypot(x2 - x1, y2 - y1);
  const segCount = Math.floor(total / (dashLen + gapLen));
  const ang = Math.atan2(y2 - y1, x2 - x1);
  const cos = Math.cos(ang), sin = Math.sin(ang);

  // progressive draw via a "progress" property animated with GSAP
  const state = { p: 0, alpha: 1 };
  parent.addChild(line);
  line.x = 0; line.y = 0;

  const redraw = () => {
    line.clear();
    const drawn = state.p * segCount;
    for (let i = 0; i < drawn; i++) {
      const segStart = i * (dashLen + gapLen);
      const segEnd = segStart + dashLen;
      line
        .moveTo(x1 + cos * segStart, y1 + sin * segStart)
        .lineTo(x1 + cos * segEnd,   y1 + sin * segEnd)
        .stroke({ color, width, alpha: state.alpha });
    }
  };

  gsap.to(state, {
    p: 1,
    duration: buildMs / 1000,
    ease: 'power2.out',
    onUpdate: redraw,
    onComplete: () => {
      gsap.to(state, {
        alpha: 0,
        delay: holdMs / 1000,
        duration: fadeMs / 1000,
        onUpdate: redraw,
        onComplete: () => line.destroy()
      });
    }
  });
}
