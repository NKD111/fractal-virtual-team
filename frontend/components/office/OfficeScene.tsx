'use client';
import { useEffect, useRef, useState } from 'react';
import { Application, Container, Sprite, Text, TextStyle } from 'pixi.js';
import { io, Socket } from 'socket.io-client';
import { gsap } from 'gsap';
import ChatPanel from './ChatPanel';
import GuardianPanel from './GuardianPanel';

import { isoToScreen } from '../../office/iso/isoMath';
import { ROOMS, agentScreenPos, buildRoomPlatform } from '../../office/iso/rooms';
import { AGENT_PRESETS } from '../../office/agents/presets';
import { POSE, loadAgentSpritesheet, proceduralCharacter, animateBreathing, animateJump } from '../../office/iso/agentSprites';
import { OracleEntity, ORACLE_STATE } from '../../office/iso/oracleEntity';
import { GlitchEntity } from '../../office/iso/glitchEntity';
import { NexusEntity, NEXUS_STATE } from '../../office/iso/nexusEntity';
import { AtlasEntity, ATLAS_STATE } from '../../office/iso/atlasEntity';

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
      containerRef.current!.appendChild(app.canvas);

      // World container, centered on screen
      const world = new Container();
      world.label = 'world';
      world.sortableChildren = true;
      app.stage.addChild(world);

      const recenter = () => {
        world.x = app.screen.width / 2;
        world.y = app.screen.height / 2;
      };
      recenter();
      app.renderer.on('resize', recenter);

      // Floating platforms (rooms)
      Object.keys(ROOMS).forEach((key) => {
        const p = buildRoomPlatform(key);
        if (p) {
          p.zIndex = -1000;
          world.addChild(p);
          p.on('pointertap', () => {
            gsap.fromTo(p, { alpha: 0.5 }, { alpha: 1, duration: 0.6 });
          });
        }
      });

      // ORACLE
      const oracle = new OracleEntity();
      const oracleRoom = ROOMS.oracle_tower;
      const oracleCenter = isoToScreen(oracleRoom.gx + oracleRoom.sx / 2, oracleRoom.gy + oracleRoom.sy / 2);
      oracle.container.x = oracleCenter.x;
      oracle.setBaseY(oracleCenter.y - 8);
      oracle.container.zIndex = oracleCenter.x + oracleCenter.y * 1000;
      world.addChild(oracle.container);
      oracle.tryLoadSpritesheet();
      oracle.container.on('pointertap', () => {
        setSelectedAgent({ name: 'oracle', color: '#B14FFF', role: 'Inteligencia Compartida' });
      });

      // Agents
      const agents: AgentRecord[] = [];
      const tickerStops: Array<() => void> = [];

      // Load all sprite sheets in parallel (was serialized → painfully slow)
      const presetEntries = Object.entries(AGENT_PRESETS) as [string, any][];
      const sheets = await Promise.all(
        presetEntries.map(([slug, preset]) => loadAgentSpritesheet(slug, preset).catch(() => ({ hasReal: false, textures: null })))
      );

      for (let i = 0; i < presetEntries.length; i++) {
        const [slug, preset] = presetEntries[i];
        const sheet = sheets[i];
        const root = new Container();
        root.eventMode = 'static';
        root.cursor = 'pointer';
        let setPose: (p: number) => void;

        if (sheet.hasReal && sheet.textures) {
          const spriteImg = new Sprite(sheet.textures[POSE.IDLE]);
          spriteImg.anchor.set(0.5, 1);
          // Target ~56px tall: ~45% of a 4-tile room (128px diamond height).
          if (sheet.cellH) spriteImg.scale.set(56 / sheet.cellH);
          root.addChild(spriteImg);
          setPose = (p: number) => { spriteImg.texture = sheet.textures[p]; };
        } else {
          const proc = proceduralCharacter(preset);
          // Procedural characters are small (~50px). Scale up so they're visible
          // against the big floating platforms. Real PNGs use their own scale.
          proc.container.scale.set(0.95);
          root.addChild(proc.container);
          setPose = proc.setPose;
        }

        const pos = agentScreenPos(slug);
        root.x = pos.x;
        root.y = pos.y;
        root.zIndex = pos.x + pos.y * 1000;

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
          gsap.to(root.scale, { x: 1.08, y: 1.08, duration: 0.18 });
        });
        root.on('pointerout', () => {
          gsap.to(hoverLabel, { alpha: 0, duration: 0.2 });
          gsap.to(root.scale, { x: 1, y: 1, duration: 0.18 });
        });
        root.on('pointertap', () => {
          setSelectedAgent({ name: slug, color: preset.color, role: preset.role });
        });

        world.addChild(root);
        tickerStops.push(animateBreathing(root, app.ticker));
        agents.push({ slug, preset, container: root, setPose });
      }

      // GLITCH
      const glitch = new GlitchEntity();
      glitch.setBasePosition(0, 0);
      glitch.container.zIndex = 999999;
      world.addChild(glitch.container);
      glitch.tryLoadSpritesheet();

      // NEXUS — top-right floating, in screen space (not world)
      const nexus = new NexusEntity();
      app.stage.addChild(nexus.container);
      nexus.tryLoadSpritesheet();
      nexus.container.on('pointerover', () => nexus.setHoverLabel(true));
      nexus.container.on('pointerout', () => nexus.setHoverLabel(false));
      nexus.container.on('pointertap', () => setGuardianMode('nexus'));

      // ATLAS — bottom-right floating, in screen space
      const atlas = new AtlasEntity();
      app.stage.addChild(atlas.container);
      atlas.tryLoadSpritesheet();
      atlas.container.on('pointerover', () => atlas.setHoverLabel(true));
      atlas.container.on('pointerout', () => atlas.setHoverLabel(false));
      atlas.container.on('pointertap', () => setGuardianMode('atlas'));

      // Position NEXUS and ATLAS in screen space; reposition on resize
      const placeGuardians = () => {
        const w = app.screen.width, h = app.screen.height;
        nexus.setBasePosition(w - 100, 140);
        atlas.setBasePosition(w - 100, h - 140);
      };
      placeGuardians();
      app.renderer.on('resize', placeGuardians);

      const recentlyBusy: Set<string> = new Set();

      // WebSocket events drive poses
      const socket: Socket = io(API_URL, { transports: ['websocket', 'polling'] });
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
        oracle.setState(ORACLE_STATE.THINKING);
        const consultor = agents.find(a => a.slug === ev.agent);
        if (consultor) oracle.beamTo(consultor.container.x, consultor.container.y - 32);
      });
      socket.on('project_complete', () => {
        agents.forEach(a => animateJump(a.container, app.ticker, 600));
      });
      socket.on('quote_accepted', () => {
        agents.forEach(a => { a.setPose(POSE.HAPPY); animateJump(a.container, app.ticker, 800); });
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
        app.renderer.off('resize', placeGuardians);
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

      <div style={{ position: 'absolute', bottom: 16, left: 16, color: '#666', fontFamily: 'system-ui, monospace', fontSize: 11 }}>
        Click un personaje para chatear · ORACLE en el centro · 👻 Glitch deambula
      </div>

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
