// frontend/components/office/CostBadge.tsx
// Top-right (junto al HUD) muestra gasto IA del día y del mes.

'use client';
import { useEffect, useState } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

export default function CostBadge() {
  const [cost, setCost] = useState<{ today: number; month: number } | null>(null);
  const [open, setOpen] = useState(false);
  const [breakdown, setBreakdown] = useState<any>(null);

  useEffect(() => {
    let cancel = false;
    const load = async () => {
      try {
        const r = await fetch(`${API_URL}/api/cost/today`);
        if (!r.ok) return;
        const j = await r.json();
        if (cancel) return;
        setBreakdown(j);
        setCost({ today: j.today?.total || 0, month: j.month?.total || 0 });
      } catch {}
    };
    load();
    const t = setInterval(load, 60000);
    return () => { cancel = true; clearInterval(t); };
  }, []);

  if (!cost) return null;

  return (
    <>
      <button
        onClick={() => setOpen(o => !o)}
        title={`Gasto IA · hoy: $${cost.today.toFixed(4)} · mes: $${cost.month.toFixed(2)}`}
        style={{
          position: 'absolute', top: 16, right: 16,
          padding: '6px 12px', borderRadius: 12,
          background: 'rgba(15,15,25,0.85)',
          border: '1px solid rgba(255,206,92,0.4)',
          color: '#FFCE5C', fontSize: 11, cursor: 'pointer',
          fontFamily: 'system-ui, monospace', fontWeight: 600,
          backdropFilter: 'blur(8px)',
          display: 'flex', alignItems: 'center', gap: 6
        }}>
        <span style={{ fontSize: 13 }}>💸</span>
        ${cost.month.toFixed(2)}/mes
      </button>

      {open && breakdown && (
        <div style={{
          position: 'absolute', top: 56, right: 16,
          width: 260, background: 'rgba(15,15,25,0.97)',
          border: '1px solid rgba(255,206,92,0.4)', borderRadius: 10,
          padding: 14, fontFamily: 'system-ui, monospace', fontSize: 11,
          color: '#fff', backdropFilter: 'blur(10px)', zIndex: 1500,
          boxShadow: '0 8px 24px rgba(0,0,0,0.5)'
        }}>
          <div style={{ color: '#FFCE5C', fontWeight: 700, marginBottom: 8 }}>💸 GASTO IA</div>
          <Row label="Hoy" value={`$${(breakdown.today?.total || 0).toFixed(4)}`} sub={`${breakdown.today?.calls || 0} llamadas`} />
          <Row label="Este mes" value={`$${(breakdown.month?.total || 0).toFixed(2)}`} sub={`${breakdown.month?.calls || 0} calls`} highlight />
          <hr style={{ border: 'none', borderTop: '1px solid rgba(255,255,255,0.1)', margin: '10px 0' }} />
          <div style={{ color: '#888', fontSize: 10, marginBottom: 4 }}>POR PROVEEDOR (HOY)</div>
          {Object.entries(breakdown.today?.by_provider || {}).map(([p, v]: any) => (
            <Row key={p} label={p} value={`$${Number(v).toFixed(4)}`} small />
          ))}
        </div>
      )}
    </>
  );
}

function Row({ label, value, sub, highlight, small }: any) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: small ? 'center' : 'baseline', padding: '4px 0' }}>
      <div style={{ color: highlight ? '#fff' : '#aaa', fontSize: small ? 10 : 11 }}>{label}</div>
      <div style={{ color: highlight ? '#FFCE5C' : '#fff', fontWeight: highlight ? 700 : 400, fontSize: small ? 10 : 12 }}>
        {value}{sub && <span style={{ color: '#666', fontSize: 9, marginLeft: 6 }}>{sub}</span>}
      </div>
    </div>
  );
}
