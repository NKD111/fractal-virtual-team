'use client';

interface StatsBarProps {
  agents: any[];
  statuses: Record<string, string>;
}

export default function StatsBar({ agents, statuses }: StatsBarProps) {
  const activeCount = agents.filter(a => statuses[a.slug] !== 'offline').length;
  const busyCount = agents.filter(a => statuses[a.slug] === 'typing' || statuses[a.slug] === 'busy').length;

  return (
    <div className="flex items-center gap-6 px-6 py-2 bg-dark-800 border-b border-white/5 text-xs text-white/50">
      <span className="flex items-center gap-1.5">
        <span className="w-1.5 h-1.5 rounded-full bg-green-400 status-active"></span>
        <span>{activeCount} activos</span>
      </span>
      <span className="flex items-center gap-1.5">
        <span className="w-1.5 h-1.5 rounded-full bg-yellow-400"></span>
        <span>{busyCount} ocupados</span>
      </span>
      <span className="flex-1"></span>
      <span>Fractal MX — {new Date().toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' })}</span>
    </div>
  );
}
