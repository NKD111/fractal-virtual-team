// frontend/office/agents/InterAgentChat.js
// Floating chat bubbles between agents (3D billboard).

import * as THREE from 'three';
import { gsap } from 'gsap';

export class InterAgentChat {
  constructor(scene, camera) {
    this.scene = scene;
    this.camera = camera;
    this.activeBubbles = [];
  }

  showMessage({ from, to, message, fromPos, toPos, duration = 5500 }) {
    const mid = new THREE.Vector3(
      (fromPos.x + toPos.x) / 2,
      Math.max(fromPos.y, toPos.y) + 2.5,
      (fromPos.z + toPos.z) / 2
    );

    const canvas = document.createElement('canvas');
    canvas.width = 600; canvas.height = 200;
    this.drawBubble(canvas.getContext('2d'), message, from, to);

    const tex = new THREE.CanvasTexture(canvas);
    const plane = new THREE.Mesh(
      new THREE.PlaneGeometry(2.5, 0.83),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false })
    );
    plane.position.copy(mid);
    plane.scale.set(0, 0, 0);
    this.scene.add(plane);

    const lineGeo = new THREE.BufferGeometry().setFromPoints([fromPos, toPos]);
    const lineMat = new THREE.LineBasicMaterial({ color: '#B14FFF', transparent: true, opacity: 0 });
    const line = new THREE.Line(lineGeo, lineMat);
    this.scene.add(line);

    gsap.to(plane.scale, { x: 1, y: 1, z: 1, duration: 0.4, ease: 'back.out(1.7)' });
    gsap.to(lineMat, { opacity: 0.5, duration: 0.3 });

    const id = `${from}-${to}-${Date.now()}`;
    const entry = { id, plane, line, lineMat };
    this.activeBubbles.push(entry);

    setTimeout(() => {
      gsap.to(plane.scale, { x: 0, y: 0, z: 0, duration: 0.3, onComplete: () => this.scene.remove(plane) });
      gsap.to(lineMat, { opacity: 0, duration: 0.3, onComplete: () => this.scene.remove(line) });
      this.activeBubbles = this.activeBubbles.filter(b => b.id !== id);
    }, duration);
  }

  // Make bubbles always face the camera
  update() {
    if (!this.camera) return;
    this.activeBubbles.forEach(({ plane }) => plane.quaternion.copy(this.camera.quaternion));
  }

  drawBubble(ctx, message, from, to) {
    const w = 600, h = 200, padding = 24;
    ctx.clearRect(0, 0, w, h);
    ctx.shadowColor = 'rgba(177, 79, 255, 0.4)';
    ctx.shadowBlur = 20;
    ctx.fillStyle = 'rgba(15, 25, 35, 0.95)';
    this.roundRect(ctx, padding, padding, w - padding * 2, h - padding * 2, 24);
    ctx.fill();
    ctx.shadowBlur = 0;

    const grad = ctx.createLinearGradient(0, 0, w, 0);
    grad.addColorStop(0, '#B14FFF');
    grad.addColorStop(1, '#4A90E2');
    ctx.strokeStyle = grad; ctx.lineWidth = 2;
    this.roundRect(ctx, padding, padding, w - padding * 2, h - padding * 2, 24);
    ctx.stroke();

    ctx.fillStyle = '#B14FFF';
    ctx.font = '500 18px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`${String(from).toUpperCase()} → ${String(to).toUpperCase()}`, padding + 16, padding + 30);

    ctx.strokeStyle = 'rgba(177, 79, 255, 0.3)'; ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padding + 16, padding + 45);
    ctx.lineTo(w - padding - 16, padding + 45);
    ctx.stroke();

    ctx.fillStyle = '#FFFFFF';
    ctx.font = '400 22px monospace';
    const lines = this.wrap(ctx, String(message || ''), w - padding * 2 - 32);
    lines.slice(0, 3).forEach((line, i) => ctx.fillText(line, padding + 16, padding + 75 + i * 28));
  }

  wrap(ctx, text, maxW) {
    const words = text.split(' '); const lines = []; let cur = '';
    words.forEach(word => {
      const test = cur ? cur + ' ' + word : word;
      if (ctx.measureText(test).width > maxW && cur) { lines.push(cur); cur = word; }
      else cur = test;
    });
    if (cur) lines.push(cur);
    return lines;
  }

  roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }
}
