// frontend/components/office/PendingsBalloon.tsx
// GBA-style comic-balloon tooltip showing an agent's current pendings.
// Triggered by right-click on the agent sprite.
// Auto-dismiss when cursor leaves the balloon OR another agent is right-clicked.

'use client';
import { useEffect, useState, useRef } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

type Pending = {
  id: string;
  promise_text: string;
  action_type?: string;
  action_target?: string;
  execute_at?: string;
};

export type PendingsTarget = {
  slug: string;
  name: string;
  color: string;
  screenX: number;
  screenY: number;
} | null;

export default function PendingsBalloon({ target, onDismiss }: { target: PendingsTarget; onDismiss: () => void }) {
  const [data, setData] = useState<{ promises: Pending[]; standup_today?: string | null } | null>(null);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Fetch when target changes
  useEffect(() => {
    if (!target) { setData(null); setPage(0); return; }
    setLoading(true);
    setPage(0);
    fetch(`${API_URL}/api/agents/${target.slug}/pendings`)
      .then(r => r.json())
      .then(d => setData({ promises: d.promises || [], standup_today: d.standup_today }))
      .catch(() => setData({ promises: [], standup_today: null }))
      .finally(() => setLoading(false));
  }, [target?.slug]);

  if (!target) return null;

  // Build "pages" of text — standup line first, then 2 promises per page
  const pages: string[] = [];
  if (data?.standup_today) pages.push(`💬 ${data.standup_today}`);
  if (data?.promises?.length) {
    for (let i = 0; i < data.promises.length; i += 2) {
      const chunk = data.promises.slice(i, i + 2)
        .map(p => `• ${p.promise_text}${p.execute_at ? ` (vence ${new Date(p.execute_at).toLocaleDateString('es-MX')})` : ''}`)
        .join('\n');
      pages.push(chunk);
    }
  }
  if (pages.length === 0) pages.push(loading ? 'Cargando…' : 'Sin pendientes activos.');

  const txt = pages[page] || '';
  const hasNext = page < pages.length - 1;

  return (
    <div
      ref={wrapRef}
      onMouseLeave={onDismiss}
      style={{
        position: 'fixed',
        left: target.screenX - 120,
        top: target.screenY - 180,
        width: 260,
        zIndex: 1500,
        pointerEvents: 'auto',
        // GBA Pokémon-style font (loaded via next/font OR system stack fallback)
        fontFamily: '"VT323", "Courier New", "DejaVu Sans Mono", monospace',
        fontWeight: 400,
        fontSize: 18,
        lineHeight: 1.15,
        letterSpacing: '0.5px'
      }}
    >
      {/* Comic balloon body */}
      <div style={{
        background: '#FAFAF6',
        color: '#1a1a14',
        border: '3px solid #1a1a14',
        borderRadius: 18,
        padding: '14px 16px 12px',
        boxShadow: '0 4px 0 #1a1a14, 0 6px 14px rgba(0,0,0,0.45)',
        position: 'relative',
        whiteSpace: 'pre-wrap',
        minHeight: 60
      }}>
        {/* Header w/ agent name */}
        <div style={{
          fontSize: 13,
          color: target.color,
          textShadow: '1px 1px 0 #fff, -1px -1px 0 #fff',
          fontWeight: 700,
          letterSpacing: '1.5px',
          marginBottom: 6,
          textTransform: 'uppercase',
          fontFamily: '"Press Start 2P", "Courier New", monospace'
        }}>
          {target.name}
        </div>
        {/* Body text */}
        <div style={{ minHeight: 40 }}>{txt}</div>
        {/* Page indicator + next arrow */}
        {pages.length > 1 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, paddingTop: 6, borderTop: '1px dashed rgba(0,0,0,0.2)', fontSize: 12 }}>
            <span style={{ color: '#666' }}>{page + 1} / {pages.length}</span>
            {hasNext && (
              <button
                onClick={(e) => { e.stopPropagation(); setPage(p => p + 1); }}
                style={{
                  background: '#1a1a14', color: '#FAFAF6',
                  border: 'none', borderRadius: 8,
                  padding: '4px 10px', fontSize: 14, cursor: 'pointer',
                  fontFamily: 'inherit', letterSpacing: '1px'
                }}
              >▼ MÁS</button>
            )}
            {!hasNext && (
              <button
                onClick={(e) => { e.stopPropagation(); setPage(0); }}
                style={{ background: 'transparent', color: '#999', border: 'none', fontSize: 12, cursor: 'pointer' }}
              >↺ inicio</button>
            )}
          </div>
        )}
        {/* Comic tail pointing down */}
        <div style={{
          position: 'absolute',
          bottom: -16,
          left: 100,
          width: 0,
          height: 0,
          borderLeft: '12px solid transparent',
          borderRight: '12px solid transparent',
          borderTop: '16px solid #1a1a14'
        }} />
        <div style={{
          position: 'absolute',
          bottom: -10,
          left: 104,
          width: 0,
          height: 0,
          borderLeft: '8px solid transparent',
          borderRight: '8px solid transparent',
          borderTop: '12px solid #FAFAF6'
        }} />
      </div>
    </div>
  );
}
