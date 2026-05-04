// frontend/office/iso/oracleEntity.js
// ORACLE in the center of the office — animated, with state machine.

import { Container, Graphics, Sprite, Texture, Assets, Rectangle } from 'pixi.js';

export const ORACLE_STATE = {
  IDLE: 'idle',
  THINKING: 'thinking',
  BROADCASTING: 'broadcasting',
  GLOW: 'glow'
};

export class OracleEntity {
  constructor() {
    this.container = new Container();
    this.container.eventMode = 'static';
    this.container.cursor = 'pointer';
    this.state = ORACLE_STATE.IDLE;
    this._t = 0;

    // Outer glow ring
    this.glow = new Graphics();
    this.container.addChild(this.glow);

    // Sprite or procedural core
    this.coreSprite = null;
    this.proceduralCore = null;
    this._buildProcedural();

    // Active beams (light lines to consultant agents)
    this.beams = [];
  }

  async tryLoadSpritesheet() {
    try {
      const head = await fetch('/assets/sprites/oracle.png', { method: 'HEAD' });
      if (!head.ok) return false;
      const sheet = await Assets.load('/assets/sprites/oracle.png');
      const base = sheet?.source ? sheet : sheet?.texture || sheet;
      const w = base.width, h = base.height;
      const cw = Math.floor(w / 2), ch = Math.floor(h / 2);
      // 4 states: idle, thinking, broadcasting, glow
      this.stateTextures = {
        [ORACLE_STATE.IDLE]:         new Texture({ source: base.source, frame: new Rectangle(0, 0, cw, ch) }),
        [ORACLE_STATE.THINKING]:     new Texture({ source: base.source, frame: new Rectangle(cw, 0, cw, ch) }),
        [ORACLE_STATE.BROADCASTING]: new Texture({ source: base.source, frame: new Rectangle(0, ch, cw, ch) }),
        [ORACLE_STATE.GLOW]:         new Texture({ source: base.source, frame: new Rectangle(cw, ch, cw, ch) })
      };
      this.coreSprite = new Sprite(this.stateTextures[ORACLE_STATE.IDLE]);
      this.coreSprite.anchor.set(0.5, 0.5);
      this.container.addChild(this.coreSprite);
      // Hide procedural core
      if (this.proceduralCore) this.proceduralCore.visible = false;
      return true;
    } catch (_) {
      return false;
    }
  }

  _buildProcedural() {
    const c = new Graphics();
    // Hexagonal "crystal"
    const pts = [];
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI / 3) * i - Math.PI / 2;
      pts.push(Math.cos(a) * 16, Math.sin(a) * 16);
    }
    c.poly(pts).fill(0xB14FFF);
    c.poly(pts).stroke({ color: 0xFFFFFF, width: 1.5, alpha: 0.8 });
    // Inner highlight
    c.circle(0, -4, 5).fill({ color: 0xFFFFFF, alpha: 0.4 });
    this.proceduralCore = c;
    this.container.addChild(c);
  }

  setState(state) {
    this.state = state;
    if (this.coreSprite && this.stateTextures?.[state]) {
      this.coreSprite.texture = this.stateTextures[state];
    }
  }

  /** Draw a dashed light-line from Oracle to a target screen position for ~1.5s */
  beamTo(targetX, targetY) {
    const beam = new Graphics();
    this.container.parent?.addChildAt(beam, 0); // draw under sprites
    const beamData = {
      g: beam, target: { x: targetX, y: targetY },
      origin: { x: this.container.x, y: this.container.y },
      life: 0, maxLife: 1500, dashOffset: 0
    };
    this.beams.push(beamData);
    this.setState(ORACLE_STATE.BROADCASTING);
    // Auto-revert state after 1.5s if no other state
    setTimeout(() => { if (this.state === ORACLE_STATE.BROADCASTING) this.setState(ORACLE_STATE.IDLE); }, 1600);
  }

  update(dt) {
    this._t += dt;

    // Pulsing glow ring
    this.glow.clear();
    const r = 22 + Math.sin(this._t * 0.05) * 4;
    const a = 0.15 + Math.sin(this._t * 0.05) * 0.08;
    this.glow.circle(0, 0, r).stroke({ color: 0xB14FFF, width: 3, alpha: a });
    this.glow.circle(0, 0, r * 1.4).stroke({ color: 0xB14FFF, width: 1.5, alpha: a * 0.6 });

    // Float
    this.container.y = this._baseY + Math.sin(this._t * 0.04) * 3;

    // Procedural core spin
    if (this.proceduralCore?.visible) {
      this.proceduralCore.rotation = this._t * 0.01;
    }

    // Animate beams
    for (let i = this.beams.length - 1; i >= 0; i--) {
      const b = this.beams[i];
      b.life += dt * 16.67;
      b.dashOffset = (b.dashOffset + dt * 0.5) % 12;
      b.g.clear();
      const fade = Math.max(0, 1 - b.life / b.maxLife);
      const dx = b.target.x - b.origin.x;
      const dy = b.target.y - b.origin.y;
      const dist = Math.hypot(dx, dy);
      const steps = Math.floor(dist / 12);
      for (let s = 0; s < steps; s++) {
        const startT = (s + b.dashOffset / 12) / steps;
        const endT = (s + 0.5 + b.dashOffset / 12) / steps;
        if (endT > 1) continue;
        const x1 = b.origin.x + dx * startT;
        const y1 = b.origin.y + dy * startT;
        const x2 = b.origin.x + dx * endT;
        const y2 = b.origin.y + dy * endT;
        b.g.moveTo(x1, y1).lineTo(x2, y2).stroke({ color: 0xB14FFF, width: 2, alpha: fade * 0.8 });
      }
      if (b.life >= b.maxLife) {
        b.g.clear();
        b.g.parent?.removeChild(b.g);
        this.beams.splice(i, 1);
      }
    }
  }

  setBaseY(y) { this._baseY = y; this.container.y = y; }
}
