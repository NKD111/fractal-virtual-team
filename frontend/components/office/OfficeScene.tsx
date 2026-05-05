'use client';
import { useEffect, useRef, useState } from 'react';
import { Application, Container, Sprite, Text, TextStyle, Graphics, Assets } from 'pixi.js';
import { io, Socket } from 'socket.io-client';
import { gsap } from 'gsap';
import ChatPanel from './ChatPanel';
import GuardianPanel from './GuardianPanel';
import PendingsBalloon, { PendingsTarget } from './PendingsBalloon';

import { isoToScreen } from '../../office/iso/isoMath';
import { ROOMS, agentScreenPos, buildRoomPlatform } from '../../office/iso/rooms';
import { AGENT_PRESETS } from '../../office/agents/presets';
import { POSE, loadAgentSpritesheet, proceduralCharacter, animateBreathing, animateJump } from '../../office/iso/agentSprites';
import { OracleEntity, ORACLE_STATE } from '../../office/iso/oracleEntity';
import { GlitchEntity } from '../../office/iso/glitchEntity';
import { NexusEntity, NEXUS_STATE } from '../../office/iso/nexusEntity';
import { AtlasEntity, ATLAS_STATE } from '../../office/iso/atlasEntity';
import { burst, dashedLine } from '../../office/iso/particles';
import { audio } from '../../office/audio/audioManager';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

type AgentRecord = {
  slug: string;
  preset: any;
  container: Container;
  setPose: (poseId: number) => void;
};

export default function OfficeScene() {
  const containerRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<Application | null>(null);
  const [selectedAgent, setSelectedAgent] = useState<{ name: string; color: string; role: string } | null>(null);
  const [guardianMode, setGuardianMode] = useState<'nexus' | 'atlas' | null>(null);
  const [userId, setUserId] = useState<string>('');
  const [stats, setStats] = useState({ activeProjects: 0, agentsOnline: 0, queriesToday: 0 });
  const [cdmxTime, setCdmxTime] = useState('--:--');

  // ── Identify web user ──────────────────────────────────────────────────────
  useEffect(() => {
    const session = (typeof window !== 'undefined' && (
      localStorage.getItem('fractal-session') ||
      (() => {
        const s = `web-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        localStorage.setItem('fractal-session', s);
        return s;
      })()
    )) || `anon-${Date.now()}`;
    fetch(`${API_URL}/api/users/me?session=${session}`)
      .then(r => r.json()).then(d => setUserId(d.user?.id || ''))
      .catch(() => setUserId(`fallback-${session}`));
  }, []);

  // ── CDMX clock ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const tick = () => {
      const d = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Mexico_City' }));
      setCdmxTime(d.toTimeString().substring(0, 5));
    };
    tick();
    const id = setInterval(tick, 30000);
    return () => clearInterval(id);
  }, []);

  // ── Audio init + mute UI state ────────────────────────────────────────────
  const [muted, setMuted] = useState(false);
  useEffect(() => {
    audio.init();
    setMuted(audio.isMuted());
    const off = audio.onMuteChange(setMuted);
    // Ambient starts on first user interaction (browser autoplay policy)
    const startOnce = () => { audio.startAmbient(); window.removeEventListener('pointerdown', startOnce); };
    window.addEventListener('pointerdown', startOnce);
    return () => { off(); window.removeEventListener('pointerdown', startOnce); };
  }, []);

  // ── Edit mode (drag-to-place agents). Persisted in localStorage. ──────────
  const [editMode, setEditMode] = useState(false);
  const editModeRef = useRef(false);
  useEffect(() => { editModeRef.current = editMode; }, [editMode]);

  // ── Pendings balloon (right-click on agent) ──────────────────────────────
  const [pendingsTarget, setPendingsTarget] = useState<PendingsTarget>(null);

  // ── Lounge music widget state ────────────────────────────────────────────
  const [loungeOn, setLoungeOn] = useState(false);
  useEffect(() => {
    setLoungeOn(audio.isLoungePlaying());
    return audio.onLoungeChange(setLoungeOn);
  }, []);

  // ── Pixi scene setup ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return;
    let mounted = true;
    let cleanup: (() => void) | null = null;

    (async () => {
      const app = new Application();
      await app.init({
        background: 0x0a0a14,
        antialias: true,
        resolution: Math.min(2, window.devicePixelRatio || 1),
        autoDensity: true,
        resizeTo: containerRef.current!,
        powerPreference: 'high-performance'
      });
      if (!mounted) { app.destroy(true, { children: true, texture: true }); return; }
      appRef.current = app;
      (window as any).__PIXI_APP = app;
      containerRef.current!.appendChild(app.canvas);

      // Suppress browser context menu so right-click can be used as a game input
      app.canvas.addEventListener('contextmenu', (e) => e.preventDefault());

      // World container, centered on screen
      const world = new Container();
      world.label = 'world';
      world.sortableChildren = true;
      app.stage.addChild(world);

      // Camera offset (mutated by pan-drag)
      let camX = 0, camY = 0;
      const recenter = () => {
        world.x = app.screen.width / 2 + camX;
        world.y = app.screen.height / 2 + camY;
      };
      recenter();
      app.renderer.on('resize', recenter);

      // BACKGROUND: LAYOUT v1 (the original — clean office, no surrounding
      // city block). Restored after LAYOUT 2 looked disproportionate vs
      // characters. Saved agent positions in localStorage stay aligned.
      try {
        const bgTex = await Assets.load('/assets/sprites/LAYOUT.png');
        const bg = new Sprite(bgTex);
        bg.anchor.set(0.5, 0.5);
        bg.x = 0;
        bg.y = 0;
        bg.scale.set(0.42);
        bg.alpha = 1.0;
        bg.zIndex = -10000;
        bg.eventMode = 'static';
        bg.cursor = 'grab';
        world.addChild(bg);
      } catch (e) {
        console.warn('[bg] LAYOUT.png load failed, falling back to procedural platforms:', e);
        Object.keys(ROOMS).forEach((key) => {
          const p = buildRoomPlatform(key);
          if (p) {
            p.zIndex = -1000;
            world.addChild(p);
          }
        });
      }

      // Pan-drag camera: drag anywhere on the empty background to pan the world
      let dragging = false;
      let dragStartX = 0, dragStartY = 0, camStartX = 0, camStartY = 0;
      app.stage.eventMode = 'static';
      app.stage.hitArea = app.screen;
      app.stage.on('pointerdown', (e) => {
        // Only start drag if the click target is the stage/world/bg, not an entity
        const tgt: any = e.target;
        if (!tgt || tgt === app.stage || tgt.label === 'world' || tgt.zIndex === -10000) {
          dragging = true;
          dragStartX = e.global.x; dragStartY = e.global.y;
          camStartX = camX; camStartY = camY;
        }
      });
      app.stage.on('pointermove', (e) => {
        if (!dragging) return;
        camX = camStartX + (e.global.x - dragStartX);
        camY = camStartY + (e.global.y - dragStartY);
        recenter();
      });
      const endDrag = () => { dragging = false; };
      app.stage.on('pointerup', endDrag);
      app.stage.on('pointerupoutside', endDrag);

      // Saved overrides from edit-mode dragging (localStorage)
      // Loaded EARLY so Oracle/NEXUS/ATLAS can use them too
      const savedPositions: Record<string, { x: number; y: number }> = (() => {
        try { return JSON.parse(localStorage.getItem('fractal-agent-positions') || '{}'); } catch { return {}; }
      })();

      // Track all draggable entities (agents + Oracle/NEXUS/ATLAS) so the
      // persist + dump functions cover everything in one place.
      const draggables: Array<{ slug: string; container: Container }> = [];

      // Helper: make any container draggable in edit mode + persist.
      // `entity` (optional) lets us update the entity's _baseY so its update()
      // tick doesn't reset y back to the original on every frame (NEXUS/ATLAS).
      const makeDraggable = (slug: string, container: Container, entity?: any) => {
        let dragging = false;
        let dragStartGX = 0, dragStartGY = 0, startX = 0, startY = 0;
        const sync = () => {
          // Atlas/Nexus update() resets container.y to _baseY each frame.
          // Keep _baseY in sync with the dragged y so it doesn't snap back.
          if (entity && typeof entity.setBasePosition === 'function') {
            entity.setBasePosition(container.x, container.y);
          } else if (entity && '_baseY' in entity) {
            entity._baseY = container.y;
          }
        };
        container.on('pointerdown', (ev: any) => {
          if (!editModeRef.current) return;
          dragging = true;
          ev.stopPropagation?.();
          dragStartGX = ev.global.x; dragStartGY = ev.global.y;
          startX = container.x; startY = container.y;
          container.cursor = 'grabbing';
        });
        container.on('globalpointermove', (ev: any) => {
          if (!dragging || !editModeRef.current) return;
          container.x = startX + (ev.global.x - dragStartGX);
          container.y = startY + (ev.global.y - dragStartGY);
          container.zIndex = Math.round(container.y) + 1000;
          sync(); // continuous so float-aware entities don't fight
        });
        const stop = () => {
          if (!dragging) return;
          dragging = false;
          container.cursor = 'pointer';
          sync();
          persistAll();
          console.log(`[edit] ${slug} → (${Math.round(container.x)}, ${Math.round(container.y)})`);
        };
        container.on('pointerup', stop);
        container.on('pointerupoutside', stop);
        draggables.push({ slug, container });
      };

      const persistAll = () => {
        const all: Record<string, { x: number; y: number }> = {};
        for (const d of draggables) all[d.slug] = { x: Math.round(d.container.x), y: Math.round(d.container.y) };
        try { localStorage.setItem('fractal-agent-positions', JSON.stringify(all)); } catch {}
      };
      (window as any).__dumpAgentPlacements = () => {
        const lines = draggables.map(d =>
          `  ${d.slug.padEnd(10)} { x: ${Math.round(d.container.x)}, y: ${Math.round(d.container.y)} },`);
        const out = `// positions (paste to OfficeScene / rooms.js)\nconst SAVED = {\n${lines.join('\n')}\n};`;
        console.log(out);
        return out;
      };

      // ORACLE
      const oracle = new OracleEntity();
      const oracleRoom = ROOMS.oracle_tower;
      const oracleDefault = isoToScreen(oracleRoom.gx + oracleRoom.sx / 2, oracleRoom.gy + oracleRoom.sy / 2);
      const oraclePos = savedPositions['oracle'] || { x: oracleDefault.x, y: oracleDefault.y - 8 };
      oracle.container.x = oraclePos.x;
      oracle.setBaseY(oraclePos.y);
      oracle.container.zIndex = Math.round(oraclePos.y) + 1000;
      oracle.container.eventMode = 'static';
      world.addChild(oracle.container);
      oracle.tryLoadSpritesheet();
      oracle.container.on('pointertap', () => {
        if (editModeRef.current) return;
        setSelectedAgent({ name: 'oracle', color: '#B14FFF', role: 'Inteligencia Compartida' });
      });
      makeDraggable('oracle', oracle.container, oracle);

      // Agents
      const agents: AgentRecord[] = [];
      const tickerStops: Array<() => void> = [];

      // Load all sprite sheets in parallel (was serialized → painfully slow)
      const presetEntries = Object.entries(AGENT_PRESETS) as [string, any][];
      const sheets = await Promise.all(
        presetEntries.map(([slug, preset]) => loadAgentSpritesheet(slug, preset).catch(() => ({ hasReal: false, textures: null })))
      );
      console.log('[OfficeScene] sheets loaded:', sheets.map((s, i) => `${presetEntries[i][0]}=${s?.hasReal ? 'REAL' : 'PROC'}`));
      for (let i = 0; i < presetEntries.length; i++) {
        const [slug, preset] = presetEntries[i];
        const sheet = sheets[i];
        const root = new Container();
        root.eventMode = 'static';
        root.cursor = 'pointer';
        let setPose: (p: number) => void;

        // Soft elliptical ground shadow (Habbo style), drawn FIRST so sprite covers it
        const shadow = new Graphics();
        shadow.ellipse(0, -2, 16, 5).fill({ color: 0x000000, alpha: 0.45 });
        root.addChild(shadow);

        // Note: procedural desks/monitors removed — the BG image already has
        // decorated desks for every workstation. Live characters render clean.

        let breathTarget: any = null;
        if (sheet.hasReal && sheet.textures) {
          const spriteImg = new Sprite(sheet.textures[POSE.IDLE]);
          spriteImg.anchor.set(0.5, 1);
          // Default 56px tall, per-slug targetH override (e.g. Diego 50)
          const tH = (sheet as any).targetH || 56;
          if (sheet.cellH) spriteImg.scale.set(tH / sheet.cellH);
          root.addChild(spriteImg);
          breathTarget = spriteImg;
          setPose = (p: number) => { spriteImg.texture = sheet.textures[p]; };
        } else {
          const proc = proceduralCharacter(preset);
          proc.container.scale.set(0.95);
          root.addChild(proc.container);
          breathTarget = proc.container;
          setPose = proc.setPose;
        }

        // Idle micro-animation (Habbo-style breathing): subtle vertical squash
        // with randomized phase per agent so they don't all bob in unison.
        if (breathTarget) {
          const baseScaleY = breathTarget.scale.y;
          const baseScaleX = breathTarget.scale.x;
          gsap.to(breathTarget.scale, {
            y: baseScaleY * 0.92,
            x: baseScaleX * 1.04,
            duration: 1.6 + Math.random() * 0.6,
            ease: 'sine.inOut',
            yoyo: true,
            repeat: -1,
            delay: Math.random() * 1.5
          });
        }

        // Use saved position if user has dragged this agent, else default
        const defaultPos = agentScreenPos(slug);
        const pos = savedPositions[slug] || defaultPos;
        root.x = pos.x;
        root.y = pos.y;
        // Painter's algorithm: depth-sort by Y. Add baseline so agents always
        // render ABOVE the platforms (zIndex -1000), regardless of negative Y.
        root.zIndex = Math.round(pos.y) + 1000;
        console.log(`[agent] ${slug} mode=${sheet.hasReal ? 'REAL' : 'PROC'} pos=(${Math.round(pos.x)},${Math.round(pos.y)})${savedPositions[slug] ? ' [saved]' : ''}`);

        // Hover label
        const labelStyle = new TextStyle({
          fontFamily: 'system-ui, monospace', fontSize: 11, fontWeight: '600',
          fill: 0xffffff, stroke: { color: 0x0a0a14, width: 3 }
        });
        const hoverLabel = new Text({ text: preset.name, style: labelStyle });
        hoverLabel.anchor.set(0.5, 1);
        hoverLabel.position.set(0, -68);
        hoverLabel.alpha = 0;
        root.addChild(hoverLabel);

        root.on('pointerover', () => {
          gsap.to(hoverLabel, { alpha: 1, duration: 0.2 });
          if (!editModeRef.current) gsap.to(root.scale, { x: 1.08, y: 1.08, duration: 0.18 });
        });
        root.on('pointerout', () => {
          gsap.to(hoverLabel, { alpha: 0, duration: 0.2 });
          if (!editModeRef.current) gsap.to(root.scale, { x: 1, y: 1, duration: 0.18 });
        });
        root.on('pointertap', () => {
          if (editModeRef.current) return; // editing → no chat panel
          audio.playAgentVoice(slug); // "¡Hey!" grunt by gender bucket
          setSelectedAgent({ name: slug, color: preset.color, role: preset.role });
        });
        // Right-click → show pendings balloon
        root.on('rightclick', (ev: any) => {
          ev.stopPropagation?.();
          if (editModeRef.current) return;
          const gp = root.getGlobalPosition();
          setPendingsTarget({
            slug, name: preset.name, color: preset.color,
            screenX: gp.x, screenY: gp.y - 12
          });
        });

        // Drag-to-place via shared helper (covers Oracle/NEXUS/ATLAS too)
        makeDraggable(slug, root);

        world.addChild(root);
        // Note: GSAP idle anim runs on the sprite directly (above), so it
        // doesn't fight the hover anim that targets root.scale.
        agents.push({ slug, preset, container: root, setPose });
      }

      // GLITCH
      const glitch = new GlitchEntity();
      glitch.setBasePosition(0, 0);
      glitch.container.zIndex = 999999;
      world.addChild(glitch.container);
      glitch.tryLoadSpritesheet();

      // NEXUS — independent entity. Default west quadrant; saved overrides win.
      const nexus = new NexusEntity();
      world.addChild(nexus.container);
      nexus.tryLoadSpritesheet();
      nexus.container.on('pointerover', () => nexus.setHoverLabel(true));
      nexus.container.on('pointerout', () => nexus.setHoverLabel(false));
      nexus.container.on('pointertap', () => {
        if (editModeRef.current) return;
        setGuardianMode('nexus');
      });
      const nexusDefault = isoToScreen(-11, 1);
      const nexusPos = savedPositions['nexus'] || { x: nexusDefault.x, y: nexusDefault.y };
      nexus.setBasePosition(nexusPos.x, nexusPos.y);
      nexus.container.zIndex = Math.round(nexusPos.y) + 1000;
      makeDraggable('nexus', nexus.container, nexus);

      // ATLAS — independent entity. Default east; saved overrides win.
      const atlas = new AtlasEntity();
      world.addChild(atlas.container);
      atlas.tryLoadSpritesheet();
      atlas.container.on('pointerover', () => atlas.setHoverLabel(true));
      atlas.container.on('pointerout', () => atlas.setHoverLabel(false));
      atlas.container.on('pointertap', () => {
        if (editModeRef.current) return;
        setGuardianMode('atlas');
      });
      const atlasDefault = isoToScreen(8, -3);
      const atlasPos = savedPositions['atlas'] || { x: atlasDefault.x, y: atlasDefault.y };
      atlas.setBasePosition(atlasPos.x, atlasPos.y);
      atlas.container.zIndex = Math.round(atlasPos.y) + 1000;
      makeDraggable('atlas', atlas.container, atlas);

      const recentlyBusy: Set<string> = new Set();

      // Chat bubble overlay helper. Anchors a small label above the agent and
      // fades it out after `lifeMs`. Used by the daily-standup WS broadcast.
      const showBubble = (agentSlug: string, text: string, lifeMs = 5000) => {
        const a = agents.find(x => x.slug === agentSlug);
        // Allow Oracle to receive bubbles too
        const target = a?.container ?? (agentSlug === 'oracle' ? oracle.container : null);
        if (!target) return;
        const style = new TextStyle({
          fontFamily: 'system-ui, monospace', fontSize: 10, fontWeight: '500',
          fill: 0xffffff, stroke: { color: 0x0a0a14, width: 3 },
          wordWrap: true, wordWrapWidth: 140, align: 'center'
        });
        const bubble = new Text({ text, style });
        bubble.anchor.set(0.5, 1);
        bubble.position.set(0, -68);
        bubble.alpha = 0;
        bubble.zIndex = 99999;
        target.addChild(bubble);
        gsap.to(bubble, { alpha: 1, duration: 0.18 });
        gsap.delayedCall(lifeMs / 1000, () => {
          gsap.to(bubble, { alpha: 0, duration: 0.3, onComplete: () => bubble.destroy() });
        });
        // Working pose during bubble
        if (a) {
          a.setPose(POSE.WORKING);
          setTimeout(() => a.setPose(POSE.IDLE), lifeMs);
        }
      };

      // WebSocket events drive poses
      const socket: Socket = io(API_URL, { transports: ['websocket', 'polling'] });
      socket.on('chat_bubble', (ev: any) => {
        if (ev?.agent && ev?.text) showBubble(ev.agent, ev.text, 5000);
      });
      // Daily standup broadcasts as 'agent_standup' (per Fase 8.5 spec)
      socket.on('agent_standup', (ev: any) => {
        if (ev?.agent && ev?.message) showBubble(ev.agent, ev.message, 5000);
      });
      socket.on('agent_event', (ev: any) => {
        const a = agents.find(x => x.slug === ev.agent);
        if (!a) return;
        a.setPose(POSE.WORKING);
        recentlyBusy.add(a.slug);
        setTimeout(() => { a.setPose(POSE.IDLE); recentlyBusy.delete(a.slug); }, 2500);
      });
      socket.on('inter_agent_chat', (ev: any) => {
        const from = agents.find(a => a.slug === ev.from);
        const to   = agents.find(a => a.slug === ev.to);
        if (from) from.setPose(POSE.THINKING);
        if (to) to.setPose(POSE.THINKING);
        setTimeout(() => { from?.setPose(POSE.IDLE); to?.setPose(POSE.IDLE); }, 2000);
      });
      socket.on('oracle_query', (ev: any) => {
        audio.play('oracle');
        oracle.setState(ORACLE_STATE.THINKING);
        const consultor = agents.find(a => a.slug === ev.agent);
        if (consultor) {
          consultor.setPose(POSE.THINKING);
          oracle.beamTo(consultor.container.x, consultor.container.y - 32);
          // Dashed magenta line from consultor to Oracle
          dashedLine(world, consultor.container.x, consultor.container.y - 28,
                     oracle.container.x, oracle.container.y - 8,
                     { color: 0xb14fff });
          setTimeout(() => consultor.setPose(POSE.IDLE), 2500);
        }
      });
      socket.on('oracle_response', () => {
        oracle.setState(ORACLE_STATE.BROADCASTING);
        setTimeout(() => oracle.setState(ORACLE_STATE.IDLE), 2000);
      });
      socket.on('new_message', () => {
        audio.play('notification');
        const mariana = agents.find(a => a.slug === 'mariana');
        if (mariana) {
          mariana.setPose(POSE.WORKING);
          setTimeout(() => mariana.setPose(POSE.IDLE), 2500);
        }
      });
      socket.on('project_complete', (ev: any) => {
        audio.play('success');
        const owner = ev?.agent ? agents.find(a => a.slug === ev.agent) : null;
        if (owner) {
          owner.setPose(POSE.HAPPY);
          animateJump(owner.container, app.ticker, 600);
          // Confetti at owner's position
          burst(world, owner.container.x, owner.container.y - 28, { count: 14, spread: 60 });
          setTimeout(() => owner.setPose(POSE.IDLE), 3000);
        } else {
          agents.forEach(a => animateJump(a.container, app.ticker, 600));
        }
      });
      socket.on('quote_accepted', () => {
        audio.play('success');
        agents.forEach(a => { a.setPose(POSE.HAPPY); animateJump(a.container, app.ticker, 800); });
        // Big confetti from each room center
        for (const key of Object.keys(ROOMS)) {
          const room = (ROOMS as any)[key];
          const c = isoToScreen(room.gx + room.sx / 2, room.gy + room.sy / 2);
          burst(world, c.x, c.y - 20, { count: 12, spread: 70, duration: 1.6 });
        }
        setTimeout(() => agents.forEach(a => a.setPose(POSE.IDLE)), 3000);
      });

      // Guardian events
      socket.on('nexus_alert', () => nexus.setState(NEXUS_STATE.ALERT));
      socket.on('nexus_active', () => nexus.setState(NEXUS_STATE.ACTIVE));
      socket.on('nexus_reporting', () => nexus.setState(NEXUS_STATE.REPORTING));
      socket.on('atlas_diagnosing', () => atlas.setState(ATLAS_STATE.DIAGNOSING));
      socket.on('atlas_repairing', () => atlas.setState(ATLAS_STATE.REPAIRING));
      socket.on('atlas_alert', () => atlas.setState(ATLAS_STATE.ALERT));

      // Stats
      const fetchStats = async () => {
        try {
          const [pj, og] = await Promise.all([
            fetch(`${API_URL}/api/features/projects/dashboard`).then(r => r.json()).catch(() => ({})),
            fetch(`${API_URL}/api/oracle/status`).then(r => r.json()).catch(() => ({}))
          ]);
          setStats({
            activeProjects: pj.total_active || 0,
            agentsOnline: agents.length,
            queriesToday: og.queries_today || 0
          });
        } catch (_) {}
      };
      fetchStats();
      const statsTimer = setInterval(fetchStats, 30000);

      // Main update loop
      app.ticker.add((ticker) => {
        const dt = ticker.deltaTime;
        oracle.update(dt);
        glitch.update(dt, Array.from(recentlyBusy));
        nexus.update(dt);
        atlas.update(dt);
      });

      cleanup = () => {
        clearInterval(statsTimer);
        socket.close();
        tickerStops.forEach(stop => stop());
        app.renderer.off('resize', recenter);
        app.destroy(true, { children: true, texture: true });
      };
    })();

    return () => {
      mounted = false;
      cleanup?.();
    };
  }, []);

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#0a0a14', overflow: 'hidden' }}>
      <div ref={containerRef} style={{ position: 'absolute', inset: 0 }} />

      {/* HUD top */}
      <div style={{ position: 'absolute', top: 16, left: 16, right: 16, display: 'flex', justifyContent: 'space-between', pointerEvents: 'none', fontFamily: 'system-ui, monospace', color: '#fff' }}>
        <div style={{ background: 'rgba(15,15,25,0.85)', padding: '12px 18px', borderRadius: 12, border: '1px solid rgba(177,79,255,0.4)', backdropFilter: 'blur(8px)' }}>
          <div style={{ fontSize: 12, color: '#B14FFF', letterSpacing: '0.15em', fontWeight: 600 }}>FRACTAL MX · VIRTUAL HQ</div>
          <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>CDMX · {cdmxTime}</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Stat label="Proyectos" value={stats.activeProjects} />
          <Stat label="Agentes" value={stats.agentsOnline} />
          <Stat label="Oracle hoy" value={stats.queriesToday} />
        </div>
      </div>

      <div style={{ position: 'absolute', bottom: 16, left: 60, color: '#666', fontFamily: 'system-ui, monospace', fontSize: 11 }}>
        Click un personaje para chatear · ORACLE en el centro · 👻 Glitch deambula
      </div>

      {/* Mute button */}
      <button
        onClick={() => audio.toggleMute()}
        title={muted ? 'Activar audio' : 'Silenciar'}
        style={{
          position: 'absolute', bottom: 12, left: 12,
          width: 36, height: 36, borderRadius: 18,
          background: 'rgba(15,15,25,0.85)',
          border: '1px solid rgba(177,79,255,0.4)',
          color: '#fff', fontSize: 16, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          backdropFilter: 'blur(8px)'
        }}>
        {muted ? '🔇' : '🔊'}
      </button>

      {/* Lounge music widget — hipster elevator vibes */}
      <button
        onClick={() => audio.toggleLounge()}
        title={loungeOn ? 'Pausar música lounge' : 'Música lounge'}
        style={{
          position: 'absolute', bottom: 12, left: 56,
          padding: '0 12px', height: 36, borderRadius: 18,
          background: loungeOn ? 'rgba(255, 206, 92, 0.95)' : 'rgba(15,15,25,0.85)',
          border: `1px solid ${loungeOn ? '#FFCE5C' : 'rgba(177,79,255,0.4)'}`,
          color: loungeOn ? '#1a1a14' : '#fff',
          fontSize: 13, cursor: 'pointer', fontWeight: 600,
          display: 'flex', alignItems: 'center', gap: 6,
          backdropFilter: 'blur(8px)', fontFamily: 'system-ui, monospace'
        }}>
        <span style={{ fontSize: 16 }}>🎷</span>
        {loungeOn ? 'lounge ON' : 'lounge'}
      </button>

      {/* Edit mode toggle (drag-to-place agents) */}
      <button
        onClick={() => setEditMode(m => !m)}
        title={editMode ? 'Bloquear posiciones' : 'Editar posiciones'}
        style={{
          position: 'absolute', bottom: 12, right: 12,
          padding: '8px 14px', borderRadius: 18,
          background: editMode ? 'rgba(255,107,53,0.95)' : 'rgba(15,15,25,0.85)',
          border: `1px solid ${editMode ? '#FF6B35' : 'rgba(177,79,255,0.4)'}`,
          color: '#fff', fontSize: 13, cursor: 'pointer', fontWeight: 600,
          backdropFilter: 'blur(8px)'
        }}>
        {editMode ? '🔒 Listo (bloquear)' : '🔓 Editar posiciones'}
      </button>
      {editMode && (
        <div style={{
          position: 'absolute', bottom: 60, right: 12,
          padding: '10px 14px', borderRadius: 8,
          background: 'rgba(15,15,25,0.95)',
          border: '1px solid rgba(255,107,53,0.5)',
          color: '#fff', fontSize: 12, fontFamily: 'system-ui, monospace',
          maxWidth: 280, lineHeight: 1.5
        }}>
          <div style={{ color: '#FF6B35', fontWeight: 700, marginBottom: 4 }}>EDIT MODE</div>
          Arrastra cada personaje a su lugar.<br />
          Auto-guarda en localStorage.<br />
          Cuando termines, abre la consola y escribe<br />
          <code style={{ color: '#FFCE5C' }}>__dumpAgentPlacements()</code><br />
          para imprimir las coords finales.
        </div>
      )}

      <PendingsBalloon target={pendingsTarget} onDismiss={() => setPendingsTarget(null)} />

      {selectedAgent && userId && (
        <ChatPanel agent={selectedAgent} userId={userId} onClose={() => setSelectedAgent(null)} />
      )}
      {guardianMode && (
        <GuardianPanel mode={guardianMode} onClose={() => setGuardianMode(null)} />
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div style={{ background: 'rgba(15,15,25,0.85)', padding: '10px 16px', borderRadius: 12, border: '1px solid rgba(177,79,255,0.4)', backdropFilter: 'blur(8px)', minWidth: 84, textAlign: 'right' }}>
      <div style={{ fontSize: 22, fontWeight: 700, color: '#B14FFF', fontFamily: 'system-ui, monospace', lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 9, color: '#888', textTransform: 'uppercase', letterSpacing: '0.15em', marginTop: 4 }}>{label}</div>
    </div>
  );
}
