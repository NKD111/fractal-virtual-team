// frontend/office/iso/atlasEntity.js
// ATLAS — technical engineer, floats bottom-right of the office. NOT a humanoid.
// Sprite layout: 2x2 (idle | diagnosing / repairing | alert).

import { Container, Graphics, Sprite, Texture, Assets, Rectangle, Text, TextStyle } from 'pixi.js';

export const ATLAS_STATE = {
  IDLE: 'idle',
  DIAGNOSING: 'diagnosing',
  REPAIRING: 'repairing',
  ALERT: 'alert'
};

// 2x2 grid: top-left idle, top-right diagnosing, bottom-left repairing, bottom-right alert
const STATE_COORDS = {
  [ATLAS_STATE.IDLE]:       [0, 0],
  [ATLAS_STATE.DIAGNOSING]: [1, 0],
  [ATLAS_STATE.REPAIRING]:  [0, 1],
  [ATLAS_STATE.ALERT]:      [1, 1]
};

export class AtlasEntity {
  constructor() {
    this.container = new Container();
    this.container.eventMode = 'static';
    this.container.cursor = 'pointer';
    this.state = ATLAS_STATE.IDLE;
    this._t = Math.random() * Math.PI * 2;
    this._baseY = 0;

    const labelStyle = new TextStyle({
      fontFamily: 'system-ui, monospace', fontSize: 11, fontWeight: '600',
      fill: 0xf97316, stroke: { color: 0x0a0a14, width: 3 }, letterSpacing: 1
    });
    this.label = new Text({ text: 'ATLAS', style: labelStyle });
    this.label.anchor.set(0.5, 1);
    this.label.alpha = 0;
    this.container.addChild(this.label);

    this._buildProcedural();
  }

  async tryLoadSpritesheet() {
    try {
      const head = await fetch('/assets/sprites/atlas.png', { method: 'HEAD' });
      if (!head.ok) return false;
      const sheet = await Assets.load('/assets/sprites/atlas.png');
      const base = sheet?.source ? sheet : sheet?.texture || sheet;
      const w = base.width, h = base.height;
      // PNG includes a top title bar ("ATLAS - Technical Engineer") and per-cell
      // bottom labels ("1.IDLE" etc). Skip top 14% and crop bottom 18% of each cell.
      const topMargin = Math.floor(h * 0.14);
      const usableH = h - topMargin;
      const cellOuterW = Math.floor(w / 2);
      const cellOuterH = Math.floor(usableH / 2);
      const cw = cellOuterW;
      const ch = Math.floor(cellOuterH * 0.82); // drop label area

      this.stateTextures = {};
      Object.entries(STATE_COORDS).forEach(([state, [c, r]]) => {
        this.stateTextures[state] = new Texture({
          source: base.source,
          frame: new Rectangle(c * cellOuterW, topMargin + r * cellOuterH, cw, ch)
        });
      });
      this.spriteImg = new Sprite(this.stateTextures[ATLAS_STATE.IDLE]);
      this.spriteImg.anchor.set(0.5, 1); // anchor at feet, like agents
      const targetH = 72;
      this.spriteImg.scale.set(targetH / ch);
      this.container.addChildAt(this.spriteImg, 0);
      if (this.proceduralBox) this.proceduralBox.visible = false;
      this.label.position.set(0, -targetH - 8);
      return true;
    } catch (_) { return false; }
  }

  _buildProcedural() {
    const g = new Graphics();
    g.roundRect(-50, -60, 100, 120, 12).fill({ color: 0x431407, alpha: 0.85 });
    g.roundRect(-50, -60, 100, 120, 12).stroke({ color: 0xf97316, width: 2 });
    const t = new Text({ text: 'ATLAS', style: new TextStyle({
      fontFamily: 'system-ui, monospace', fontSize: 14, fontWeight: '700',
      fill: 0xf97316, letterSpacing: 2
    })});
    t.anchor.set(0.5);
    g.addChild(t);
    this.proceduralBox = g;
    this.container.addChildAt(g, 0);
  }

  setState(state) {
    if (!Object.values(ATLAS_STATE).includes(state)) return;
    this.state = state;
    if (this.spriteImg && this.stateTextures?.[state]) {
      this.spriteImg.texture = this.stateTextures[state];
    }
    if (state !== ATLAS_STATE.IDLE) {
      clearTimeout(this._revertTimer);
      const ms = state === ATLAS_STATE.ALERT ? 4000 : 2500;
      this._revertTimer = setTimeout(() => { if (this.state === state) this.setState(ATLAS_STATE.IDLE); }, ms);
    }
  }

  setHoverLabel(visible) { this.label.alpha = visible ? 1 : 0; }

  update(dt) {
    // No float — ATLAS is a machine, stays anchored
    this._t += dt * 0.04;
    this.container.y = this._baseY;
  }

  setBasePosition(x, y) {
    this._baseY = y;
    this.container.x = x;
    this.container.y = y;
  }
}
