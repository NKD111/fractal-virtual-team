// frontend/office/iso/nexusEntity.js
// NEXUS — strategic guardian, floats top-right of the office. NOT a humanoid.
// Sprite layout: 1x4 horizontal (idle | active | alert | reporting).

import { Container, Graphics, Sprite, Texture, Assets, Rectangle, Text, TextStyle } from 'pixi.js';

export const NEXUS_STATE = {
  IDLE: 'idle',
  ACTIVE: 'active',
  ALERT: 'alert',
  REPORTING: 'reporting'
};

const STATE_TO_INDEX = {
  [NEXUS_STATE.IDLE]:      0,
  [NEXUS_STATE.ACTIVE]:    1,
  [NEXUS_STATE.ALERT]:     2,
  [NEXUS_STATE.REPORTING]: 3
};

export class NexusEntity {
  constructor() {
    this.container = new Container();
    this.container.eventMode = 'static';
    this.container.cursor = 'pointer';
    this.state = NEXUS_STATE.IDLE;
    this._t = Math.random() * Math.PI * 2;
    this._baseY = 0;

    // Hover label
    const labelStyle = new TextStyle({
      fontFamily: 'system-ui, monospace', fontSize: 11, fontWeight: '600',
      fill: 0x3b82f6, stroke: { color: 0x0a0a14, width: 3 }, letterSpacing: 1
    });
    this.label = new Text({ text: 'NEXUS', style: labelStyle });
    this.label.anchor.set(0.5, 1);
    this.label.alpha = 0;
    this.container.addChild(this.label);

    this._buildProcedural();
  }

  async tryLoadSpritesheet() {
    try {
      const head = await fetch('/assets/sprites/nexus.png', { method: 'HEAD' });
      if (!head.ok) return false;
      const sheet = await Assets.load('/assets/sprites/nexus.png');
      const base = sheet?.source ? sheet : sheet?.texture || sheet;
      const w = base.width, h = base.height;
      // PNG (512x512) is 1x4 horizontal. Each monitor occupies the centered
      // vertical band y=60..380 (320px tall). Crop tightly around it.
      const cw = Math.floor(w / 4);
      const fy = Math.round(h * (60 / 512));
      const ch = Math.round(h * ((380 - 60) / 512));

      this.stateTextures = {
        [NEXUS_STATE.IDLE]:      new Texture({ source: base.source, frame: new Rectangle(0,    fy, cw, ch) }),
        [NEXUS_STATE.ACTIVE]:    new Texture({ source: base.source, frame: new Rectangle(cw,   fy, cw, ch) }),
        [NEXUS_STATE.ALERT]:     new Texture({ source: base.source, frame: new Rectangle(cw*2, fy, cw, ch) }),
        [NEXUS_STATE.REPORTING]: new Texture({ source: base.source, frame: new Rectangle(cw*3, fy, cw, ch) })
      };
      this.spriteImg = new Sprite(this.stateTextures[NEXUS_STATE.IDLE]);
      this.spriteImg.anchor.set(0.5, 1); // anchor at feet, like agents
      // Sized like Oracle (~72px), it's a small floating monitor
      const targetH = 72;
      this.spriteImg.scale.set(targetH / ch);
      this.container.addChildAt(this.spriteImg, 0);
      if (this.proceduralBox) this.proceduralBox.visible = false;
      this.label.position.set(0, -targetH - 8);
      return true;
    } catch (_) { return false; }
  }

  _buildProcedural() {
    // Stylized blue rectangle with "N" label until sprite loads
    const g = new Graphics();
    g.roundRect(-50, -60, 100, 120, 12).fill({ color: 0x1e3a8a, alpha: 0.85 });
    g.roundRect(-50, -60, 100, 120, 12).stroke({ color: 0x3b82f6, width: 2 });
    const t = new Text({ text: 'NEXUS', style: new TextStyle({
      fontFamily: 'system-ui, monospace', fontSize: 14, fontWeight: '700',
      fill: 0x3b82f6, letterSpacing: 2
    })});
    t.anchor.set(0.5);
    t.position.set(0, 0);
    g.addChild(t);
    this.proceduralBox = g;
    this.container.addChildAt(g, 0);
  }

  setState(state) {
    if (!Object.values(NEXUS_STATE).includes(state)) return;
    this.state = state;
    if (this.spriteImg && this.stateTextures?.[state]) {
      this.spriteImg.texture = this.stateTextures[state];
    }
    // Auto-revert non-idle states after a beat (so the entity doesn't stick on alert forever)
    if (state !== NEXUS_STATE.IDLE) {
      clearTimeout(this._revertTimer);
      const ms = state === NEXUS_STATE.ALERT ? 4000 : 2500;
      this._revertTimer = setTimeout(() => { if (this.state === state) this.setState(NEXUS_STATE.IDLE); }, ms);
    }
  }

  setHoverLabel(visible) {
    this.label.alpha = visible ? 1 : 0;
  }

  update(dt) {
    this._t += dt * 0.04;
    this.container.y = this._baseY + Math.sin(this._t) * 3;
  }

  setBasePosition(x, y) {
    this._baseY = y;
    this.container.x = x;
    this.container.y = y;
  }
}
