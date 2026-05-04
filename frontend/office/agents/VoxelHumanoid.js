// frontend/office/agents/VoxelHumanoid.js
// Voxel humanoid (Crossy Road / Habbo style) — proper human proportions.

import * as THREE from 'three';

export class VoxelHumanoid {
  constructor(config) {
    this.config = config || {};
    this.group = new THREE.Group();
    this.parts = {};
  }

  build() {
    this.buildHead();
    this.buildTorso();
    this.buildArms();
    this.buildLegs();
    this.applyOutfit();
    return this.group;
  }

  buildHead() {
    const headGroup = new THREE.Group();
    const headMat = new THREE.MeshLambertMaterial({ color: this.config.skinTone || '#E8B894' });

    const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.55, 0.45), headMat);
    head.castShadow = true;
    headGroup.add(head);

    this.buildHair(headGroup);
    this.buildFace(headGroup);

    const neck = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.15, 0.2), headMat);
    neck.position.y = -0.35;
    headGroup.add(neck);

    headGroup.position.y = 1.95;
    this.group.add(headGroup);
    this.parts.head = headGroup;
  }

  buildHair(headGroup) {
    const style = this.config.hairStyle || 'short';
    const mat = new THREE.MeshLambertMaterial({ color: this.config.hairColor || '#3D2817' });

    if (style === 'short') {
      const hair = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.12, 0.47), mat);
      hair.position.y = 0.27; hair.castShadow = true;
      headGroup.add(hair);
    } else if (style === 'long') {
      const top = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.15, 0.47), mat);
      top.position.y = 0.27; headGroup.add(top);
      ['left', 'right'].forEach((side) => {
        const sideHair = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.4, 0.4), mat);
        sideHair.position.set(side === 'left' ? -0.26 : 0.26, 0, 0);
        headGroup.add(sideHair);
      });
    } else if (style === 'curly') {
      const hair = new THREE.Mesh(new THREE.SphereGeometry(0.32, 8, 6), mat);
      hair.position.y = 0.18; hair.scale.y = 0.85;
      headGroup.add(hair);
    } else if (style === 'bun') {
      const hair = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.12, 0.47), mat);
      hair.position.y = 0.27; headGroup.add(hair);
      const bun = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 8), mat);
      bun.position.set(0, 0.38, -0.18); headGroup.add(bun);
    } else if (style === 'beard') {
      const hair = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.12, 0.47), mat);
      hair.position.y = 0.27; headGroup.add(hair);
      const beard = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.15, 0.1), mat);
      beard.position.set(0, -0.18, 0.22); headGroup.add(beard);
    }
    // 'bald' — no hair
  }

  buildFace(headGroup) {
    ['left', 'right'].forEach((side) => {
      const eyeWhite = new THREE.Mesh(
        new THREE.BoxGeometry(0.1, 0.1, 0.04),
        new THREE.MeshBasicMaterial({ color: '#FFFFFF' })
      );
      eyeWhite.position.set(side === 'left' ? -0.13 : 0.13, 0.05, 0.23);
      headGroup.add(eyeWhite);
      const pupil = new THREE.Mesh(
        new THREE.BoxGeometry(0.06, 0.06, 0.05),
        new THREE.MeshBasicMaterial({ color: '#1a1a2e' })
      );
      pupil.position.z = 0.01;
      eyeWhite.add(pupil);
      this.parts[`${side}Eye`] = eyeWhite;
    });

    const mouth = new THREE.Mesh(
      new THREE.BoxGeometry(0.14, 0.04, 0.04),
      new THREE.MeshBasicMaterial({ color: '#8B4513' })
    );
    mouth.position.set(0, -0.15, 0.23);
    headGroup.add(mouth);
    this.parts.mouth = mouth;

    if (this.config.glasses) {
      const frameMat = new THREE.MeshBasicMaterial({ color: '#1a1a2e', side: THREE.DoubleSide });
      ['left', 'right'].forEach((side) => {
        const frame = new THREE.Mesh(new THREE.RingGeometry(0.06, 0.08, 12), frameMat);
        frame.position.set(side === 'left' ? -0.13 : 0.13, 0.05, 0.26);
        headGroup.add(frame);
      });
      const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.02, 0.02), frameMat);
      bridge.position.set(0, 0.05, 0.26);
      headGroup.add(bridge);
    }
  }

  buildTorso() {
    const torso = new THREE.Mesh(
      new THREE.BoxGeometry(0.55, 0.7, 0.35),
      new THREE.MeshLambertMaterial({ color: this.config.shirtColor || this.config.color || '#3498DB' })
    );
    torso.position.y = 1.25; torso.castShadow = true;
    this.group.add(torso);
    this.parts.torso = torso;
  }

  buildArms() {
    ['left', 'right'].forEach((side) => {
      const armGroup = new THREE.Group();
      const upper = new THREE.Mesh(
        new THREE.BoxGeometry(0.18, 0.4, 0.18),
        new THREE.MeshLambertMaterial({ color: this.config.shirtColor || this.config.color || '#3498DB' })
      );
      upper.position.y = -0.2; upper.castShadow = true; armGroup.add(upper);

      const fore = new THREE.Mesh(
        new THREE.BoxGeometry(0.16, 0.35, 0.16),
        new THREE.MeshLambertMaterial({ color: this.config.skinTone || '#E8B894' })
      );
      fore.position.y = -0.6; fore.castShadow = true; armGroup.add(fore);

      const hand = new THREE.Mesh(
        new THREE.BoxGeometry(0.14, 0.14, 0.14),
        new THREE.MeshLambertMaterial({ color: this.config.skinTone || '#E8B894' })
      );
      hand.position.y = -0.85; armGroup.add(hand);

      armGroup.position.set(side === 'left' ? -0.36 : 0.36, 1.5, 0);
      this.group.add(armGroup);
      this.parts[`${side}Arm`] = armGroup;
    });
  }

  buildLegs() {
    ['left', 'right'].forEach((side) => {
      const legGroup = new THREE.Group();
      const leg = new THREE.Mesh(
        new THREE.BoxGeometry(0.22, 0.7, 0.22),
        new THREE.MeshLambertMaterial({ color: this.config.pantsColor || '#2D3F55' })
      );
      leg.position.y = -0.35; leg.castShadow = true; legGroup.add(leg);

      const shoe = new THREE.Mesh(
        new THREE.BoxGeometry(0.24, 0.12, 0.32),
        new THREE.MeshLambertMaterial({ color: this.config.shoeColor || '#1a1a2e' })
      );
      shoe.position.set(0, -0.76, 0.05); shoe.castShadow = true; legGroup.add(shoe);

      legGroup.position.set(side === 'left' ? -0.13 : 0.13, 0.9, 0);
      this.group.add(legGroup);
      this.parts[`${side}Leg`] = legGroup;
    });
  }

  applyOutfit() {
    if (this.config.accessory === 'headphones') {
      const bandMat = new THREE.MeshBasicMaterial({ color: '#1a1a2e' });
      const band = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.025, 6, 16, Math.PI), bandMat);
      band.rotation.z = Math.PI / 2; band.position.set(0, 0.32, 0);
      this.parts.head.add(band);
      ['left', 'right'].forEach((side) => {
        const cup = new THREE.Mesh(
          new THREE.BoxGeometry(0.08, 0.12, 0.06),
          new THREE.MeshBasicMaterial({ color: this.config.color || '#3498DB' })
        );
        cup.position.set(side === 'left' ? -0.27 : 0.27, 0.05, 0);
        this.parts.head.add(cup);
      });
    }
    if (this.config.accessory === 'tie') {
      const tie = new THREE.Mesh(
        new THREE.BoxGeometry(0.08, 0.45, 0.04),
        new THREE.MeshBasicMaterial({ color: this.config.tieColor || '#1a1a2e' })
      );
      tie.position.set(0, 1.3, 0.2); this.group.add(tie);
    }
    if (this.config.accessory === 'apron') {
      const apron = new THREE.Mesh(
        new THREE.BoxGeometry(0.5, 0.55, 0.05),
        new THREE.MeshLambertMaterial({ color: '#5D3A1F' })
      );
      apron.position.set(0, 1.2, 0.2); this.group.add(apron);
    }
  }

  setUserData(name) {
    this.group.traverse((child) => {
      if (child.userData) child.userData.agentName = name;
    });
  }
}
