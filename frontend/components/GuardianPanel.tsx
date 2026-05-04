'use client';
import { useState } from 'react';
import { useGuardianStatus, useGuardianServices } from '@/hooks/useGuardian';

const STATUS_COLOR: Record<string, string> = {
  healthy: '#27AE60',
  degraded: '#F39C12',
  unhealthy: '#E74C3C',
  unknown: '#7F8C8D',
};

const SERVICE_EMOJI: Record<string, string> = {
  railway_backend: '🚂',
  supabase: '🟢',
  redis: '🔴',
  anthropic_api: '🤖',
  twilio_whatsapp: '💬',
  vercel_frontend: '▲',
  gmail_api: '📧',
  higgsfield: '🎬',
  recraft: '🎨',
  elevenlabs: '🔊',
};

function formatAgo(iso?: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  const sec = Math.floor((Date.now() - d.getTime()) / 1000);
  if (sec < 60) return `${sec}s`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m`;
  return `${Math.floor(sec / 3600)}h`;
}

export default function GuardianPanel() {
  const [open, setOpen] = useState(false);
  const { status, error: statusError, lastUpdate } = useGuardianStatus(30000);
  const { services } = useGuardianServices(60000);

  const initialized = status?.initialized ?? false;
  const totalServices = status?.total_services ?? services.length;
  const healthyCount = status?.services?.healthy ?? services.filter(s => s.current_status === 'healthy').length;
  const allHealthy = totalServices > 0 && healthyCount === totalServices;

  // Pulse color: green if all healthy, yellow if some degraded, red if any down, gray if not initialized
  const pulseColor = !initialized
    ? '#7F8C8D'
    : allHealthy
    ? '#27AE60'
    : healthyCount > totalServices / 2
    ? '#F39C12'
    : '#E74C3C';

  return (
    <div className="fixed bottom-4 right-4 z-50 font-sans">
      {/* Collapsed pill */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="flex items-center gap-2 px-3 py-2 rounded-full bg-black/70 backdrop-blur-md border border-white/10 hover:bg-black/85 transition-all shadow-lg"
          title="System Guardian"
        >
          <span className="text-base">🛡️</span>
          <span
            className="w-2 h-2 rounded-full"
            style={{ backgroundColor: pulseColor, boxShadow: `0 0 8px ${pulseColor}` }}
          />
          <span className="text-xs font-medium text-white/85">
            {initialized ? `${healthyCount}/${totalServices}` : '—'}
          </span>
        </button>
      )}

      {/* Expanded panel */}
      {open && (
        <div className="w-[340px] rounded-2xl bg-black/85 backdrop-blur-xl border border-white/10 shadow-2xl text-white text-sm overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
            <div className="flex items-center gap-2">
              <span className="text-lg">🛡️</span>
              <div>
                <div className="font-semibold leading-none">System Guardian</div>
                <div className="text-[10px] text-white/40 mt-1">
                  {initialized ? 'NEXUS + ATLAS · 24/7' : 'Inicializando…'}
                </div>
              </div>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="text-white/40 hover:text-white/80 text-lg leading-none px-1"
            >
              ×
            </button>
          </div>

          {/* Error banner */}
          {statusError && (
            <div className="px-4 py-2 bg-red-500/15 text-red-300 text-xs border-b border-red-500/20">
              ⚠️ Sin conexión al backend ({statusError})
            </div>
          )}

          {/* NEXUS + ATLAS quick stats */}
          <div className="grid grid-cols-2 gap-px bg-white/5">
            <div className="px-4 py-3 bg-black/85">
              <div className="text-[10px] text-white/40 uppercase tracking-wider mb-1">🔷 NEXUS</div>
              <div className="text-xs space-y-0.5">
                <div className="flex justify-between">
                  <span className="text-white/60">Alertas hoy</span>
                  <span className="font-mono">{status?.nexus?.alerts_today ?? 0}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-white/60">Subs activas</span>
                  <span className="font-mono">{status?.nexus?.active_subscriptions ?? 0}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-white/60">$ alerts</span>
                  <span className="font-mono">{status?.nexus?.unresolved_financial_alerts ?? 0}</span>
                </div>
              </div>
            </div>
            <div className="px-4 py-3 bg-black/85">
              <div className="text-[10px] text-white/40 uppercase tracking-wider mb-1">🔧 ATLAS</div>
              <div className="text-xs space-y-0.5">
                <div className="flex justify-between">
                  <span className="text-white/60">Tests/h</span>
                  <span className="font-mono">{status?.atlas?.synthetic_tests_last_hour ?? 0}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-white/60">Predictions</span>
                  <span className="font-mono">{status?.atlas?.predictive_alerts_last_24h ?? 0}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-white/60">Reparaciones</span>
                  <span className="font-mono">{status?.atlas?.active_repairs?.length ?? 0}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Services list */}
          <div className="max-h-[280px] overflow-y-auto">
            <div className="px-4 py-2 text-[10px] text-white/40 uppercase tracking-wider border-b border-white/10 sticky top-0 bg-black/85 backdrop-blur-xl">
              Servicios ({healthyCount}/{totalServices} healthy)
            </div>
            {services.length === 0 && (
              <div className="px-4 py-6 text-center text-white/40 text-xs">Cargando servicios…</div>
            )}
            {services.map(svc => {
              const color = STATUS_COLOR[svc.current_status] || STATUS_COLOR.unknown;
              const lastTest = status?.atlas?.last_test_results?.[svc.service_key];
              const responseTime = lastTest?.responseTimeMs ?? svc.last_response_time_ms;
              return (
                <div
                  key={svc.service_key}
                  className="flex items-center gap-3 px-4 py-2 border-b border-white/5 hover:bg-white/5 transition-colors"
                >
                  <span className="text-base w-5 text-center">{SERVICE_EMOJI[svc.service_key] || '⚙️'}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium truncate">{svc.name}</div>
                    <div className="text-[10px] text-white/40 flex gap-2">
                      <span>{svc.type}</span>
                      <span>·</span>
                      <span>P{svc.importance_level}</span>
                      <span>·</span>
                      <span>hace {formatAgo(lastTest?.testedAt || svc.last_checked_at)}</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <div
                      className="text-[10px] font-mono px-1.5 py-0.5 rounded"
                      style={{ backgroundColor: `${color}25`, color }}
                    >
                      {responseTime}ms
                    </div>
                  </div>
                  <span
                    className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ backgroundColor: color, boxShadow: `0 0 6px ${color}` }}
                  />
                </div>
              );
            })}
          </div>

          {/* Footer */}
          <div className="px-4 py-2 text-[10px] text-white/40 border-t border-white/10 flex justify-between">
            <span>Actualizado hace {formatAgo(lastUpdate?.toISOString())}</span>
            <span>Auto-refresh 30s</span>
          </div>
        </div>
      )}
    </div>
  );
}
