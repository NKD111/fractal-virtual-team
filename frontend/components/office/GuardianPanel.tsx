'use client';
import { useEffect, useState } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

type Mode = 'nexus' | 'atlas';

export default function GuardianPanel({ mode, onClose }: { mode: Mode; onClose: () => void }) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const isNexus = mode === 'nexus';
  const accent = isNexus ? '#3b82f6' : '#f97316';
  const title = isNexus ? 'NEXUS · Strategic Guardian' : 'ATLAS · Technical Engineer';
  const subtitle = isNexus ? 'Health reports & financial alerts' : 'System events & repair logs';

  useEffect(() => {
    setLoading(true);
    const url = isNexus
      ? `${API_URL}/api/guardian/status`
      : `${API_URL}/api/guardian/events?hours=2`;
    fetch(url)
      .then(r => r.json())
      .then(setData)
      .catch(() => setData({ error: 'fetch_failed' }))
      .finally(() => setLoading(false));
  }, [mode]);

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(15,15,25,0.7)', backdropFilter: 'blur(8px)', display: 'flex', justifyContent: 'flex-end' }}>
      <div style={{ width: 480, height: '100vh', background: '#0F1923', borderLeft: `2px solid ${accent}`, display: 'flex', flexDirection: 'column', fontFamily: 'system-ui, monospace' }}>
        <div style={{ padding: 20, borderBottom: `2px solid ${accent}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ color: accent, fontSize: 14, fontWeight: 700, letterSpacing: '0.1em' }}>{title}</div>
            <div style={{ color: '#888', fontSize: 11, marginTop: 4 }}>{subtitle}</div>
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: '#888', fontSize: 28, cursor: 'pointer' }}>×</button>
        </div>

        <div style={{ flex: 1, overflow: 'auto', padding: 20, color: '#fff', fontSize: 13, lineHeight: 1.6 }}>
          {loading && <div style={{ color: '#666', textAlign: 'center', marginTop: 40 }}>Cargando…</div>}

          {!loading && isNexus && data && (
            <NexusBody data={data} accent={accent} />
          )}

          {!loading && !isNexus && data && (
            <AtlasBody data={data} accent={accent} />
          )}
        </div>
      </div>
    </div>
  );
}

function NexusBody({ data, accent }: { data: any; accent: string }) {
  const services = data?.services || {};
  const total = data?.total_services || 0;
  const healthy = services.healthy || 0;
  return (
    <>
      <Section title="Status">
        <Row k="Initialized" v={data.initialized ? '✅ yes' : '❌ no'} />
        <Row k="NEXUS init" v={data.nexus?.initialized ? '✅' : '❌'} />
        <Row k="ATLAS init" v={data.atlas?.initialized ? '✅' : '❌'} />
      </Section>
      <Section title="Service health">
        <Row k="Total monitored" v={String(total)} />
        <Row k="Healthy" v={`${healthy} / ${total}`} accent={accent} />
        <Row k="Synthetic tests / hour" v={String(data.atlas?.synthetic_tests_last_hour || 0)} />
        <Row k="Predictions (24h)" v={String(data.atlas?.predictive_alerts_last_24h || 0)} />
        <Row k="Active repairs" v={String(data.atlas?.active_repairs?.length || 0)} />
      </Section>
      <Section title="Financial">
        <Row k="Alerts today" v={String(data.nexus?.alerts_today || 0)} />
        <Row k="Active subscriptions" v={String(data.nexus?.active_subscriptions || 0)} />
        <Row k="Unresolved $ alerts" v={String(data.nexus?.unresolved_financial_alerts || 0)} />
      </Section>
    </>
  );
}

function AtlasBody({ data, accent }: { data: any; accent: string }) {
  const events = data?.events || [];
  return (
    <>
      <Section title={`Recent events (last ${data?.hours || 2}h)`}>
        {events.length === 0 ? (
          <div style={{ color: '#666' }}>Sin eventos recientes — sistema estable.</div>
        ) : (
          events.slice(0, 30).map((ev: any, i: number) => (
            <div key={i} style={{ padding: 8, borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <span style={{ color: accent, fontSize: 11, fontWeight: 600 }}>{ev.event_type}</span>
                <span style={{ color: '#666', fontSize: 10 }}>
                  {new Date(ev.started_at || ev.created_at).toLocaleTimeString('es-MX')}
                </span>
              </div>
              <div style={{ color: '#aaa', fontSize: 11, marginTop: 3 }}>
                {ev.description || ev.service_key || ev.action_type || '—'}
              </div>
            </div>
          ))
        )}
      </Section>
    </>
  );
}

function Section({ title, children }: { title: string; children: any }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ color: '#666', fontSize: 10, letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: 8 }}>{title}</div>
      <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 8, padding: 12 }}>{children}</div>
    </div>
  );
}

function Row({ k, v, accent }: { k: string; v: string; accent?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 12 }}>
      <span style={{ color: '#888' }}>{k}</span>
      <span style={{ color: accent || '#fff', fontFamily: 'monospace' }}>{v}</span>
    </div>
  );
}
