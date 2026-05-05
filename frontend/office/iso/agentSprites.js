// frontend/office/iso/agentSprites.js
// Loads /assets/sprites/<slug>.png as a 2x2 sprite sheet (4 poses).
// Falls back to a procedural pixel-art character built from the agent preset.

import { Assets, Texture, Rectangle, Container, Sprite, Graphics, Ticker } from 'pixi.js';

export const POSE = { IDLE: 0, WORKING: 1, HAPPY: 2, THINKING: 3 };
const POSE_COORDS = [ [0, 0], [1, 0], [0, 1], [1, 1] ]; // [col, row]

const SPRITE_PATH = '/assets/sprites/';

// Per-slug crop tuning for spritesheets where pose figures bleed into
// adjacent cells. Use cellH < baseCellH to clip the bottom of the IDLE crop
// so the next-row pose's head doesn't leak in.
const SPRITE_CROP = {
  diego: { cellH: 200 } // his THINKING pose head sits at top of bottom row
};

const cache = new Map(); // slug → Promise<{textures: Texture[], hasReal: boolean}>

/**
 * Load all 4 pose textures for an agent. Returns array of Texture (one per pose).
 * Falls back to procedural sprite if the PNG isn't present.
 */
export async function loadAgentSpritesheet(slug, preset) {
  if (cache.has(slug)) return cache.get(slug);
  const promise = (async () => {
    try {
      const url = `${SPRITE_PATH}${slug}.png`;
      // Probe with HEAD to avoid noisy console errors when sprite missing
      const head = await fetch(url, { method: 'HEAD' });
      if (!head.ok) {
        console.warn(`[sprites] ${slug} HEAD failed:`, head.status);
        throw new Error('not_found');
      }

      // Sprites are pre-processed (transparent bg) by scripts/strip-sprite-bg.js
      const baseTex = await Assets.load(url);
      console.log(`[sprites] ${slug} loaded ${baseTex.width}x${baseTex.height}`);
      const w = baseTex.width;
      const h = baseTex.height;
      const baseCellW = Math.floor(w / 2);
      const baseCellH = Math.floor(h / 2);

      // Per-slug crop overrides — for spritesheets where individual poses
      // bleed into adjacent quadrants (e.g. Diego's THINKING pose head leaks
      // into the IDLE cell). Defaults to full quadrant.
      const cropH = SPRITE_CROP[slug]?.cellH ?? baseCellH;
      const cropW = SPRITE_CROP[slug]?.cellW ?? baseCellW;
      const innerYBias = SPRITE_CROP[slug]?.innerY ?? 0; // shift the crop window down inside the cell

      const textures = POSE_COORDS.map(([c, r]) => {
        const tex = new Texture({
          source: baseTex.source,
          frame: new Rectangle(
            c * baseCellW + Math.floor((baseCellW - cropW) / 2),
            r * baseCellH + innerYBias,
            cropW,
            cropH
          )
        });
        return tex;
      });
      return { textures, hasReal: true, cellW: cropW, cellH: cropH };
    } catch (e) {
      console.warn(`[sprites] ${slug} → procedural fallback:`, e?.message || e);
      return { textures: buildProceduralPoses(preset), hasReal: false, cellW: 64, cellH: 96 };
    }
  })();
  cache.set(slug, promise);
  return promise;
}

/**
 * Build 4 textures procedurally from the preset color palette. Each pose is a
 * tiny pixel-art character: shoes, body, head, hair, optional accessory.
 */
function buildProceduralPoses(preset) {
  // We use Graphics → render to a Texture via the renderer-less path: just
  // return Graphics-backed Sprites via PIXI v8's render-to-texture is heavy;
  // instead each pose is just a Container we re-shape. To keep it simple here,
  // we return null markers and let the consumer build a Container of Graphics
  // for the procedural case. Convention: empty array → procedural mode.
  return null; // signal: use proceduralCharacter() in consumer
}

/**
 * Build a procedural character Container with 4 child layers that are toggled
 * for each pose. Returns { container, setPose(poseId) }.
 */
export function proceduralCharacter(preset) {
  const root = new Container();
  root.sortableChildren = true;

  // Shadow
  const shadow = new Graphics();
  shadow.ellipse(0, 0, 18, 6).fill({ color: 0x000000, alpha: 0.35 });
  shadow.position.set(0, 4);
  root.addChild(shadow);

  // Pants/legs
  const legs = new Graphics();
  legs.rect(-9, -16, 18, 16).fill(parseHex(preset.pantsColor || '#2D3F55'));
  legs.position.set(0, 0);
  root.addChild(legs);

  // Body / shirt
  const body = new Graphics();
  body.rect(-12, -38, 24, 24).fill(parseHex(preset.shirtColor || preset.color || '#3498DB'));
  root.addChild(body);

  // Head
  const head = new Graphics();
  head.circle(0, -50, 11).fill(parseHex(preset.skinTone || '#E8B894'));
  root.addChild(head);

  // Hair
  const hair = new Graphics();
  const hairCol = parseHex(preset.hairColor || '#3D2817');
  if (preset.hairStyle === 'long') {
    hair.rect(-12, -57, 24, 8).fill(hairCol);
    hair.rect(-13, -52, 4, 14).fill(hairCol);
    hair.rect(9, -52, 4, 14).fill(hairCol);
  } else if (preset.hairStyle === 'bun') {
    hair.rect(-11, -57, 22, 6).fill(hairCol);
    hair.circle(0, -62, 5).fill(hairCol);
  } else if (preset.hairStyle === 'curly') {
    hair.circle(0, -56, 12).fill(hairCol);
  } else if (preset.hairStyle === 'beard') {
    hair.rect(-11, -57, 22, 6).fill(hairCol);
    hair.rect(-7, -45, 14, 5).fill(hairCol);
  } else if (preset.hairStyle === 'bald') {
    // nothing
  } else {
    hair.rect(-11, -57, 22, 6).fill(hairCol);
  }
  root.addChild(hair);

  // Eyes
  const eyes = new Graphics();
  eyes.rect(-5, -52, 2, 2).fill(0x101a30);
  eyes.rect(3, -52, 2, 2).fill(0x101a30);
  root.addChild(eyes);

  // Glasses (Lucas, Roberto)
  if (preset.glasses) {
    const glasses = new Graphics();
    glasses.rect(-6, -53, 5, 4).stroke({ color: 0x101a30, width: 1 });
    glasses.rect(1, -53, 5, 4).stroke({ color: 0x101a30, width: 1 });
    root.addChild(glasses);
  }

  // Tie (Diana, Roberto)
  if (preset.accessory === 'tie') {
    const tie = new Graphics();
    tie.poly([0, -36, -3, -34, 0, -22, 3, -34]).fill(parseHex(preset.tieColor || '#101a30'));
    root.addChild(tie);
  }

  // Headphones (Alex, Max)
  if (preset.accessory === 'headphones') {
    const hp = new Graphics();
    hp.arc(0, -56, 12, Math.PI, 0).stroke({ color: 0x101a30, width: 2 });
    hp.rect(-13, -52, 3, 5).fill(0x101a30);
    hp.rect(10, -52, 3, 5).fill(0x101a30);
    root.addChild(hp);
  }

  // Apron (Carlos)
  if (preset.accessory === 'apron') {
    const ap = new Graphics();
    ap.rect(-10, -36, 20, 18).fill(0x5D3A1F);
    root.addChild(ap);
  }

  // Pose state. We mutate scale / rotation per pose for variation.
  const setPose = (poseId) => {
    switch (poseId) {
      case POSE.IDLE:
        root.skew.x = 0;
        body.rotation = 0;
        break;
      case POSE.WORKING:
        // Slight forward lean
        root.skew.x = 0;
        body.position.y = 1;
        head.position.y = 1;
        break;
      case POSE.HAPPY:
        root.skew.x = 0;
        // small jump baseline (animator handles bouncing)
        break;
      case POSE.THINKING:
        head.position.x = 1;
        head.position.y = -1;
        break;
    }
  };

  return { container: root, setPose, isProcedural: true };
}

function parseHex(s) {
  if (!s) return 0xffffff;
  const c = String(s).replace('#', '');
  return parseInt(c, 16);
}

/** Animate breathing on a sprite/container. Returns a stop function.
 *  Pixi v8: ticker callback receives the Ticker instance, not a delta number.
 *  Use ticker.deltaTime (in frames) instead. */
export function animateBreathing(target, ticker) {
  let t = Math.random() * Math.PI * 2;
  const baseY = target.scale.y;
  const fn = (tk) => {
    const dt = (tk && typeof tk.deltaTime === 'number') ? tk.deltaTime : 1;
    t += dt * 0.04;
    target.scale.y = baseY + Math.sin(t) * 0.015;
  };
  ticker.add(fn);
  return () => ticker.remove(fn);
}

/** Bounce-jump animation for HAPPY pose. */
export function animateJump(target, ticker, durationMs = 600) {
  const baseY = target.position.y;
  let t = 0;
  const fn = (tk) => {
    const dt = (tk && typeof tk.deltaMS === 'number') ? tk.deltaMS : 16.67;
    t += dt;
    if (t >= durationMs) {
      target.position.y = baseY;
      ticker.remove(fn);
      return;
    }
    const p = t / durationMs;
    const off = -16 * Math.sin(p * Math.PI);
    target.position.y = baseY + off;
  };
  ticker.add(fn);
}
