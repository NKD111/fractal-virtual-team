'use client';

interface Agent {
  slug: string;
  name: string;
  role: string;
  color: string;
  emoji: string;
}

interface AgentGridProps {
  agents: Agent[];
  activeAgent: string;
  statuses: Record<string, string>;
  onSelect: (slug: string) => void;
}

export default function AgentGrid({ agents, activeAgent, statuses, onSelect }: AgentGridProps) {
  return (
    <div className="grid grid-cols-2 gap-3 p-4">
      {agents.map(agent => {
        const isActive = activeAgent === agent.slug;
        const status = statuses[agent.slug] || 'idle';
        const isBusy = status === 'typing' || status === 'busy';

        return (
          <button
            key={agent.slug}
            onClick={() => onSelect(agent.slug)}
            className={`flex flex-col items-center gap-2 p-4 rounded-2xl border transition-all text-center ${
              isActive ? 'border-white/20 bg-white/8' : 'border-transparent hover:border-white/10 hover:bg-white/4'
            }`}
          >
            <div
              className="w-14 h-14 rounded-full flex items-center justify-center text-2xl border-2 relative"
              style={{
                borderColor: agent.color,
                boxShadow: isActive ? `0 0 18px ${agent.color}80` : 'none'
              }}
            >
              {agent.emoji}
              <span
                className="absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-dark-900"
                style={{
                  backgroundColor: isBusy ? '#F39C12' : '#27AE60',
                  boxShadow: `0 0 6px ${isBusy ? '#F39C12' : '#27AE60'}`
                }}
              />
            </div>
            <div>
              <p className="text-sm font-semibold text-white">{agent.name}</p>
              <p className="text-xs text-white/40">{isBusy ? '✍️ activo' : agent.role}</p>
            </div>
          </button>
        );
      })}
    </div>
  );
}
