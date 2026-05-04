// frontend/office/projects/ProjectLane.js
// 3D project progress bars (left wall of the office).

import * as THREE from 'three';
import { gsap } from 'gsap';

const STAGE_PROGRESS = {
  briefing: 0.10, quote_sent: 0.20, approved: 0.30, in_production: 0.50,
  in_review: 0.70, revision_requested: 0.65, final_review: 0.85,
  delivered: 0.95, completed: 1.00
};
const STAGE_COLOR = {
  briefing: '#3498DB', quote_sent: '#F39C12', approved: '#27AE60',
  in_production: '#B14FFF', in_review: '#9B59B6', revision_requested: '#E74C3C',
  final_review: '#16A085', delivered: '#00FF9F', completed: '#FFD700'
};

export class ProjectLane {
  constructor(scene, camera) {
    this.scene = scene; this.camera = camera;
    this.lanes = new Map();
    this.container = new THREE.Group();
    this.container.position.set(-9, 4, -8);
    this.scene.add(this.container);
  }

  updateProjects(projects = []) {
    const ids = new Set(projects.map(p => p.id));
    this.lanes.forEach((_, id) => { if (!ids.has(id)) this.removeLane(id); });
    projects.slice(0, 8).forEach((p, i) => {
      if (this.lanes.has(p.id)) this.updateLane(p.id, p);
      else this.addLane(p, i);
    });
  }

  addLane(project, index) {
    const lane = new THREE.Group();

    const bg = new THREE.Mesh(
      new THREE.PlaneGeometry(4, 0.4),
      new THREE.MeshBasicMaterial({ color: '#1a1a2e', transparent: true, opacity: 0.85 })
    );
    lane.add(bg);

    const completion = STAGE_PROGRESS[project.status] || 0;
    const fillW = (4 - 0.1) * completion;
    const fill = new THREE.Mesh(
      new THREE.PlaneGeometry(Math.max(0.01, fillW), 0.32),
      new THREE.MeshBasicMaterial({ color: STAGE_COLOR[project.status] || '#888' })
    );
    fill.position.x = -2 + fillW / 2 + 0.05;
    fill.position.z = 0.001;
    lane.add(fill);

    const labelCanvas = document.createElement('canvas');
    labelCanvas.width = 800; labelCanvas.height = 100;
    this.drawLabel(labelCanvas, project, completion);
    const labelTex = new THREE.CanvasTexture(labelCanvas);
    const label = new THREE.Mesh(
      new THREE.PlaneGeometry(4, 0.5),
      new THREE.MeshBasicMaterial({ map: labelTex, transparent: true })
    );
    label.position.y = 0.5;
    lane.add(label);

    lane.position.y = -index * 0.8;
    this.container.add(lane);

    lane.scale.x = 0;
    gsap.to(lane.scale, { x: 1, duration: 0.5, ease: 'back.out(1.7)' });

    this.lanes.set(project.id, { group: lane, fill, label, labelCanvas, labelTex, project });
  }

  updateLane(id, project) {
    const e = this.lanes.get(id);
    if (!e) return;
    const completion = STAGE_PROGRESS[project.status] || 0;
    const newW = (4 - 0.1) * completion;

    gsap.to(e.fill.scale, {
      x: newW / e.fill.geometry.parameters.width,
      duration: 0.8, ease: 'power2.out'
    });
    gsap.to(e.fill.position, {
      x: -2 + newW / 2 + 0.05, duration: 0.8, ease: 'power2.out'
    });
    e.fill.material.color.setStyle(STAGE_COLOR[project.status] || '#888');
    this.drawLabel(e.labelCanvas, project, completion);
    e.labelTex.needsUpdate = true;
  }

  removeLane(id) {
    const e = this.lanes.get(id);
    if (!e) return;
    gsap.to(e.group.scale, {
      x: 0, y: 0, z: 0, duration: 0.3,
      onComplete: () => { this.container.remove(e.group); this.lanes.delete(id); }
    });
  }

  drawLabel(canvas, project, completion) {
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#FFFFFF';
    ctx.font = '500 28px monospace';
    ctx.textAlign = 'left';
    ctx.fillText((project.name || 'Proyecto').substring(0, 30), 20, 40);
    ctx.fillStyle = '#888';
    ctx.font = '400 18px monospace';
    ctx.fillText(project.client_name || '', 20, 65);
    ctx.fillStyle = '#B14FFF';
    ctx.font = '500 24px monospace';
    ctx.textAlign = 'right';
    ctx.fillText(`${Math.round(completion * 100)}%`, canvas.width - 20, 50);
    ctx.fillStyle = '#888';
    ctx.font = '400 16px monospace';
    ctx.fillText((project.status || '').replace('_', ' ').toUpperCase(), canvas.width - 20, 75);
  }

  update() {
    if (this.camera) this.container.quaternion.copy(this.camera.quaternion);
  }
}
