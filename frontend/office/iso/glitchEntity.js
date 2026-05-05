// frontend/office/iso/glitchEntity.js
// Glitch is the wandering NPC. He moves between rooms every 30-60s and
// glitches/teleports during transitions. Sits next to whichever agent had
// the most recent activity.

import { Container, Graphics, Sprite, Texture, Assets, Rectangle } from 'pixi.js';
import { gsap } from 'gsap';
import { ROOMS, AGENT_ROOM, inRoomScreenPos } from './rooms';
import { isoToScreen } from './isoMath';
import { teleportSparkle } from './particles';

export class GlitchEntity {
  constructor() {
    this.container = new Container();
    this.container.eventMode = 'static';
    this.container.cursor = 'pointer';
    this._buildProcedural();
    this.currentRoom = 'hub_central';
    this.targetRoom = null;
    this._lerpT = 1; // 0..1 between current and target
    this.lastMoveAt = Date.now();
    this.nextMoveIn = 7000 + Math.random() * 8000;
    this.busyAgent = null;     // slug of agent he's "following"
    this._t = 0;
    this._teleportFlash = 0;   // 0..1 anim
    this._spritesLoaded = false;
  }

  async tryLoadSpritesheet() {
    try {
      const head = await fetch('/assets/sprites/glitch.png', { method: 'HEAD' });
      if (!head.ok) return false;
      const sheet = await Assets.load('/assets/sprites/glitch.png');
      const base = sheet?.source ? sheet : sheet?.texture || sheet;
      const w = base.width, h = base.height;
      // glitch.png (512x512) is a 5-pose cluster, NOT a clean grid. The naive
      // 2x2 split bleeds the center "teleport" puppy's head into our crop.
      // Tightly box the top-right "running" puppy: x≈275..495, y≈8..200.
      // Convert to ratios so it scales if PNG dimensions change.
      const fx = Math.round(w * (275 / 512));
      const fy = Math.round(h * (8   / 512));
      const fw = Math.round(w * ((495 - 275) / 512));
      const fh = Math.round(h * ((200 - 8)   / 512));
      this.poseTex = [
        new Texture({ source: base.source, frame: new Rectangle(fx, fy, fw, fh) })
      ];
      this.spriteImg = new Sprite(this.poseTex[0]);
      this.spriteImg.anchor.set(0.5, 1);
      // Slightly smaller than agents — wandering NPC
      const targetH = 42;
      const k = targetH / fh;
      this.spriteImg.scale.set(k);
      this.container.addChild(this.spriteImg);
      if (this.procedural) this.procedural.visible = false;
      this._spritesLoaded = true;
      return true;
    } catch (_) { return false; }
  }

  _buildProcedural() {
    // Tiny glitchy gremlin: small body + spiky head + green color scheme
    const c = new Graphics();
    c.ellipse(0, -2, 8, 3).fill({ color: 0x000000, alpha: 0.4 }); // shadow
    c.rect(-6, -16, 12, 12).fill(0x4ade80); // body
    c.poly([0, -28, -8, -16, 8, -16]).fill(0x4ade80); // hood/head
    c.rect(-4, -22, 2, 2).fill(0x000000);
    c.rect(2, -22, 2, 2).fill(0x000000);
    c.moveTo(-10, -18).lineTo(-6, -20).stroke({ color: 0x4ade80, width: 2 }); // glitch arm L
    c.moveTo(10, -18).lineTo(6, -20).stroke({ color: 0x4ade80, width: 2 });   // glitch arm R
    this.procedural = c;
    this.container.addChild(c);
  }

  /** Walk smoothly to target room. Speed ~2px/frame at 60fps = ~120px/s.
   *  Vertical bob during walk simulates running. */
  goTo(roomKey) {
    if (!ROOMS[roomKey] || roomKey === this.currentRoom || this._walking) return;
    this._walking = true;
    this.lastMoveAt = Date.now();
    this.nextMoveIn = 7000 + Math.random() * 8000;

    const toRoom = ROOMS[roomKey];
    const target = isoToScreen(toRoom.gx + toRoom.sx / 2, toRoom.gy + toRoom.sy / 2);
    const dst = { x: target.x + 28, y: target.y + 12 };
    const dist = Math.hypot(dst.x - this.container.x, dst.y - this.container.y);
    const speedPxPerSec = 120;
    const dur = Math.max(0.5, dist / speedPxPerSec);

    // Run bob via scale.y (not y position, so it doesn't fight movement)
    const bob = gsap.to(this.container.scale, {
      y: 1.08, x: 0.94,
      duration: 0.18,
      ease: 'sine.inOut',
      yoyo: true,
      repeat: -1
    });

    // Move smoothly to target room
    gsap.to(this.container, {
      x: dst.x,
      y: dst.y,
      duration: dur,
      ease: 'sine.inOut',
      onComplete: () => {
        bob.kill();
        this.container.scale.set(1);
        this.currentRoom = roomKey;
        this._walking = false;
      }
    });
  }

  /** Walk along a fixed patrol route, biased toward whichever agent is busy. */
  followBusyAgent(busyAgents = []) {
    // If a specific agent is busy, prefer them
    if (busyAgents.length > 0) {
      const target = busyAgents[Math.floor(Math.random() * busyAgents.length)];
      this.busyAgent = target;
      const roomKey = AGENT_ROOM[target];
      if (roomKey && roomKey !== this.currentRoom) { this.goTo(roomKey); return; }
    }
    // Otherwise patrol: Hub Central -> Content -> Finance -> Creative Studio -> repeat
    const route = ['hub_central', 'content_room', 'finance_office', 'creative_studio'];
    const idx = route.indexOf(this.currentRoom);
    const next = route[(idx + 1) % route.length];
    this.busyAgent = null;
    if (next !== this.currentRoom) this.goTo(next);
  }

  update(dt, busyAgents) {
    this._t += dt;

    // Move every 30-60s
    if (Date.now() - this.lastMoveAt > this.nextMoveIn && this._lerpT >= 1) {
      this.followBusyAgent(busyAgents);
    }

    // Position lerp toward target
    if (this.targetRoom && this._lerpT < 1) {
      this._lerpT = Math.min(1, this._lerpT + dt * 0.02);
      const fromRoom = ROOMS[this.currentRoom];
      const toRoom = ROOMS[this.targetRoom];
      const fromCenter = isoToScreen(fromRoom.gx + fromRoom.sx / 2, fromRoom.gy + fromRoom.sy / 2);
      const toCenter   = isoToScreen(toRoom.gx + toRoom.sx / 2, toRoom.gy + toRoom.sy / 2);
      const ease = this._lerpT < 0.5 ? 2 * this._lerpT * this._lerpT : 1 - Math.pow(-2 * this._lerpT + 2, 2) / 2;
      this.container.x = fromCenter.x + (toCenter.x - fromCenter.x) * ease + this._baseOffsetX;
      this.container.y = fromCenter.y + (toCenter.y - fromCenter.y) * ease + this._baseOffsetY;
      if (this._lerpT >= 1) {
        this.currentRoom = this.targetRoom;
        this.targetRoom = null;
      }
    }

    // Teleport visuals are now GSAP-driven — no per-frame jitter here.

    // Idle micro-bobbing
    if (this.procedural?.visible) this.procedural.position.y = Math.sin(this._t * 0.12) * 0.6;
  }

  setBasePosition(x, y) {
    // Sit slightly off-center so we don't overlap whichever agent owns this room.
    this._baseOffsetX = 28; this._baseOffsetY = 12;
    const room = ROOMS[this.currentRoom];
    const c = isoToScreen(room.gx + room.sx / 2, room.gy + room.sy / 2);
    this.container.x = c.x + this._baseOffsetX;
    this.container.y = c.y + this._baseOffsetY;
  }
}
