// frontend/components/office/InboxWidget.tsx
// Vista única bottom-right de TODO lo que requiere atención del usuario:
// tareas pendientes de confirmación, promesas que vencen hoy, fallas QC,
// alertas de NEXUS. Polls /api/inbox cada 20s.

'use client';
import { useEffect, useState } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

type Inbox = {
  tasks_awaiting: Array<{ id: string; brief: string; agent_assigned: string; created_at: string }>;
  promises_due: Array<{ id: string; promise_text: string; execute_at: string; agent_id: string }>;
  qc_failures: Array<{ task_id: string; agent: string; score: number; issues: string[] }>;
  alerts: Array<{ event_type: string; severity: string; details: any; started_at: string }>;
};

export default function InboxWidget() {
  const [data, setData] = useState<Inbox | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancel = false;
    const load = async () => {
      try {
        const r = await fetch(`${API_URL}/api/inbox`);
        if (!r.ok) return;
        const j = await r.json();
        if (!cancel) setData(j);
      } catch {}
    };
    load();
    const t = setInterval(load, 20000);
    return () => { cancel = true; clearInterval(t); };
  }, []);

  const total = data
    ? (data.tasks_awaiting?.length || 0) + (data.promises_due?.length || 0) + (data.qc_failures?.length || 0) + (data.alerts?.length || 0)
    : 0;

  return (
    <>
      {/* Badge button — bottom-right above edit-mode button */}
      <button
        onClick={() => setOpen(o => !o)}
        title="Inbox · pendientes que requieren tu atención"
        style={{
          position: 'absolute', bottom: 60, right: 12,
          padding: '0 12px', height: 36, borderRadius: 18,
          background: total > 0 ? 'rgba(177,79,255,0.95)' : 'rgba(15,15,25,0.85)',
          border: `1px solid ${total > 0 ? '#B14FFF' : 'rgba(177,79,255,0.4)'}`,
          color: '#fff', fontSize: 13, cursor: 'pointer', fontWeight: 600,
          display: 'flex', alignItems: 'center', gap: 6,
          backdropFilter: 'blur(8px)', fontFamily: 'system-ui, monospace'
        }}>
        <span style={{ fontSize: 14 }}>📬</span>
        Inbox{total > 0 ? ` · ${total}` : ''}
      </button>

      {open && data && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            position: 'absolute', bottom: 102, right: 12,
            width: 360, maxHeight: '70vh', overflowY: 'auto',
            background: 'rgba(15,15,25,0.97)',
            border: '1px solid rgba(177,79,255,0.5)',
            borderRadius: 12, padding: 16,
            color: '#fff', fontSize: 12, fontFamily: 'system-ui, monospace',
            backdropFilter: 'blur(10px)',
            boxShadow: '0 10px 40px rgba(0,0,0,0.6)',
            zIndex: 1500
          }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <strong style={{ color: '#B14FFF', letterSpacing: '0.1em' }}>📬 INBOX</strong>
            <button onClick={() => setOpen(false)} style={{ background: 'transparent', border: 'none', color: '#888', fontSize: 18, cursor: 'pointer' }}>×</button>
          </div>

          {total === 0 && <div style={{ color: '#666', textAlign: 'center', padding: '20px 0' }}>Todo al día. 🌿</div>}

          {data.tasks_awaiting.length > 0 && (
            <Section title="⏳ Tareas esperando tu confirmación" color="#FFCE5C">
              {data.tasks_awaiting.map(t => (
                <Item key={t.id}
                  primary={t.brief?.slice(0, 80) || t.id}
                  secondary={`${t.agent_assigned?.toUpperCase() || ''} · ${rel(t.created_at)}`}
                  href={`${API_URL}/api/task/${t.id}/confirm-page`} />
              ))}
            </Section>
          )}

          {data.promises_due.length > 0 && (
            <Section title="📌 Promesas que vencen hoy" color="#ff6b9d">
              {data.promises_due.map(p => (
                <Item key={p.id}
                  primary={p.promise_text?.slice(0, 80) || ''}
                  secondary={`${p.agent_id?.toUpperCase() || ''} · vence ${new Date(p.execute_at).toLocaleString('es-MX', { hour: '2-digit', minute: '2-digit' })}`} />
              ))}
            </Section>
          )}

          {data.qc_failures.length > 0 && (
            <Section title="⚠️ QC reprobó" color="#f87171">
              {data.qc_failures.map((q, i) => (
                <Item key={i}
                  primary={`${q.agent?.toUpperCase()} · score ${q.score}/10`}
                  secondary={(q.issues || []).slice(0, 2).join('; ')} />
              ))}
            </Section>
          )}

          {data.alerts.length > 0 && (
            <Section title="🔴 Alertas de sistema" color="#ef4444">
              {data.alerts.map((a, i) => (
                <Item key={i}
                  primary={`${a.event_type} · ${a.severity}`}
                  secondary={typeof a.details === 'object' ? JSON.stringify(a.details).slice(0, 80) : ''} />
              ))}
            </Section>
          )}
        </div>
      )}
    </>
  );
}

function Section({ title, color, children }: any) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ color, fontSize: 11, letterSpacing: '0.05em', marginBottom: 6, fontWeight: 700 }}>{title}</div>
      {children}
    </div>
  );
}
function Item({ primary, secondary, href }: any) {
  const inner = (
    <div style={{
      padding: '8px 10px', background: 'rgba(255,255,255,0.04)',
      borderRadius: 6, marginBottom: 4
    }}>
      <div style={{ color: '#fff', lineHeight: 1.3 }}>{primary}</div>
      {secondary && <div style={{ color: '#888', fontSize: 10, marginTop: 2 }}>{secondary}</div>}
    </div>
  );
  return href
    ? <a href={href} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none' }}>{inner}</a>
    : inner;
}
function rel(iso: string) {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 1) return 'hace segundos';
  if (m < 60) return `hace ${m}m`;
  return `hace ${Math.floor(m / 60)}h`;
}
