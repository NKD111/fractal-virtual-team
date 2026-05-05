// frontend/app/deal/[token]/page.tsx — Deal Room público con e-sign
'use client';
import { useEffect, useState } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

type Deal = {
  token: string;
  client_name: string;
  proposal_html: string;
  total_usd?: number;
  status: string;
  signed_name?: string;
  signed_at?: string;
  expires_at?: string;
};

export default function DealPage({ params }: { params: { token: string } }) {
  const [deal, setDeal] = useState<Deal | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [signingName, setSigningName] = useState('');
  const [signing, setSigning] = useState(false);

  useEffect(() => {
    fetch(`${API_URL}/api/deal-room/${params.token}`)
      .then(r => r.json())
      .then(j => { if (j.error) setError(j.error); else setDeal(j); })
      .catch(e => setError(e.message));
  }, [params.token]);

  async function accept() {
    if (!signingName.trim()) return;
    setSigning(true);
    try {
      const r = await fetch(`${API_URL}/api/deal-room/${params.token}/accept`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signed_name: signingName.trim() })
      });
      if (r.ok) {
        setDeal(d => d ? { ...d, status: 'accepted', signed_name: signingName.trim(), signed_at: new Date().toISOString() } : d);
      }
    } finally { setSigning(false); }
  }

  if (error) return <Wrap><div style={{ textAlign: 'center' }}><div style={{ fontSize: 40 }}>🔒</div><h2>{error}</h2></div></Wrap>;
  if (!deal) return <Wrap>Cargando…</Wrap>;
  const accepted = deal.status === 'accepted';

  return (
    <Wrap>
      <header style={{ borderBottom: '1px solid #eee', paddingBottom: 18, marginBottom: 24 }}>
        <div style={{ color: '#B14FFF', fontSize: 11, letterSpacing: '0.2em', fontWeight: 700 }}>FRACTAL MX · DEAL ROOM</div>
        <h1 style={{ fontSize: 28, margin: '6px 0 4px' }}>Propuesta para {deal.client_name}</h1>
        {deal.total_usd != null && (
          <div style={{ display: 'inline-block', background: '#fafaf6', padding: '6px 14px', borderRadius: 16, fontSize: 13, fontWeight: 600, marginTop: 8 }}>
            Total: ${Number(deal.total_usd).toLocaleString('en-US', { minimumFractionDigits: 2 })} USD
          </div>
        )}
      </header>

      <article style={{ fontSize: 14, lineHeight: 1.6, color: '#1a1a14' }}
               dangerouslySetInnerHTML={{ __html: deal.proposal_html }} />

      {accepted ? (
        <div style={{ marginTop: 32, background: '#dcfce7', border: '1px solid #16a34a', padding: 24, borderRadius: 12, textAlign: 'center' }}>
          <div style={{ fontSize: 40 }}>✅</div>
          <h2 style={{ color: '#15803d', margin: '8px 0' }}>Propuesta aceptada</h2>
          <p style={{ color: '#15803d', margin: 0 }}>Firmado por <strong>{deal.signed_name}</strong> el {new Date(deal.signed_at!).toLocaleString('es-MX')}</p>
          <p style={{ color: '#15803d', fontSize: 12, marginTop: 12 }}>Te contactaremos en menos de 24h con los siguientes pasos.</p>
        </div>
      ) : (
        <div style={{ marginTop: 32, background: '#fafaf6', border: '2px solid #1a1a14', padding: 24, borderRadius: 12 }}>
          <h2 style={{ margin: '0 0 12px', fontSize: 18 }}>¿Aceptas esta propuesta?</h2>
          <p style={{ color: '#666', fontSize: 13, margin: '0 0 16px' }}>Escribe tu nombre completo para firmar y arrancamos.</p>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              value={signingName}
              onChange={e => setSigningName(e.target.value)}
              placeholder="Nombre completo"
              style={{ flex: 1, padding: '12px 14px', border: '1px solid #ddd', borderRadius: 8, fontSize: 14 }}
            />
            <button
              onClick={accept}
              disabled={!signingName.trim() || signing}
              style={{ background: signingName.trim() && !signing ? '#B14FFF' : '#999', color: '#fff', border: 'none', padding: '0 24px', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
            >{signing ? 'Firmando…' : 'Aceptar y firmar →'}</button>
          </div>
        </div>
      )}

      <footer style={{ marginTop: 40, textAlign: 'center', color: '#999', fontSize: 11 }}>
        Powered by Fractal MX Virtual Team
      </footer>
    </Wrap>
  );
}

function Wrap({ children }: any) {
  return (
    <div style={{ minHeight: '100vh', background: '#f5f5f0', padding: '40px 20px', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ maxWidth: 760, margin: '0 auto', background: '#fff', borderRadius: 16, padding: 36, boxShadow: '0 4px 20px rgba(0,0,0,0.06)' }}>
        {children}
      </div>
    </div>
  );
}
