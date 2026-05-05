// frontend/app/client/[token]/page.tsx
// Mini-Office read-only para clientes externos. Acceso vía token firmado.
'use client';
import { useEffect, useState } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

type Portal = {
  client_name: string;
  projects: Array<{ id: string; name: string; status: string; deadline?: string }>;
  tasks: Array<{ id: string; brief: string; status: string; agent_assigned: string; image_url?: string; completed_at?: string }>;
  assigned_agent: string;
};

export default function ClientPortalPage({ params }: { params: { token: string } }) {
  const [data, setData] = useState<Portal | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState('');
  const [chat, setChat] = useState<Array<{ role: 'user' | 'agent'; text: string }>>([]);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    fetch(`${API_URL}/api/portal/${params.token}`)
      .then(r => r.json())
      .then(j => { if (j.error) setError(j.error); else setData(j); })
      .catch(e => setError(e.message));
  }, [params.token]);

  if (error) return (
    <div style={{ minHeight: '100vh', background: '#0a0a14', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ background: '#1a1a2e', padding: 32, borderRadius: 12, maxWidth: 420, textAlign: 'center' }}>
        <div style={{ fontSize: 40 }}>🔒</div>
        <h2>Acceso no válido</h2>
        <p style={{ color: '#888' }}>{error}</p>
      </div>
    </div>
  );
  if (!data) return <div style={{ minHeight: '100vh', background: '#0a0a14', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Cargando…</div>;

  async function send() {
    const text = msg.trim();
    if (!text || sending) return;
    setSending(true);
    setChat(c => [...c, { role: 'user', text }]);
    setMsg('');
    try {
      const r = await fetch(`${API_URL}/api/embed/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          visitor_id: `portal-${params.token}`,
          agency: 'fractal-mx',
          source_url: window.location.href,
          message: text,
          conversation: chat.map(m => ({ role: m.role === 'user' ? 'user' : 'bot', text: m.text }))
        })
      });
      const j = await r.json();
      setChat(c => [...c, { role: 'agent', text: j.reply || 'Recibido.' }]);
    } catch (e: any) {
      setChat(c => [...c, { role: 'agent', text: 'Hubo un detalle, intenta de nuevo.' }]);
    } finally { setSending(false); }
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a14', color: '#fff', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ maxWidth: 960, margin: '0 auto', padding: '32px 20px' }}>
        <header style={{ borderBottom: '1px solid #2a2a3a', paddingBottom: 18, marginBottom: 24 }}>
          <div style={{ color: '#B14FFF', fontSize: 11, letterSpacing: '0.2em', fontWeight: 600 }}>FRACTAL MX · CLIENT PORTAL</div>
          <h1 style={{ fontSize: 28, margin: '6px 0 4px' }}>Bienvenido, {data.client_name}</h1>
          <div style={{ color: '#888', fontSize: 13 }}>Tu agente asignado: <strong style={{ color: '#FF6B9D' }}>{data.assigned_agent.toUpperCase()}</strong></div>
        </header>

        <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 28 }}>
          {/* Proyectos + Tareas */}
          <div>
            <h3 style={{ color: '#FFCE5C', fontSize: 13, letterSpacing: '0.1em', marginBottom: 10 }}>📋 PROYECTOS ACTIVOS</h3>
            {data.projects.length === 0 && <div style={{ color: '#666', fontSize: 13 }}>Sin proyectos activos.</div>}
            {data.projects.map(p => (
              <div key={p.id} style={{ background: '#1a1a2e', padding: 14, borderRadius: 8, marginBottom: 8, border: '1px solid #2a2a3a' }}>
                <div style={{ fontWeight: 600 }}>{p.name}</div>
                <div style={{ color: '#888', fontSize: 12, marginTop: 4 }}>
                  Status: {p.status}{p.deadline && ` · deadline ${new Date(p.deadline).toLocaleDateString('es-MX')}`}
                </div>
              </div>
            ))}

            <h3 style={{ color: '#FFCE5C', fontSize: 13, letterSpacing: '0.1em', margin: '24px 0 10px' }}>🎯 ENTREGABLES RECIENTES</h3>
            {data.tasks.length === 0 && <div style={{ color: '#666', fontSize: 13 }}>Sin entregas aún.</div>}
            {data.tasks.map(t => (
              <div key={t.id} style={{ background: '#1a1a2e', padding: 14, borderRadius: 8, marginBottom: 8, border: '1px solid #2a2a3a' }}>
                <div style={{ fontSize: 13, lineHeight: 1.4 }}>{t.brief}</div>
                <div style={{ color: '#888', fontSize: 11, marginTop: 6 }}>
                  {t.agent_assigned?.toUpperCase()} · {t.status}{t.completed_at && ' · ' + new Date(t.completed_at).toLocaleDateString('es-MX')}
                </div>
                {t.image_url && (
                  <img src={t.image_url} alt="entregable" style={{ marginTop: 10, maxWidth: '100%', borderRadius: 6, border: '1px solid #2a2a3a' }} />
                )}
              </div>
            ))}
          </div>

          {/* Chat con el agente */}
          <div>
            <h3 style={{ color: '#FFCE5C', fontSize: 13, letterSpacing: '0.1em', marginBottom: 10 }}>💬 HABLA CON {data.assigned_agent.toUpperCase()}</h3>
            <div style={{ background: '#1a1a2e', borderRadius: 8, height: 420, display: 'flex', flexDirection: 'column', border: '1px solid #2a2a3a' }}>
              <div style={{ flex: 1, overflowY: 'auto', padding: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {chat.length === 0 && <div style={{ color: '#666', fontSize: 12, textAlign: 'center', marginTop: 60 }}>Escribe tu pregunta o feedback abajo.</div>}
                {chat.map((m, i) => (
                  <div key={i} style={{
                    alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
                    background: m.role === 'user' ? '#B14FFF' : '#2a2a3a',
                    color: '#fff', padding: '8px 12px', borderRadius: 12, maxWidth: '85%', fontSize: 13, lineHeight: 1.4
                  }}>{m.text}</div>
                ))}
                {sending && <div style={{ color: '#B14FFF', alignSelf: 'flex-start', fontSize: 18, padding: '4px 10px' }}>● ● ●</div>}
              </div>
              <div style={{ padding: 10, borderTop: '1px solid #2a2a3a', display: 'flex', gap: 6 }}>
                <input
                  value={msg}
                  onChange={e => setMsg(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); send(); } }}
                  placeholder="Mensaje…"
                  style={{ flex: 1, background: '#0a0a14', border: '1px solid #2a2a3a', borderRadius: 18, padding: '10px 14px', color: '#fff', fontSize: 13, outline: 'none', fontFamily: 'inherit' }}
                />
                <button onClick={send} disabled={!msg.trim() || sending} style={{ background: msg.trim() && !sending ? '#B14FFF' : '#333', color: '#fff', border: 'none', width: 38, height: 38, borderRadius: '50%', cursor: 'pointer' }}>➤</button>
              </div>
            </div>
          </div>
        </div>

        <footer style={{ marginTop: 40, textAlign: 'center', color: '#444', fontSize: 11 }}>
          Powered by Fractal MX Virtual Team
        </footer>
      </div>
    </div>
  );
}
