'use client';
import { useEffect, useRef, useState } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

type Agent = { name: string; color: string; role: string };
type Msg = { role: 'user' | 'assistant'; content: string; agent?: string; timestamp: string };

export default function ChatPanel({ agent, userId, onClose }: { agent: Agent; userId: string; onClose: () => void }) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!userId) return;
    fetch(`${API_URL}/api/conversations/${userId}/${agent.name.toLowerCase()}`)
      .then(r => r.json())
      .then(d => setMessages((d.messages || []).map((m: any) => ({
        role: m.role, content: m.content, agent: m.agent_name,
        timestamp: m.created_at
      }))))
      .catch(() => {});
  }, [agent.name, userId]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  async function send() {
    const text = input.trim();
    if (!text) return;
    setMessages(prev => [...prev, { role: 'user', content: text, timestamp: new Date().toISOString() }]);
    setInput(''); setLoading(true);
    try {
      const r = await fetch(`${API_URL}/api/unified-message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channel: 'web', identifier: userId, message: text, agentName: agent.name.toLowerCase()
        })
      });
      const d = await r.json();
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: d.text || d.response || '(sin respuesta)',
        agent: agent.name.toLowerCase(),
        timestamp: new Date().toISOString()
      }]);
    } catch (e: any) {
      setMessages(prev => [...prev, { role: 'assistant', content: `Error: ${e.message}`, timestamp: new Date().toISOString() }]);
    } finally { setLoading(false); }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(15,25,35,0.6)', backdropFilter: 'blur(8px)', display: 'flex', justifyContent: 'flex-end' }}>
      <div style={{ width: 480, height: '100vh', background: '#0F1923', borderLeft: '1px solid rgba(177,79,255,0.3)', display: 'flex', flexDirection: 'column', fontFamily: 'system-ui, monospace' }}>
        <div style={{ padding: 20, borderBottom: `2px solid ${agent.color}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <div style={{ width: 44, height: 44, borderRadius: '50%', background: agent.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 18, color: '#fff' }}>
              {agent.name?.[0]?.toUpperCase()}
            </div>
            <div>
              <div style={{ color: '#fff', fontSize: 16, fontWeight: 600, letterSpacing: '0.1em' }}>{agent.name?.toUpperCase()}</div>
              <div style={{ color: '#888', fontSize: 12 }}>{agent.role}</div>
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: '#888', fontSize: 28, cursor: 'pointer' }}>×</button>
        </div>

        <div style={{ flex: 1, overflow: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {messages.length === 0 && (
            <div style={{ color: '#666', textAlign: 'center', marginTop: 40, fontSize: 13 }}>
              Sin conversación previa. Mándale algo a {agent.name}.
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} style={{
              maxWidth: '80%', padding: '12px 16px', borderRadius: 12,
              color: '#fff', fontSize: 14, lineHeight: 1.5,
              alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
              background: m.role === 'user' ? '#B14FFF' : '#1a2535',
              borderLeft: `3px solid ${m.role === 'user' ? '#B14FFF' : agent.color}`
            }}>
              {m.content}
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', marginTop: 6, textAlign: 'right' }}>
                {new Date(m.timestamp).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
              </div>
            </div>
          ))}
          {loading && (
            <div style={{ alignSelf: 'flex-start', padding: '12px 16px', color: '#B14FFF', fontSize: 18 }}>● ● ●</div>
          )}
          <div ref={endRef} />
        </div>

        <div style={{ padding: 20, borderTop: '1px solid rgba(177,79,255,0.2)', display: 'flex', gap: 8 }}>
          <input
            value={input} onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !loading && send()}
            placeholder={`Mensaje a ${agent.name}...`}
            style={{ flex: 1, padding: '12px 16px', borderRadius: 24, background: '#1a2535', border: '1px solid rgba(177,79,255,0.3)', color: '#fff', fontSize: 14, outline: 'none', fontFamily: 'inherit' }}
          />
          <button
            onClick={send} disabled={!input.trim() || loading}
            style={{ width: 44, height: 44, borderRadius: '50%', border: 'none', color: '#fff', fontSize: 18, cursor: 'pointer', background: input.trim() && !loading ? agent.color : '#333' }}
          >➤</button>
        </div>
      </div>
    </div>
  );
}
