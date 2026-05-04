// frontend/office/world/AssetLoader.js
// Loads GLB assets (Kenney Furniture Kit) with graceful fallback to primitives.
// Pipeline: tries `/assets/kenney/<name>.glb` first; if missing, returns procedural mesh.

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const ASSET_BASE = '/assets/kenney/';

// Logical name → expected file path. Kenney Furniture Kit naming.
// Update these strings to match the user's actual download once placed in /public/assets/kenney/.
export const KENNEY_ASSETS = {
  desk:        'deskCorner.glb',
  desk_simple: 'desk.glb',
  chair_office:'chairDesk.glb',
  chair_modern:'chairModernCushion.glb',
  monitor:     'computerScreen.glb',
  computer:    'computer.glb',
  laptop:      'laptop.glb',
  lamp_desk:   'lampSquare.glb',
  lamp_floor:  'lampRoundFloor.glb',
  bookshelf:   'bookshelfWide.glb',
  plant_small: 'plantSmall1.glb',
  plant_tall:  'plantTall.glb',
  rug_small:   'rugRectangle.glb',
  cabinet:     'cabinetTelevisionDoors.glb',
  whiteboard:  'tableCloth.glb', // placeholder mapping; replace with whiteboard if available
  trash:       'trashcan.glb',
  bin:         'binBag.glb'
};

class AssetLoader {
  constructor() {
    this.loader = new GLTFLoader();
    this.cache = new Map();        // logicalName → Promise<THREE.Group>
    this.missing = new Set();      // names we know aren't on disk
  }

  /**
   * Get an asset (logical name). Returns a Promise resolving to a THREE.Group.
   * Cache: subsequent calls return cloned instances.
   */
  async get(logicalName) {
    if (this.missing.has(logicalName)) return this._fallback(logicalName);

    if (!this.cache.has(logicalName)) {
      const path = KENNEY_ASSETS[logicalName];
      if (!path) {
        console.warn(`[AssetLoader] Unknown asset: ${logicalName}`);
        return this._fallback(logicalName);
      }
      this.cache.set(logicalName, this._loadGLB(ASSET_BASE + path).catch((err) => {
        console.warn(`[AssetLoader] ${logicalName} not found at ${ASSET_BASE + path} — using fallback`);
        this.missing.add(logicalName);
        return null;
      }));
    }

    const root = await this.cache.get(logicalName);
    if (!root) return this._fallback(logicalName);
    return root.clone(true);
  }

  _loadGLB(url) {
    return new Promise((resolve, reject) => {
      this.loader.load(
        url,
        (gltf) => {
          gltf.scene.traverse((child) => {
            if (child.isMesh) { child.castShadow = true; child.receiveShadow = true; }
          });
          resolve(gltf.scene);
        },
        undefined,
        (err) => reject(err)
      );
    });
  }

  /**
   * Procedural fallback — looks deliberately stylized, fits the voxel aesthetic.
   * Returns a THREE.Group ready to be added to a parent.
   */
  _fallback(logicalName) {
    const g = new THREE.Group();
    g.userData.fallback = true;
    g.userData.logicalName = logicalName;

    const woodMat = new THREE.MeshLambertMaterial({ color: '#8B5A3C' });
    const metalMat = new THREE.MeshLambertMaterial({ color: '#3a4a5c' });
    const greenMat = new THREE.MeshLambertMaterial({ color: '#2e7d4f' });
    const screenMat = new THREE.MeshBasicMaterial({ color: '#0a1530' });
    const cushionMat = new THREE.MeshLambertMaterial({ color: '#3a3a5c' });

    switch (logicalName) {
      case 'desk':
      case 'desk_simple': {
        const top = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.06, 0.8), woodMat);
        top.position.y = 0.7; top.castShadow = top.receiveShadow = true;
        g.add(top);
        // 4 legs
        [[-0.7, -0.35], [0.7, -0.35], [-0.7, 0.35], [0.7, 0.35]].forEach(([x, z]) => {
          const leg = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.7, 0.06), metalMat);
          leg.position.set(x, 0.35, z); leg.castShadow = true; g.add(leg);
        });
        return g;
      }
      case 'chair_office':
      case 'chair_modern': {
        const seat = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.08, 0.5), cushionMat);
        seat.position.y = 0.45; seat.castShadow = true; g.add(seat);
        const back = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.55, 0.08), cushionMat);
        back.position.set(0, 0.75, -0.21); back.castShadow = true; g.add(back);
        // Pedestal
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.4, 8), metalMat);
        pole.position.y = 0.2; g.add(pole);
        const baseStar = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.05, 8), metalMat);
        baseStar.position.y = 0.025; g.add(baseStar);
        return g;
      }
      case 'monitor': {
        const stand = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.1, 0.1), metalMat);
        stand.position.y = 0.05; g.add(stand);
        const arm = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.25, 0.04), metalMat);
        arm.position.y = 0.22; g.add(arm);
        const screen = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.34, 0.04), metalMat);
        screen.position.y = 0.5; g.add(screen);
        const display = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.3), screenMat);
        display.position.set(0, 0.5, 0.022); g.add(display);
        return g;
      }
      case 'laptop': {
        const base = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.03, 0.28), metalMat);
        base.position.y = 0.015; g.add(base);
        const lid = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.28, 0.02), metalMat);
        lid.position.set(0, 0.16, -0.13); lid.rotation.x = -0.2; g.add(lid);
        const display = new THREE.Mesh(new THREE.PlaneGeometry(0.36, 0.24), screenMat);
        display.position.copy(lid.position); display.position.z += 0.012;
        display.rotation.copy(lid.rotation); g.add(display);
        return g;
      }
      case 'lamp_desk': {
        const base = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.04, 12), metalMat);
        base.position.y = 0.02; g.add(base);
        const arm = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.4, 0.03), metalMat);
        arm.position.y = 0.22; g.add(arm);
        const shade = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.12, 8, 1, true), new THREE.MeshLambertMaterial({ color: '#f0e6cc', side: THREE.DoubleSide }));
        shade.position.y = 0.45; shade.rotation.x = Math.PI; g.add(shade);
        return g;
      }
      case 'lamp_floor': {
        const base = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.18, 0.06, 12), metalMat);
        base.position.y = 0.03; g.add(base);
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.4, 8), metalMat);
        pole.position.y = 0.7; g.add(pole);
        const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 0.25, 12, 1, true), new THREE.MeshLambertMaterial({ color: '#f0e6cc', side: THREE.DoubleSide }));
        shade.position.y = 1.5; g.add(shade);
        return g;
      }
      case 'bookshelf': {
        const back = new THREE.Mesh(new THREE.BoxGeometry(1.0, 1.6, 0.06), woodMat);
        back.position.set(0, 0.8, 0); g.add(back);
        for (let i = 0; i < 4; i++) {
          const shelf = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.04, 0.3), woodMat);
          shelf.position.set(0, 0.3 + i * 0.4, 0.15); g.add(shelf);
          // some books
          for (let j = -0.4; j < 0.4; j += 0.1) {
            const book = new THREE.Mesh(
              new THREE.BoxGeometry(0.08, 0.28, 0.2),
              new THREE.MeshLambertMaterial({ color: ['#e74c3c','#3498db','#27ae60','#f39c12','#9b59b6'][Math.floor(Math.random()*5)] })
            );
            book.position.set(j, 0.46 + i * 0.4, 0.18); g.add(book);
          }
        }
        return g;
      }
      case 'plant_small': {
        const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.14, 0.2, 12), new THREE.MeshLambertMaterial({ color: '#5d3a1f' }));
        pot.position.y = 0.1; g.add(pot);
        const leaves = new THREE.Mesh(new THREE.SphereGeometry(0.25, 12, 8), greenMat);
        leaves.position.y = 0.4; leaves.scale.y = 1.2; g.add(leaves);
        return g;
      }
      case 'plant_tall': {
        const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.18, 0.3, 12), new THREE.MeshLambertMaterial({ color: '#5d3a1f' }));
        pot.position.y = 0.15; g.add(pot);
        const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.6, 6), woodMat);
        trunk.position.y = 0.55; g.add(trunk);
        for (let i = 0; i < 4; i++) {
          const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.25, 8, 6), greenMat);
          leaf.position.set(Math.cos(i*Math.PI/2)*0.15, 0.95 + i*0.05, Math.sin(i*Math.PI/2)*0.15);
          leaf.scale.set(1, 0.7, 1); g.add(leaf);
        }
        return g;
      }
      case 'rug_small': {
        const rug = new THREE.Mesh(new THREE.BoxGeometry(2, 0.02, 1.4), new THREE.MeshLambertMaterial({ color: '#8e44ad' }));
        rug.position.y = 0.011; rug.receiveShadow = true; g.add(rug);
        return g;
      }
      default: {
        const box = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), woodMat);
        box.position.y = 0.25; box.castShadow = true; g.add(box);
        return g;
      }
    }
  }
}

// Singleton
let _instance = null;
export function getAssetLoader() {
  if (!_instance) _instance = new AssetLoader();
  return _instance;
}

export default AssetLoader;
