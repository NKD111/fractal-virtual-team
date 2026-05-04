'use client';
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { io, Socket } from 'socket.io-client';
import ChatPanel from './ChatPanel';
import { VoxelHumanoid } from '../../office/agents/VoxelHumanoid';
import { AGENT_PRESETS, AGENT_POSITIONS } from '../../office/agents/presets';
import { InterAgentChat } from '../../office/agents/InterAgentChat';
import { ProjectLane } from '../../office/projects/ProjectLane';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

type AgentRecord = { slug: string; preset: any; mesh: THREE.Group };

export default function OfficeScene() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [selectedAgent, setSelectedAgent] = useState<{ name: string; color: string; role: string } | null>(null);
  const [userId, setUserId] = useState<string>('');
  const [stats, setStats] = useState({ activeProjects: 0, agentsOnline: 0, queriesToday: 0 });

  // Identify web user
  useEffect(() => {
    const session = localStorage.getItem('fractal-session') ||
      (() => { const s = `web-${Date.now()}-${Math.random().toString(36).slice(2)}`; localStorage.setItem('fractal-session', s); return s; })();
    fetch(`${API_URL}/api/users/me?session=${session}`)
      .then(r => r.json()).then(d => setUserId(d.user?.id || ''))
      .catch(() => setUserId(`fallback-${session}`));
  }, []);

  // Three.js scene setup
  useEffect(() => {
    if (!canvasRef.current || !containerRef.current) return;

    const w = containerRef.current.clientWidth;
    const h = containerRef.current.clientHeight;
    const renderer = new THREE.WebGLRenderer({ canvas: canvasRef.current, antialias: true });
    renderer.setSize(w, h);
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    renderer.shadowMap.enabled = true;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#0a0e1a');
    scene.fog = new THREE.Fog('#0a0e1a', 18, 40);

    const camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 100);
    // Isometric-ish view
    camera.position.set(12, 11, 12);
    camera.lookAt(0, 1, 0);

    // Lighting
    const ambient = new THREE.AmbientLight('#5d6b88', 0.5);
    scene.add(ambient);
    const dir = new THREE.DirectionalLight('#ffffff', 0.9);
    dir.position.set(8, 14, 6);
    dir.castShadow = true;
    dir.shadow.mapSize.set(1024, 1024);
    dir.shadow.camera.left = -15; dir.shadow.camera.right = 15;
    dir.shadow.camera.top = 15; dir.shadow.camera.bottom = -15;
    scene.add(dir);

    // Floor
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(30, 30),
      new THREE.MeshStandardMaterial({ color: '#15203a', metalness: 0.1, roughness: 0.8 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    // Grid
    const grid = new THREE.GridHelper(30, 30, '#2a3a5e', '#1a2540');
    (grid.material as THREE.Material).opacity = 0.4;
    (grid.material as THREE.Material).transparent = true;
    scene.add(grid);

    // Oracle core (center sphere)
    const oracleCore = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.55, 1),
      new THREE.MeshStandardMaterial({ color: '#B14FFF', emissive: '#5e1aaa', emissiveIntensity: 0.6, roughness: 0.2 })
    );
    oracleCore.position.set(0, 6, 0);
    scene.add(oracleCore);

    // Build agents
    const agents: AgentRecord[] = [];
    Object.entries(AGENT_POSITIONS).forEach(([slug, pos]) => {
      const preset = (AGENT_PRESETS as any)[slug];
      if (!preset) return;
      const humanoid = new VoxelHumanoid(preset);
      const mesh = humanoid.build();
      mesh.position.set(pos.x, 0, pos.z);
      mesh.userData.agentSlug = slug;
      mesh.userData.agentName = preset.name;
      humanoid.setUserData(slug);
      scene.add(mesh);
      agents.push({ slug, preset, mesh });
    });

    // Inter-agent chat + project lanes
    const interChat = new InterAgentChat(scene, camera);
    const projectLanes = new ProjectLane(scene, camera);

    // Mouse controls (orbit-lite)
    let isDragging = false, mouseX = 0, mouseY = 0;
    let azimuth = Math.PI / 4, polar = Math.PI / 3.5, radius = 18;
    const updateCam = () => {
      camera.position.x = radius * Math.sin(polar) * Math.cos(azimuth);
      camera.position.z = radius * Math.sin(polar) * Math.sin(azimuth);
      camera.position.y = radius * Math.cos(polar);
      camera.lookAt(0, 1.5, 0);
    };
    updateCam();

    const onDown = (e: MouseEvent) => { isDragging = true; mouseX = e.clientX; mouseY = e.clientY; };
    const onUp = () => { isDragging = false; };
    const onMove = (e: MouseEvent) => {
      if (!isDragging) return;
      azimuth += (e.clientX - mouseX) * 0.01;
      polar = Math.max(0.3, Math.min(Math.PI / 2 - 0.05, polar - (e.clientY - mouseY) * 0.005));
      mouseX = e.clientX; mouseY = e.clientY;
      updateCam();
    };
    const onWheel = (e: WheelEvent) => {
      radius = Math.max(8, Math.min(30, radius + e.deltaY * 0.01));
      updateCam();
    };

    // Click → open chat panel
    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    const onClick = (e: MouseEvent) => {
      const rect = canvasRef.current!.getBoundingClientRect();
      ndc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      ndc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(ndc, camera);
      const intersects = raycaster.intersectObjects(scene.children, true);
      for (const hit of intersects) {
        let obj: any = hit.object;
        while (obj && !obj.userData?.agentSlug) obj = obj.parent;
        if (obj?.userData?.agentSlug) {
          const slug = obj.userData.agentSlug;
          const preset = (AGENT_PRESETS as any)[slug];
          if (preset) setSelectedAgent({ name: slug, color: preset.color, role: preset.role });
          break;
        }
      }
    };

    canvasRef.current.addEventListener('mousedown', onDown);
    canvasRef.current.addEventListener('mouseup', onUp);
    canvasRef.current.addEventListener('mouseleave', onUp);
    canvasRef.current.addEventListener('mousemove', onMove);
    canvasRef.current.addEventListener('wheel', onWheel);
    canvasRef.current.addEventListener('click', onClick);

    // Resize
    const onResize = () => {
      if (!containerRef.current) return;
      const W = containerRef.current.clientWidth;
      const H = containerRef.current.clientHeight;
      renderer.setSize(W, H);
      camera.aspect = W / H;
      camera.updateProjectionMatrix();
    };
    window.addEventListener('resize', onResize);

    // Socket.io for live events
    const socket: Socket = io(API_URL, { transports: ['websocket', 'polling'] });
    socket.on('connect', () => console.log('[Office] socket connected'));
    socket.on('inter_agent_chat', (ev: any) => {
      const fromAgent = agents.find(a => a.slug === ev.from);
      const toAgent = agents.find(a => a.slug === ev.to);
      if (fromAgent && toAgent) {
        const fromPos = new THREE.Vector3().setFromMatrixPosition(fromAgent.mesh.matrixWorld);
        const toPos = new THREE.Vector3().setFromMatrixPosition(toAgent.mesh.matrixWorld);
        interChat.showMessage({ from: ev.from, to: ev.to, message: ev.message, fromPos, toPos });
      }
    });
    socket.on('agent_event', (ev: any) => {
      // Pulse the speaking agent
      const a = agents.find(x => x.slug === ev.agent);
      if (a) {
        const startY = a.mesh.position.y;
        a.mesh.position.y = 0.1;
        setTimeout(() => { a.mesh.position.y = startY; }, 400);
      }
    });

    // Periodic stats refresh
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
        if (Array.isArray(pj.upcoming_deadlines)) projectLanes.updateProjects(pj.upcoming_deadlines);
      } catch (_) {}
    };
    fetchStats();
    const statsTimer = setInterval(fetchStats, 30000);

    // Animate loop
    let raf = 0;
    const clock = new THREE.Clock();
    const animate = () => {
      raf = requestAnimationFrame(animate);
      const t = clock.getElapsedTime();
      oracleCore.rotation.y = t * 0.4;
      oracleCore.rotation.x = Math.sin(t * 0.3) * 0.2;
      oracleCore.position.y = 6 + Math.sin(t * 1.5) * 0.15;
      // Idle bob for agents
      agents.forEach((a, i) => {
        a.mesh.rotation.y = Math.sin(t * 0.3 + i) * 0.1;
      });
      interChat.update();
      projectLanes.update();
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(raf);
      clearInterval(statsTimer);
      socket.close();
      window.removeEventListener('resize', onResize);
      canvasRef.current?.removeEventListener('mousedown', onDown);
      canvasRef.current?.removeEventListener('mouseup', onUp);
      canvasRef.current?.removeEventListener('mouseleave', onUp);
      canvasRef.current?.removeEventListener('mousemove', onMove);
      canvasRef.current?.removeEventListener('wheel', onWheel);
      canvasRef.current?.removeEventListener('click', onClick);
      renderer.dispose();
    };
  }, []);

  return (
    <div ref={containerRef} style={{ position: 'fixed', inset: 0, background: '#0a0e1a', overflow: 'hidden' }}>
      <canvas ref={canvasRef} style={{ display: 'block', cursor: 'grab' }} />

      {/* HUD */}
      <div style={{ position: 'absolute', top: 16, left: 16, right: 16, display: 'flex', justifyContent: 'space-between', pointerEvents: 'none', fontFamily: 'system-ui, monospace', color: '#fff' }}>
        <div style={{ background: 'rgba(15,25,35,0.85)', padding: '12px 18px', borderRadius: 12, border: '1px solid rgba(177,79,255,0.3)', backdropFilter: 'blur(8px)' }}>
          <div style={{ fontSize: 12, color: '#B14FFF', letterSpacing: '0.15em' }}>FRACTAL MX · VIRTUAL HQ</div>
          <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>Click un agente para chatear</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Stat label="Proyectos activos" value={stats.activeProjects} />
          <Stat label="Agentes online" value={stats.agentsOnline} />
          <Stat label="Oracle queries hoy" value={stats.queriesToday} />
        </div>
      </div>

      {/* Bottom hint */}
      <div style={{ position: 'absolute', bottom: 16, left: 16, color: '#666', fontFamily: 'system-ui, monospace', fontSize: 11 }}>
        Drag para rotar · Wheel para zoom · Click un humanoide para chatear
      </div>

      {selectedAgent && userId && (
        <ChatPanel agent={selectedAgent} userId={userId} onClose={() => setSelectedAgent(null)} />
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div style={{ background: 'rgba(15,25,35,0.85)', padding: '12px 18px', borderRadius: 12, border: '1px solid rgba(177,79,255,0.3)', backdropFilter: 'blur(8px)', minWidth: 90, textAlign: 'right' }}>
      <div style={{ fontSize: 22, fontWeight: 600, color: '#B14FFF', fontFamily: 'system-ui, monospace' }}>{value}</div>
      <div style={{ fontSize: 10, color: '#888', textTransform: 'uppercase', letterSpacing: '0.1em' }}>{label}</div>
    </div>
  );
}
