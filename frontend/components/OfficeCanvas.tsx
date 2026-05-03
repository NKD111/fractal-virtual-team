'use client';
import { useEffect, useRef, useState } from 'react';

interface Agent {
  slug: string;
  name: string;
  color: string;
  emoji: string;
  role: string;
}

interface OfficeCanvasProps {
  agents: Agent[];
  statuses: Record<string, string>;
  activeAgent: string;
}

// Fixed positions for each agent in the virtual office
const AGENT_POSITIONS: Record<string, { x: number; y: number; room: string }> = {
  mariana:   { x: 50,  y: 38, room: 'hub' },
  diana:     { x: 72,  y: 28, room: 'accounts' },
  alex:      { x: 28,  y: 55, room: 'studio' },
  carlos:    { x: 18,  y: 72, room: 'studio' },
  sofia:     { x: 50,  y: 62, room: 'hub' },
  lucas:     { x: 78,  y: 55, room: 'analytics' },
  diego:     { x: 38,  y: 28, room: 'studio' },
  max:       { x: 22,  y: 38, room: 'studio' },
  valentina: { x: 62,  y: 42, room: 'studio' },
  roberto:   { x: 84,  y: 72, room: 'finance' },
};

const ROOM_LABELS = [
  { label: '🏢 Hub Central',       x: 42, y: 8,  color: '#FF6B9D' },
  { label: '🎨 Creative Studio',   x: 14, y: 8,  color: '#3498DB' },
  { label: '💼 Client Relations',  x: 68, y: 8,  color: '#9B59B6' },
  { label: '📈 Analytics Room',    x: 72, y: 48, color: '#F39C12' },
  { label: '💰 Finance Office',    x: 76, y: 88, color: '#16A085' },
];

export default function OfficeCanvas({ agents, statuses, activeAgent }: OfficeCanvasProps) {
  const [bubbles, setBubbles] = useState<Record<string, string>>({});
  const [time, setTime] = useState(new Date());

  // Clock
  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 60000);
    return () => clearInterval(t);
  }, []);

  // Show speech bubbles when agents are typing
  useEffect(() => {
    const typing = Object.entries(statuses).filter(([, s]) => s === 'typing').map(([slug]) => slug);
    const phrases: Record<string, string[]> = {
      mariana: ['Coordinando al equipo...', '¡En ello!', 'Revisando agenda...'],
      diana:   ['Preparando propuesta...', 'Llamando al cliente...'],
      alex:    ['Creando copy...', 'Buscando el hook perfecto...'],
      carlos:  ['Diseñando assets...', 'Ajustando colores...'],
      sofia:   ['Actualizando timeline...', 'Revisando sprints...'],
      lucas:   ['Analizando métricas...', 'Calculando ROI...'],
      diego:   ['Revisando brand...', 'Iterando el concepto...'],
      max:     ['Editando video...', 'Generando con IA...'],
      valentina:['Dirigiendo arte...', 'QA visual...'],
      roberto: ['Revisando números...', 'Preparando factura...'],
    };

    const newBubbles: Record<string, string> = {};
    typing.forEach(slug => {
      const options = phrases[slug] || ['Trabajando...'];
      newBubbles[slug] = options[Math.floor(Math.random() * options.length)];
    });
    setBubbles(newBubbles);
  }, [statuses]);

  const timeStr = time.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Mexico_City' });

  return (
    <div className="relative w-full h-full bg-dark-900 overflow-hidden select-none">
      {/* Background grid */}
      <div className="absolute inset-0 opacity-5"
        style={{
          backgroundImage: 'linear-gradient(rgba(255,255,255,0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.3) 1px, transparent 1px)',
          backgroundSize: '40px 40px'
        }}
      />

      {/* Floor zones */}
      <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
        {/* Hub Central */}
        <rect x="30" y="22" width="40" height="50" rx="2" fill="rgba(255,107,157,0.04)" stroke="rgba(255,107,157,0.12)" strokeWidth="0.3" />
        {/* Creative Studio */}
        <rect x="5" y="18" width="28" height="68" rx="2" fill="rgba(52,152,219,0.04)" stroke="rgba(52,152,219,0.12)" strokeWidth="0.3" />
        {/* Client Relations */}
        <rect x="60" y="14" width="22" height="40" rx="2" fill="rgba(155,89,182,0.04)" stroke="rgba(155,89,182,0.12)" strokeWidth="0.3" />
        {/* Analytics Room */}
        <rect x="68" y="44" width="24" height="24" rx="2" fill="rgba(243,156,18,0.04)" stroke="rgba(243,156,18,0.12)" strokeWidth="0.3" />
        {/* Finance Office */}
        <rect x="72" y="62" width="22" height="28" rx="2" fill="rgba(22,160,133,0.04)" stroke="rgba(22,160,133,0.12)" strokeWidth="0.3" />

        {/* Corridor lines */}
        <line x1="33" y1="0" x2="33" y2="100" stroke="rgba(255,255,255,0.04)" strokeWidth="0.2" strokeDasharray="1,2" />
        <line x1="68" y1="0" x2="68" y2="100" stroke="rgba(255,255,255,0.04)" strokeWidth="0.2" strokeDasharray="1,2" />
        <line x1="0" y1="56" x2="100" y2="56" stroke="rgba(255,255,255,0.04)" strokeWidth="0.2" strokeDasharray="1,2" />
      </svg>

      {/* Room labels */}
      {ROOM_LABELS.map((room, i) => (
        <div
          key={i}
          className="absolute text-xs font-mono opacity-30 pointer-events-none"
          style={{ left: `${room.x}%`, top: `${room.y}%`, color: room.color }}
        >
          {room.label}
        </div>
      ))}

      {/* Agents */}
      {agents.map(agent => {
        const pos = AGENT_POSITIONS[agent.slug] || { x: 50, y: 50 };
        const status = statuses[agent.slug] || 'idle';
        const isActive = agent.slug === activeAgent;
        const isTyping = status === 'typing';
        const bubble = bubbles[agent.slug];

        return (
          <div
            key={agent.slug}
            className="absolute transition-all duration-1000"
            style={{ left: `${pos.x}%`, top: `${pos.y}%`, transform: 'translate(-50%, -50%)' }}
          >
            {/* Speech bubble */}
            {bubble && (
              <div
                className="absolute -top-10 left-1/2 -translate-x-1/2 whitespace-nowrap text-xs px-2 py-1 rounded-lg border pointer-events-none z-20 animate-slide-up"
                style={{
                  backgroundColor: `${agent.color}15`,
                  borderColor: `${agent.color}40`,
                  color: agent.color
                }}
              >
                {bubble}
                <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 rotate-45"
                  style={{ backgroundColor: `${agent.color}15`, borderRight: `1px solid ${agent.color}40`, borderBottom: `1px solid ${agent.color}40` }}
                />
              </div>
            )}

            {/* Agent avatar */}
            <div
              className={`relative flex flex-col items-center gap-1 cursor-pointer group ${isTyping ? 'animate-float' : ''}`}
            >
              {/* Avatar circle */}
              <div
                className="w-11 h-11 rounded-full flex items-center justify-center text-xl border-2 transition-all"
                style={{
                  borderColor: agent.color,
                  backgroundColor: `${agent.color}18`,
                  boxShadow: isActive
                    ? `0 0 0 3px ${agent.color}40, 0 0 20px ${agent.color}60`
                    : isTyping
                    ? `0 0 12px ${agent.color}80`
                    : `0 0 8px ${agent.color}30`,
                }}
              >
                {agent.emoji}
              </div>

              {/* Status dot */}
              <div
                className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full border-2"
                style={{
                  backgroundColor: isTyping ? '#F39C12' : '#27AE60',
                  borderColor: '#0A0A0F',
                  boxShadow: `0 0 6px ${isTyping ? '#F39C12' : '#27AE60'}`
                }}
              />

              {/* Name tag */}
              <div
                className="text-xs font-semibold px-2 py-0.5 rounded-full border"
                style={{
                  color: agent.color,
                  borderColor: `${agent.color}30`,
                  backgroundColor: `${agent.color}10`
                }}
              >
                {agent.name}
              </div>

              {/* Pulse ring when active */}
              {isActive && (
                <div
                  className="absolute inset-0 rounded-full animate-ping opacity-20 pointer-events-none"
                  style={{ borderColor: agent.color, border: `2px solid ${agent.color}` }}
                />
              )}
            </div>
          </div>
        );
      })}

      {/* HUD: top bar */}
      <div className="absolute top-3 right-4 flex items-center gap-3 text-xs text-white/30 font-mono">
        <span>🇲🇽 CDMX {timeStr}</span>
        <span className="opacity-50">|</span>
        <span>{agents.length} agentes online</span>
      </div>

      {/* Legend */}
      <div className="absolute bottom-4 left-4 flex items-center gap-4 text-xs text-white/25">
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-green-400" style={{ boxShadow: '0 0 6px #27AE60' }} />
          <span>Disponible</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-yellow-400" style={{ boxShadow: '0 0 6px #F39C12' }} />
          <span>Escribiendo</span>
        </div>
      </div>

      {/* Fractal watermark */}
      <div className="absolute bottom-4 right-4 text-xs text-white/10 font-mono">
        Fractal MX © 2026
      </div>
    </div>
  );
}
