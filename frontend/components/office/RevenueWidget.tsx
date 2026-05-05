// frontend/components/office/RevenueWidget.tsx
// Lista compacta de productos del Revenue Engine + botón "kickoff" para que
// Mariana arranque uno nuevo. Polls cada 60s.

'use client';
import { useEffect, useState } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

type Product = {
  id: string;
  kind: string;
  title: string;
  status: string;
  price_usd: number;
  cover_url?: string;
  landing_url?: string;
  council_score?: number;
  published_at?: string;
};

const STATUS_COLOR: Record<string, string> = {
  ideation:   '#888',
  proposed:   '#FFCE5C',
  approved:   '#86efac',
  rejected:   '#f87171',
  producing:  '#B14FFF',
  qc:         '#FF6B9D',
  publishing: '#fb923c',
  live:       '#22c55e',
  paused:     '#94a3b8'
};

export default function RevenueWidget() {
  const [products, setProducts] = useState<Product[]>([]);
  const [open, setOpen] = useState(false);
  const [kicking, setKicking] = useState(false);
  const [niche, setNiche] = useState('');

  useEffect(() => {
    let cancel = false;
    const load = async () => {
      try {
        const r = await fetch(`${API_URL}/api/revenue/products`);
        if (!r.ok) return;
        const j = await r.json();
        if (!cancel) setProducts(j.products || []);
      } catch {}
    };
    load();
    const t = setInterval(load, 60000);
    return () => { cancel = true; clearInterval(t); };
  }, []);

  async function kickoff() {
    setKicking(true);
    try {
      await fetch(`${API_URL}/api/revenue/kickoff`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ niche: niche.trim() || null, kind: 'ebook' })
      });
      setNiche('');
    } finally { setKicking(false); }
  }

  const live = products.filter(p => p.status === 'live').length;
  const inProgress = products.filter(p => !['live','rejected','paused'].includes(p.status)).length;

  return (
    <>
      <button
        onClick={() => setOpen(o => !o)}
        title="Revenue Engine · productos automáticos"
        style={{
          position: 'absolute', bottom: 102, right: 162,
          padding: '0 12px', height: 36, borderRadius: 18,
          background: live > 0 ? 'rgba(34,197,94,0.95)' : 'rgba(15,15,25,0.85)',
          border: `1px solid ${live > 0 ? '#22c55e' : 'rgba(177,79,255,0.4)'}`,
          color: '#fff', fontSize: 13, cursor: 'pointer', fontWeight: 600,
          display: 'flex', alignItems: 'center', gap: 6,
          backdropFilter: 'blur(8px)', fontFamily: 'system-ui, monospace'
        }}>
        <span style={{ fontSize: 14 }}>💰</span>
        Revenue {live > 0 ? `· ${live} live` : inProgress > 0 ? `· ${inProgress} en pipeline` : ''}
      </button>

      {open && (
        <div style={{
          position: 'absolute', bottom: 144, right: 12,
          width: 380, maxHeight: '70vh', overflowY: 'auto',
          background: 'rgba(15,15,25,0.97)',
          border: '1px solid rgba(34,197,94,0.5)',
          borderRadius: 12, padding: 16,
          color: '#fff', fontSize: 12, fontFamily: 'system-ui, monospace',
          backdropFilter: 'blur(10px)', zIndex: 1500,
          boxShadow: '0 10px 40px rgba(0,0,0,0.6)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <strong style={{ color: '#22c55e', letterSpacing: '0.1em' }}>💰 REVENUE ENGINE</strong>
            <button onClick={() => setOpen(false)} style={{ background: 'transparent', border: 'none', color: '#888', fontSize: 18, cursor: 'pointer' }}>×</button>
          </div>

          {/* Kickoff */}
          <div style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.3)', borderRadius: 8, padding: 10, marginBottom: 12 }}>
            <div style={{ fontSize: 11, color: '#86efac', marginBottom: 6, fontWeight: 600 }}>NUEVO PRODUCTO</div>
            <div style={{ display: 'flex', gap: 6 }}>
              <input
                value={niche}
                onChange={e => setNiche(e.target.value)}
                placeholder="Nicho (opcional)"
                style={{ flex: 1, background: '#0a0a14', border: '1px solid #2a2a3a', borderRadius: 6, padding: '6px 10px', color: '#fff', fontSize: 12, fontFamily: 'inherit' }}
              />
              <button
                onClick={kickoff}
                disabled={kicking}
                style={{ background: kicking ? '#666' : '#22c55e', color: '#fff', border: 'none', padding: '6px 14px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: kicking ? 'default' : 'pointer' }}
              >{kicking ? '…' : '🚀 Kickoff'}</button>
            </div>
            <div style={{ fontSize: 9, color: '#666', marginTop: 4 }}>Mariana arranca pipeline 7 fases automático</div>
          </div>

          {products.length === 0 && (
            <div style={{ color: '#666', textAlign: 'center', padding: '24px 0', fontSize: 12 }}>
              Sin productos aún. Dale 🚀 Kickoff arriba.
            </div>
          )}

          {products.map(p => (
            <div key={p.id} style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 6, padding: 10, marginBottom: 6, display: 'flex', gap: 10 }}>
              {p.cover_url && <img src={p.cover_url} style={{ width: 48, height: 48, borderRadius: 4, objectFit: 'cover' }} />}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6 }}>
                  <div style={{ color: '#fff', fontSize: 12, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {p.title || '(sin título)'}
                  </div>
                  <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 8, background: STATUS_COLOR[p.status] + '33', color: STATUS_COLOR[p.status], whiteSpace: 'nowrap' }}>
                    {p.status}
                  </span>
                </div>
                <div style={{ color: '#888', fontSize: 10, marginTop: 2 }}>
                  {p.kind} · ${Number(p.price_usd || 19).toFixed(0)} · score {p.council_score || '—'}/10
                </div>
                {p.landing_url && (
                  <a href={p.landing_url} target="_blank" rel="noopener noreferrer" style={{ color: '#22c55e', fontSize: 10, textDecoration: 'none' }}>
                    Ver landing →
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
