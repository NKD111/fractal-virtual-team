'use client';
import { useEffect, useState } from 'react';
import ChatPanel from '@/components/ChatPanel';
import StatsBar from '@/components/StatsBar';
import OfficeCanvas from '@/components/OfficeCanvas';
import { useSocket } from '@/hooks/useSocket';

const AGENTS = [
  { slug: 'mariana', name: 'Mariana', role: 'Hub Coordinator', color: '#FF6B9D', emoji: '🌸' },
  { slug: 'diana',   name: 'Diana',   role: 'Client Manager',  color: '#9B59B6', emoji: '💼' },
  { slug: 'alex',    name: 'Alex',    role: 'Content Creator', color: '#3498DB', emoji: '🎬' },
  { slug: 'carlos',  name: 'Carlos',  role: 'Jr Designer',     color: '#E67E22', emoji: '🎨' },
  { slug: 'sofia',   name: 'Sofia',   role: 'Project Manager', color: '#27AE60', emoji: '📊' },
  { slug: 'lucas',   name: 'Lucas',   role: 'Analytics',       color: '#F39C12', emoji: '📈' },
  { slug: 'diego',   name: 'Diego',   role: 'Sr Designer',     color: '#34495E', emoji: '🖌️' },
  { slug: 'max',     name: 'Max',     role: 'Video Editor',    color: '#E74C3C', emoji: '🎞️' },
  { slug: 'valentina', name: 'Valentina', role: 'Art Director', color: '#8E44AD', emoji: '👁️' },
  { slug: 'roberto', name: 'Roberto', role: 'CFO',             color: '#16A085', emoji: '💰' },
];

export default function Home() {
  const [activeAgent, setActiveAgent] = useState<string>('mariana');
  const [view, setView] = useState<'office' | 'chat'>('office');
  const [agentStatuses, setAgentStatuses] = useState<Record<string, string>>({});
  const { socket, isConnected } = useSocket();

  useEffect(() => {
    if (!socket) return;

    socket.on('office:update', ({ agentSlug, animation_state }: any) => {
      setAgentStatuses(prev => ({ ...prev, [agentSlug]: animation_state }));
    });

    socket.on('agent:message', (data: any) => {
      console.log('Agent message:', data);
    });

    return () => {
      socket.off('office:update');
      socket.off('agent:message');
    };
  }, [socket]);

  return (
    <div className="flex flex-col h-screen bg-dark-900 overflow-hidden">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-3 border-b border-white/10 glass">
        <div className="flex items-center gap-3">
          <span className="text-2xl">🌸</span>
          <div>
            <h1 className="font-bold text-white text-lg leading-none">Fractal Virtual Team</h1>
            <p className="text-xs text-white/40">v4.0 — 10 agentes activos 24/7</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${isConnected ? 'status-active' : 'status-offline'}`}></div>
            <span className="text-xs text-white/50">{isConnected ? 'Conectado' : 'Offline'}</span>
          </div>
          <div className="flex gap-1">
            <button onClick={() => setView('office')} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${view === 'office' ? 'bg-white/10 text-white' : 'text-white/40 hover:text-white/60'}`}>
              🏢 Oficina
            </button>
            <button onClick={() => setView('chat')} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${view === 'chat' ? 'bg-white/10 text-white' : 'text-white/40 hover:text-white/60'}`}>
              💬 Chat
            </button>
          </div>
        </div>
      </header>

      {/* Stats bar */}
      <StatsBar agents={AGENTS} statuses={agentStatuses} />

      <div className="flex flex-1 overflow-hidden">
        {/* Left: Agent grid */}
        <aside className="w-72 border-r border-white/10 overflow-y-auto p-3 flex flex-col gap-2">
          {AGENTS.map(agent => (
            <AgentCard
              key={agent.slug}
              agent={agent}
              isActive={activeAgent === agent.slug}
              status={agentStatuses[agent.slug] || 'idle'}
              onClick={() => setActiveAgent(agent.slug)}
            />
          ))}
        </aside>

        {/* Main content */}
        <main className="flex-1 overflow-hidden">
          {view === 'office' ? (
            <OfficeCanvas agents={AGENTS} statuses={agentStatuses} activeAgent={activeAgent} />
          ) : (
            <ChatPanel agent={AGENTS.find(a => a.slug === activeAgent)!} socket={socket} />
          )}
        </main>
      </div>
    </div>
  );
}

function AgentCard({ agent, isActive, status, onClick }: any) {
  const isTyping = status === 'typing';
  const isBusy = status === 'typing' || status === 'busy';

  return (
    <button
      onClick={onClick}
      className={`w-full text-left p-3 rounded-xl border transition-all ${
        isActive
          ? 'border-white/20 bg-white/8'
          : 'border-transparent hover:border-white/10 hover:bg-white/4'
      }`}
    >
      <div className="flex items-center gap-3">
        <div
          className="w-10 h-10 rounded-full flex items-center justify-center text-lg border-2 flex-shrink-0"
          style={{ borderColor: agent.color, boxShadow: isActive ? `0 0 12px ${agent.color}60` : 'none' }}
        >
          {agent.emoji}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-sm text-white">{agent.name}</span>
            <div
              className="w-1.5 h-1.5 rounded-full flex-shrink-0"
              style={{ backgroundColor: isBusy ? '#F39C12' : '#27AE60', boxShadow: `0 0 6px ${isBusy ? '#F39C12' : '#27AE60'}` }}
            />
          </div>
          <p className="text-xs text-white/40 truncate">
            {isTyping ? '✍️ escribiendo...' : agent.role}
          </p>
        </div>
      </div>
    </button>
  );
}
