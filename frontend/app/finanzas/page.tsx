'use client';
import { useEffect, useState } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

interface FinancialSummary {
  mrr: number;
  collected: number;
  pendingCollection: number;
  overdue: number;
  overdueClients: { name: string; amount: number; due: string }[];
}

interface Invoice {
  id: string;
  invoice_number: string;
  status: string;
  total: number;
  subtotal: number;
  tax: number;
  due_date: string;
  created_at: string;
  clients: { name: string; email: string };
}

const STATUS_COLORS: Record<string, string> = {
  draft: '#8888AA',
  sent: '#3498DB',
  paid: '#27AE60',
  overdue: '#E74C3C',
  cancelled: '#555'
};

export default function FinanzasPage() {
  const [summary, setSummary] = useState<FinancialSummary | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [pl, setPl] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAll();
  }, []);

  async function fetchAll() {
    setLoading(true);
    try {
      const [s, i, p] = await Promise.all([
        fetch(`${API}/api/financial/summary`).then(r => r.json()),
        fetch(`${API}/api/financial/invoices?limit=20`).then(r => r.json()),
        fetch(`${API}/api/financial/pl`).then(r => r.json())
      ]);
      if (s.success) setSummary(s.summary);
      if (i.success) setInvoices(i.invoices);
      if (p.success) setPl(p);
    } catch (e) { console.error(e); }
    setLoading(false);
  }

  async function markPaid(id: string) {
    await fetch(`${API}/api/financial/invoices/${id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'paid' })
    });
    fetchAll();
  }

  const fmt = (n: number) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(n);

  return (
    <div className="min-h-screen bg-dark-900 text-white p-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-8">
        <div className="w-12 h-12 rounded-full flex items-center justify-center text-2xl border-2"
          style={{ borderColor: '#16A085', boxShadow: '0 0 16px #16A08560', backgroundColor: '#16A08518' }}>
          💰
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white">Roberto · CFO Dashboard</h1>
          <p className="text-white/40 text-sm">Sistema Financiero Fractal MX</p>
        </div>
        <button onClick={fetchAll} className="ml-auto px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-sm hover:bg-white/10 transition-all">
          🔄 Actualizar
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="text-white/40">Cargando datos financieros...</div>
        </div>
      ) : (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <KPICard label="MRR del Mes" value={fmt(summary?.mrr || 0)} icon="📈" color="#27AE60" />
            <KPICard label="Cobrado" value={fmt(summary?.collected || 0)} icon="✅" color="#16A085" />
            <KPICard label="Por Cobrar" value={fmt(summary?.pendingCollection || 0)} icon="⏳" color="#F39C12" />
            <KPICard label="Vencido" value={fmt(summary?.overdue || 0)} icon="🚨" color="#E74C3C"
              alert={summary?.overdue ? summary.overdue > 0 : false} />
          </div>

          {/* P&L Strip */}
          {pl && (
            <div className="glass rounded-2xl p-5 mb-8 border border-white/10">
              <h2 className="text-sm font-semibold text-white/50 uppercase tracking-wider mb-4">
                P&L · {pl.period}
              </h2>
              <div className="flex flex-wrap gap-8">
                <PLItem label="Ingresos" value={fmt(pl.pl.income)} positive />
                <PLItem label="Gastos" value={fmt(pl.pl.expenses)} />
                <PLItem label="Utilidad" value={fmt(pl.pl.profit)} positive={pl.pl.profit >= 0} big />
                <PLItem label="Margen" value={`${pl.pl.margin}%`} positive={pl.pl.margin >= 30} />
                <PLItem label="Por Cobrar" value={fmt(pl.cashflow.pendingCollection)} />
                {pl.cashflow.overdueCount > 0 && (
                  <PLItem label={`Vencido (${pl.cashflow.overdueCount})`} value={fmt(pl.cashflow.overdueTotal)} danger />
                )}
              </div>
            </div>
          )}

          {/* Overdue alerts */}
          {summary?.overdueClients && summary.overdueClients.length > 0 && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-4 mb-6">
              <h3 className="text-red-400 font-semibold text-sm mb-3">🚨 Clientes con facturas vencidas</h3>
              <div className="space-y-2">
                {summary.overdueClients.map((c, i) => (
                  <div key={i} className="flex items-center justify-between text-sm">
                    <span className="text-white/80">{c.name}</span>
                    <div className="flex items-center gap-3">
                      <span className="text-white/40">{new Date(c.due).toLocaleDateString('es-MX')}</span>
                      <span className="text-red-400 font-semibold">{fmt(c.amount)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Invoices table */}
          <div className="glass rounded-2xl border border-white/10 overflow-hidden">
            <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between">
              <h2 className="font-semibold text-white">Facturas Recientes</h2>
              <span className="text-xs text-white/30">{invoices.length} facturas</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/5">
                    {['Número', 'Cliente', 'Subtotal', 'IVA', 'Total', 'Vence', 'Estado', ''].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs text-white/30 font-normal">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {invoices.map(inv => (
                    <tr key={inv.id} className="border-b border-white/5 hover:bg-white/2 transition-colors">
                      <td className="px-4 py-3 font-mono text-xs text-white/60">{inv.invoice_number}</td>
                      <td className="px-4 py-3 text-white">{inv.clients?.name || '—'}</td>
                      <td className="px-4 py-3 text-white/70">{fmt(inv.subtotal)}</td>
                      <td className="px-4 py-3 text-white/50">{fmt(inv.tax)}</td>
                      <td className="px-4 py-3 font-semibold text-white">{fmt(inv.total)}</td>
                      <td className="px-4 py-3 text-white/40 text-xs">
                        {new Date(inv.due_date).toLocaleDateString('es-MX')}
                      </td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-1 rounded-full text-xs font-medium"
                          style={{ backgroundColor: `${STATUS_COLORS[inv.status]}20`, color: STATUS_COLORS[inv.status] }}>
                          {inv.status}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {inv.status === 'sent' && (
                          <button onClick={() => markPaid(inv.id)}
                            className="text-xs px-2 py-1 rounded-lg bg-green-500/20 text-green-400 hover:bg-green-500/30 transition-all">
                            Marcar pagado
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {invoices.length === 0 && (
                    <tr>
                      <td colSpan={8} className="px-4 py-8 text-center text-white/30">
                        No hay facturas aún. Roberto creará la primera cuando sea necesario.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function KPICard({ label, value, icon, color, alert = false }: any) {
  return (
    <div className={`glass rounded-2xl p-5 border transition-all ${alert ? 'border-red-500/40' : 'border-white/10'}`}>
      <div className="flex items-center justify-between mb-3">
        <span className="text-xl">{icon}</span>
        {alert && <span className="text-red-400 text-xs animate-pulse">● Atención</span>}
      </div>
      <p className="text-2xl font-bold" style={{ color }}>{value}</p>
      <p className="text-xs text-white/40 mt-1">{label}</p>
    </div>
  );
}

function PLItem({ label, value, positive, danger, big }: any) {
  const color = danger ? '#E74C3C' : positive ? '#27AE60' : '#F39C12';
  return (
    <div>
      <p className="text-xs text-white/30">{label}</p>
      <p className={`font-semibold ${big ? 'text-xl' : 'text-base'}`} style={{ color }}>{value}</p>
    </div>
  );
}
