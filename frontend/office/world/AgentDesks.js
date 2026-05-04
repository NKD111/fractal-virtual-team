// frontend/office/world/AgentDesks.js
// Each agent has a workspace: desk + chair + monitor/laptop + a personal touch.
// Spawns furniture and positions the humanoid behind/at the desk facing forward.

import * as THREE from 'three';
import { getAssetLoader } from './AssetLoader';

// Layout: each workspace is a logical zone with (x, z) center on the floor.
// `facing` is where the humanoid should look (in radians).
// `extras` are additional decorative items per agent's personality.
export const WORKSPACES = {
  mariana: {
    x: 0,    z: 0,    facing: 0,
    deskType: 'desk', chair: 'chair_office', screen: 'laptop',
    extras: ['plant_small'], extrasOffset: [{ x: 0.6, z: 0 }],
    label: 'Hub Central'
  },
  diana: {
    x: 6,    z: -3,   facing: -Math.PI/2,
    deskType: 'desk', chair: 'chair_modern', screen: 'monitor',
    extras: ['plant_tall'], extrasOffset: [{ x: 0.8, z: 0.3 }],
    label: 'Client Relations'
  },
  carlos: {
    x: -6,   z: 3,    facing: Math.PI/2,
    deskType: 'desk', chair: 'chair_modern', screen: 'monitor',
    extras: ['lamp_desk'], extrasOffset: [{ x: -0.5, z: 0 }],
    label: 'Design Studio L'
  },
  diego: {
    x: -6,   z: -3,   facing: Math.PI/2,
    deskType: 'desk', chair: 'chair_office', screen: 'monitor',
    extras: ['bookshelf'], extrasOffset: [{ x: -1.2, z: 0.5 }],
    label: 'Design Studio R'
  },
  alex: {
    x: -3,   z: 6,    facing: -Math.PI,
    deskType: 'desk', chair: 'chair_modern', screen: 'laptop',
    extras: ['plant_small'], extrasOffset: [{ x: 0.5, z: -0.4 }],
    label: 'Content'
  },
  max: {
    x: 3,    z: 6,    facing: -Math.PI,
    deskType: 'desk', chair: 'chair_office', screen: 'monitor',
    extras: ['lamp_desk'], extrasOffset: [{ x: 0.6, z: -0.2 }],
    label: 'Video Bay'
  },
  valentina: {
    x: 0,    z: -6,   facing: 0,
    deskType: 'desk', chair: 'chair_modern', screen: 'laptop',
    extras: ['plant_tall', 'lamp_floor'], extrasOffset: [{ x: 1.0, z: -0.3 }, { x: -1.0, z: -0.3 }],
    label: 'Art Direction'
  },
  sofia: {
    x: 6,    z: 3,    facing: -Math.PI/2,
    deskType: 'desk', chair: 'chair_office', screen: 'laptop',
    extras: ['plant_small'], extrasOffset: [{ x: 0.5, z: -0.3 }],
    label: 'PM Desk'
  },
  lucas: {
    x: 9,    z: 0,    facing: -Math.PI/2,
    deskType: 'desk', chair: 'chair_modern', screen: 'monitor',
    extras: ['bookshelf'], extrasOffset: [{ x: 0, z: -1.0 }],
    label: 'Analytics'
  },
  roberto: {
    x: -9,   z: 0,    facing: Math.PI/2,
    deskType: 'desk', chair: 'chair_office', screen: 'monitor',
    extras: ['bookshelf', 'plant_tall'], extrasOffset: [{ x: 0, z: -1.0 }, { x: 0.7, z: 0.5 }],
    label: 'Finance Office'
  },
  qcbot: {
    x: 0,    z: 8,    facing: -Math.PI,
    deskType: 'desk_simple', chair: 'chair_office', screen: 'monitor',
    extras: [], extrasOffset: [],
    label: 'QC Station'
  }
};

// Build all workspaces. Returns:
//   { humanoidPositions: { slug → {x, y, z, rotY} } }  for the humanoid placement loop
export async function buildWorkspaces(scene) {
  const loader = getAssetLoader();
  const humanoidPositions = {};

  for (const [slug, ws] of Object.entries(WORKSPACES)) {
    const zone = new THREE.Group();
    zone.position.set(ws.x, 0, ws.z);
    zone.rotation.y = ws.facing;
    zone.userData.workspace = slug;

    // Desk
    const desk = await loader.get(ws.deskType);
    desk.position.set(0, 0, 0);
    zone.add(desk);

    // Chair (behind the desk relative to facing)
    const chair = await loader.get(ws.chair);
    chair.position.set(0, 0, 0.85);
    chair.rotation.y = Math.PI; // face the desk
    zone.add(chair);

    // Screen (on top of desk, slightly back)
    const screen = await loader.get(ws.screen);
    screen.position.set(0, 0.74, -0.15);
    zone.add(screen);

    // Extras around the workspace
    (ws.extras || []).forEach(async (extraType, i) => {
      const off = ws.extrasOffset?.[i] || { x: 0.6, z: 0 };
      const extra = await loader.get(extraType);
      extra.position.set(off.x, 0, off.z);
      zone.add(extra);
    });

    // Floor label (text plane facing up)
    const labelCanvas = document.createElement('canvas');
    labelCanvas.width = 256; labelCanvas.height = 64;
    const ctx = labelCanvas.getContext('2d');
    ctx.fillStyle = 'rgba(177,79,255,0.15)';
    ctx.fillRect(0, 0, 256, 64);
    ctx.fillStyle = '#B14FFF';
    ctx.font = 'bold 22px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(ws.label, 128, 40);
    const labelTex = new THREE.CanvasTexture(labelCanvas);
    const label = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 0.5),
      new THREE.MeshBasicMaterial({ map: labelTex, transparent: true, depthWrite: false })
    );
    label.rotation.x = -Math.PI / 2;
    label.position.set(0, 0.025, 1.6);
    zone.add(label);

    scene.add(zone);

    // Humanoid sits at the chair (slightly behind desk)
    // Compute world position by transforming local (0, 0, 0.85) through zone's matrix
    const worldPos = new THREE.Vector3(0, 0, 0.85).applyMatrix4(
      new THREE.Matrix4().compose(
        new THREE.Vector3(ws.x, 0, ws.z),
        new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), ws.facing),
        new THREE.Vector3(1, 1, 1)
      )
    );
    humanoidPositions[slug] = { x: worldPos.x, y: 0, z: worldPos.z, rotY: ws.facing + Math.PI };
  }

  return { humanoidPositions };
}
