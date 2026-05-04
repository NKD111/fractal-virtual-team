// frontend/office/agents/HumanoidGLB.js
// Drop-in replacement for VoxelHumanoid using a GLB model produced by Meshy.
// Falls back to VoxelHumanoid if no GLB is registered for the agent.

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { VoxelHumanoid } from './VoxelHumanoid';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

// Per-agent GLB tuning (Meshy outputs are typically ~1m tall facing -Z)
// Override per-agent if a model needs special scale/offset.
const TUNING_DEFAULTS = {
  scale: 1.0,
  yOffset: 0,
  rotY: 0
};
const TUNING_OVERRIDES = {
  // mariana: { scale: 1.05, yOffset: 0, rotY: 0 },
  // carlos:  { scale: 0.95, yOffset: 0, rotY: 0 },
};

const loader = new GLTFLoader();
const cache = new Map(); // agentSlug → Promise<THREE.Group>

/**
 * Build a humanoid for an agent. Tries Meshy GLB first, falls back to VoxelHumanoid.
 * @param {string} slug
 * @param {object} preset (from AGENT_PRESETS)
 * @returns {Promise<THREE.Group>}
 */
export async function buildAgentMesh(slug, preset) {
  // Check the asset registry on the backend
  let glbUrl = null;
  try {
    const r = await fetch(`${API_URL}/api/meshy/asset/${slug}`, { cache: 'no-store' });
    if (r.ok) {
      const d = await r.json();
      if (d.glb_url) glbUrl = d.glb_url;
    }
  } catch (_) { /* no registry — fall back */ }

  if (glbUrl) {
    try { return await loadGLB(slug, glbUrl); }
    catch (err) {
      console.warn(`[HumanoidGLB] ${slug}: GLB load failed (${err.message}) — using VoxelHumanoid`);
    }
  }

  // Fallback to procedural voxel humanoid
  const humanoid = new VoxelHumanoid(preset);
  const mesh = humanoid.build();
  humanoid.setUserData(slug);
  return mesh;
}

async function loadGLB(slug, url) {
  if (!cache.has(slug)) {
    cache.set(slug, new Promise((resolve, reject) => {
      loader.load(url, (gltf) => {
        const root = gltf.scene;
        root.traverse((c) => { if (c.isMesh) { c.castShadow = true; c.receiveShadow = true; } });
        resolve(root);
      }, undefined, reject);
    }));
  }
  const root = await cache.get(slug);
  const inst = root.clone(true);
  const tuning = { ...TUNING_DEFAULTS, ...(TUNING_OVERRIDES[slug] || {}) };

  // Center on its origin and apply tuning
  const box = new THREE.Box3().setFromObject(inst);
  const size = box.getSize(new THREE.Vector3());
  const targetHeight = 1.95 * tuning.scale;
  const k = size.y > 0 ? targetHeight / size.y : tuning.scale;
  inst.scale.setScalar(k);
  // Re-bottom on floor
  const newBox = new THREE.Box3().setFromObject(inst);
  inst.position.y = -newBox.min.y + tuning.yOffset;
  inst.rotation.y = tuning.rotY;

  // Tag for raycaster
  inst.userData.agentSlug = slug;
  inst.traverse((c) => { c.userData = c.userData || {}; c.userData.agentSlug = slug; });
  return inst;
}

// Optional: pre-warm cache for all agents
export async function preloadAllAgents() {
  try {
    const r = await fetch(`${API_URL}/api/meshy/assets`);
    if (!r.ok) return;
    const d = await r.json();
    Object.entries(d.assets || {}).forEach(([slug, info]) => {
      if (info?.glb_url) loadGLB(slug, info.glb_url).catch(() => {});
    });
  } catch (_) {}
}
