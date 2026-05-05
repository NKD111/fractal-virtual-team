// frontend/components/office/TaskInput.tsx
// Caja de texto bottom-center que dispara una tarea hacia el backend.
// Al hacer Enter, POSTea a /api/task/dispatch — el backend orquesta los
// eventos socket que el OfficeScene anima como bolita + bubbles.

'use client';
import { useState, useRef } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

export default function TaskInput() {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  async function dispatch(extra?: { attachment?: string }) {
    const msg = text.trim();
    if (!msg || sending) return;
    setSending(true);
    setHint(null);
    try {
      const body: any = { message: msg };
      if (extra?.attachment) body.attachment = extra.attachment;
      const r = await fetch(`${API_URL}/api/task/dispatch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
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

  // ── Voice input (hold-to-record) ────────────────────────────────────────
  async function startRec() {
    if (recording) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      chunksRef.current = [];
      rec.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      rec.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        if (blob.size < 1000) { setHint('Audio muy corto'); setRecording(false); return; }
        setHint('Transcribiendo…');
        const reader = new FileReader();
        reader.onloadend = async () => {
          const b64 = String(reader.result || '').split(',')[1];
          try {
            const r = await fetch(`${API_URL}/api/voice/transcribe`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ audio_base64: b64, mime: 'audio/webm' })
            });
            const j = await r.json();
            if (j.text) {
              setText(t => (t ? t + ' ' : '') + j.text.trim());
              setHint(null);
            } else {
              setHint(`Whisper: ${j.error || 'sin texto'}`);
            }
          } catch (e: any) { setHint(`Voice error: ${e.message}`); }
          setRecording(false);
        };
        reader.readAsDataURL(blob);
      };
      mediaRef.current = rec;
      rec.start();
      setRecording(true);
      setHint('🎙️ Grabando — suelta para transcribir');
    } catch (err: any) {
      setHint(`Sin micrófono: ${err.message}`);
    }
  }
  function stopRec() {
    const rec = mediaRef.current;
    if (rec && rec.state === 'recording') rec.stop();
  }

  // ── File drop (image attachment) ────────────────────────────────────────
  async function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { setHint('Solo imágenes por ahora'); return; }
    setHint(`Adjuntando ${file.name}…`);
    const reader = new FileReader();
    reader.onloadend = () => {
      const dataUrl = String(reader.result);
      setText(t => t + (t ? ' ' : '') + `[Imagen adjunta: ${file.name}]`);
      // Dispatch immediately if there's a text base, else hold for user to add context
      setHint(`📎 ${file.name} adjunta — escribe instrucción y envía`);
      // Stash attachment in window so dispatch picks it up
      (window as any).__pendingAttachment = dataUrl;
    };
    reader.readAsDataURL(file);
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
      <div
        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        style={{
          display: 'flex',
          gap: 8,
          background: 'rgba(15,15,25,0.92)',
          borderRadius: 24,
          padding: '6px 6px 6px 16px',
          border: dragOver ? '2px dashed #FFCE5C' : '1px solid rgba(177,79,255,0.4)',
          backdropFilter: 'blur(10px)',
          boxShadow: '0 6px 18px rgba(0,0,0,0.5)',
          pointerEvents: 'auto',
          width: '90%',
          transition: 'border 0.15s'
        }}>
        <input
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); dispatch(); } }}
          placeholder="Pídele a Mariana — texto, voz 🎙️, o arrastra una imagen"
          disabled={sending}
          style={{
            flex: 1, background: 'transparent', border: 'none', outline: 'none',
            color: '#fff', fontSize: 13, fontFamily: 'system-ui, monospace',
            padding: '8px 0'
          }}
        />
        {/* Voice (hold to record) */}
        <button
          onMouseDown={startRec}
          onMouseUp={stopRec}
          onTouchStart={startRec}
          onTouchEnd={stopRec}
          title="Mantén presionado para grabar voz"
          style={{
            background: recording ? '#ef4444' : 'transparent',
            color: '#fff', border: 'none',
            width: 38, height: 38, borderRadius: '50%',
            cursor: 'pointer', fontSize: 16,
            display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}
        >🎙️</button>
        {/* Send */}
        <button
          onClick={() => dispatch()}
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
