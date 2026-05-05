// frontend/components/office/TaskInput.tsx
// Caja de texto bottom-center que dispara una tarea hacia el backend.
// Al hacer Enter, POSTea a /api/task/dispatch — el backend orquesta los
// eventos socket que el OfficeScene anima como bolita + bubbles.

'use client';
import { useState } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

export default function TaskInput() {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [hint, setHint] = useState<string | null>(null);

  async function dispatch() {
    const msg = text.trim();
    if (!msg || sending) return;
    setSending(true);
    setHint(null);
    try {
      const r = await fetch(`${API_URL}/api/task/dispatch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: msg })
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        setHint(`Error: ${err.error || r.statusText}`);
      } else {
        setText('');
        setHint('Mariana está procesando…');
        setTimeout(() => setHint(null), 3000);
      }
    } catch (e: any) {
      setHint(`No conecta: ${e.message}`);
    } finally {
      setSending(false);
    }
  }

  return (
    <div style={{
      position: 'absolute',
      bottom: 16,
      left: '50%',
      transform: 'translateX(-50%)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 6,
      width: '100%',
      maxWidth: 580,
      pointerEvents: 'none'
    }}>
      {hint && (
        <div style={{
          background: 'rgba(15,15,25,0.92)',
          border: '1px solid rgba(177,79,255,0.4)',
          color: '#FFCE5C', fontSize: 11, padding: '4px 10px',
          borderRadius: 12, fontFamily: 'system-ui, monospace',
          backdropFilter: 'blur(8px)'
        }}>{hint}</div>
      )}
      <div style={{
        display: 'flex',
        gap: 8,
        background: 'rgba(15,15,25,0.92)',
        borderRadius: 24,
        padding: '6px 6px 6px 16px',
        border: '1px solid rgba(177,79,255,0.4)',
        backdropFilter: 'blur(10px)',
        boxShadow: '0 6px 18px rgba(0,0,0,0.5)',
        pointerEvents: 'auto',
        width: '90%'
      }}>
        <input
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); dispatch(); } }}
          placeholder="Pídele algo a Mariana — ej: 'Necesito un moodboard de neón retro para Vanexpo'"
          disabled={sending}
          style={{
            flex: 1, background: 'transparent', border: 'none', outline: 'none',
            color: '#fff', fontSize: 13, fontFamily: 'system-ui, monospace',
            padding: '8px 0'
          }}
        />
        <button
          onClick={dispatch}
          disabled={sending || !text.trim()}
          style={{
            background: text.trim() && !sending ? '#B14FFF' : '#333',
            color: '#fff', border: 'none',
            width: 38, height: 38, borderRadius: '50%',
            cursor: text.trim() && !sending ? 'pointer' : 'default',
            fontSize: 16, fontWeight: 700,
            display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}
        >➤</button>
      </div>
    </div>
  );
}
