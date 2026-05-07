'use client';
import { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

type Agent = { name: string; color: string; role: string };
type Msg = {
  role: 'user' | 'assistant';
  content: string;
  agent?: string;
  timestamp: string;
  channel?: 'web' | 'whatsapp' | string;
};

export default function ChatPanel({ agent, userId, onClose }: { agent: Agent; userId: string; onClose: () => void }) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [waOnline, setWaOnline] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const socketRef = useRef<Socket | null>(null);

  // ── Cargar historial inicial ───────────────────────────────────────────────
  useEffect(() => {
    if (!userId) return;
    fetch(`${API_URL}/api/conversations/${userId}/${agent.name.toLowerCase()}`)
      .then(r => r.json())
      .then(d => setMessages((d.messages || []).map((m: any) => ({
        role: m.role,
        content: m.content,
        agent: m.agent_name,
        timestamp: m.created_at,
        channel: m.metadata?.channel || 'web'
      }))))
      .catch(() => {});
  }, [agent.name, userId]);

  // ── Socket.io: recibir mensajes de WhatsApp en tiempo real ────────────────
  // Cuando Neiky escribe desde WA, el mensaje aparece aquí instantáneamente.
  // Cuando Mariana responde por WA, la respuesta también aparece aquí.
  useEffect(() => {
    if (agent.name.toLowerCase() !== 'mariana') return;

    const socket: Socket = io(API_URL, { transports: ['websocket', 'polling'] });
    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('[ChatPanel] socket conectado:', socket.id);
      setWaOnline(true);
    });

    socket.on('disconnect', () => setWaOnline(false));

    socket.on('wa_message', (ev: any) => {
      // Solo mostrar mensajes de Mariana (o el agente activo)
      if (ev.agent && ev.agent !== agent.name.toLowerCase() && ev.direction === 'out') return;

      const msg: Msg = {
        role: ev.direction === 'in' ? 'user' : 'assistant',
        content: ev.text || '',
        agent: ev.direction === 'out' ? ev.from : undefined,
        timestamp: new Date(ev.ts || Date.now()).toISOString(),
        channel: ev.channel || 'whatsapp'
      };

      setMessages(prev => {
        // Evitar duplicados (mismo texto en los últimos 3 mensajes)
        const last3 = prev.slice(-3);
        if (last3.some(m => m.content === msg.content && Math.abs(
          new Date(m.timestamp).getTime() - new Date(msg.timestamp).getTime()
        ) < 5000)) return prev;
        return [...prev, msg];
      });
    });

    return () => {
      socket.close();
      socketRef.current = null;
      setWaOnline(false);
    };
  }, [agent.name]);

  // ── Auto-scroll ──────────────────────────────────────────────────────────
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  // ── Enviar desde web ────────────────────────────────────────────────────
  async function send() {
    const text = input.trim();
    if (!text) return;
    setMessages(prev => [...prev, {
      role: 'user', content: text,
      timestamp: new Date().toISOString(), channel: 'web'
    }]);
    setInput(''); setLoading(true);
    try {
      const r = await fetch(`${API_URL}/api/unified-message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channel: 'web', identifier: userId,
          message: text, agentName: agent.name.toLowerCase()
        })
      });
      const d = await r.json();
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: d.text || d.response || '(sin respuesta)',
        agent: agent.name.toLowerCase(),
        timestamp: new Date().toISOString(),
        channel: 'web'
      }]);
    } catch (e: any) {
      setMessages(prev => [...prev, {
        role: 'assistant', content: `Error: ${e.message}`,
        timestamp: new Date().toISOString(), channel: 'web'
      }]);
    } finally { setLoading(false); }
  }

  const isMariana = agent.name.toLowerCase() === 'mariana';

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(15,25,35,0.6)',
      backdropFilter: 'blur(8px)',
      display: 'flex', justifyContent: 'flex-end'
    }}>
      <div style={{
        width: 480, height: '100vh', background: '#0F1923',
        borderLeft: '1px solid rgba(177,79,255,0.3)',
        display: 'flex', flexDirection: 'column',
        fontFamily: 'system-ui, monospace'
      }}>
        {/* Header */}
        <div style={{
          padding: 20, borderBottom: `2px solid ${agent.color}`,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center'
        }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <div style={{
              width: 44, height: 44, borderRadius: '50%', background: agent.color,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontWeight: 700, fontSize: 18, color: '#fff'
            }}>
              {agent.name?.[0]?.toUpperCase()}
            </div>
            <div>
              <div style={{ color: '#fff', fontSize: 16, fontWeight: 600, letterSpacing: '0.1em' }}>
                {agent.name?.toUpperCase()}
              </div>
              <div style={{ color: '#888', fontSize: 12 }}>{agent.role}</div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {/* Badge WhatsApp sync */}
            {isMariana && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 5,
                padding: '4px 10px', borderRadius: 20,
                background: waOnline ? 'rgba(37,211,102,0.15)' : 'rgba(255,255,255,0.05)',
                border: `1px solid ${waOnline ? '#25D366' : 'rgba(255,255,255,0.1)'}`,
                fontSize: 10, color: waOnline ? '#25D366' : '#666',
                fontWeight: 600, letterSpacing: '0.05em'
              }}>
                <span style={{
                  width: 6, height: 6, borderRadius: '50%',
                  background: waOnline ? '#25D366' : '#555',
                  display: 'inline-block',
                  boxShadow: waOnline ? '0 0 6px #25D366' : 'none'
                }} />
                WhatsApp {waOnline ? 'sincronizado' : 'offline'}
              </div>
            )}
            <button onClick={onClose} style={{
              background: 'transparent', border: 'none',
              color: '#888', fontSize: 28, cursor: 'pointer'
            }}>×</button>
          </div>
        </div>

        {/* Mensajes */}
        <div style={{
          flex: 1, overflow: 'auto', padding: 20,
          display: 'flex', flexDirection: 'column', gap: 12
        }}>
          {messages.length === 0 && (
            <div style={{ color: '#666', textAlign: 'center', marginTop: 40, fontSize: 13 }}>
              Sin conversación previa. Mándale algo a {agent.name}.
              {isMariana && (
                <div style={{ marginTop: 8, color: '#444', fontSize: 11 }}>
                  Los mensajes de WhatsApp aparecen aquí en tiempo real 📱
                </div>
              )}
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} style={{
              maxWidth: '80%', padding: '12px 16px', borderRadius: 12,
              color: '#fff', fontSize: 14, lineHeight: 1.5,
              alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
              background: m.role === 'user' ? '#B14FFF' : '#1a2535',
              borderLeft: `3px solid ${m.role === 'user' ? '#B14FFF' : agent.color}`,
              position: 'relative'
            }}>
              {/* Canal badge */}
              {m.channel && m.channel !== 'web' && (
                <span style={{
                  position: 'absolute', top: -8, right: 8,
                  background: '#25D366', color: '#fff',
                  fontSize: 9, padding: '2px 6px', borderRadius: 8,
                  fontWeight: 700, letterSpacing: '0.05em'
                }}>
                  WA
                </span>
              )}
              {m.content}
              <div style={{
                fontSize: 10, color: 'rgba(255,255,255,0.5)',
                marginTop: 6, textAlign: 'right'
              }}>
                {new Date(m.timestamp).toLocaleTimeString('es-MX', {
                  hour: '2-digit', minute: '2-digit'
                })}
              </div>
            </div>
          ))}
          {loading && (
            <div style={{
              alignSelf: 'flex-start', padding: '12px 16px',
              color: '#B14FFF', fontSize: 18
            }}>● ● ●</div>
          )}
          <div ref={endRef} />
        </div>

        {/* Input */}
        <div style={{
          padding: 20, borderTop: '1px solid rgba(177,79,255,0.2)',
          display: 'flex', flexDirection: 'column', gap: 8
        }}>
          {isMariana && (
            <div style={{
              fontSize: 10, color: '#555', textAlign: 'center',
              letterSpacing: '0.05em'
            }}>
              Mismo Mariana · Web + WhatsApp unificados
            </div>
          )}
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              value={input} onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !loading && send()}
              placeholder={`Mensaje a ${agent.name}...`}
              style={{
                flex: 1, padding: '12px 16px', borderRadius: 24,
                background: '#1a2535',
                border: '1px solid rgba(177,79,255,0.3)',
                color: '#fff', fontSize: 14, outline: 'none',
                fontFamily: 'inherit'
              }}
            />
            <button
              onClick={send}
              disabled={!input.trim() || loading}
              style={{
                width: 44, height: 44, borderRadius: '50%',
                border: 'none', color: '#fff', fontSize: 18,
                cursor: 'pointer',
                background: input.trim() && !loading ? agent.color : '#333'
              }}
            >➤</button>
          </div>
        </div>
      </div>
    </div>
  );
}
