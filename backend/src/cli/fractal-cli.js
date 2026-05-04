#!/usr/bin/env node
// backend/src/cli/fractal-cli.js
// D1: CLI for Neiky to control Fractal MX from terminal.
// Talks to the deployed backend via HTTP — works even from a laptop.

const BASE = process.env.FRACTAL_BACKEND_URL || 'https://fractal-virtual-team-production.up.railway.app';

async function fetchJSON(path, options = {}) {
  const r = await fetch(`${BASE}${path}`, options);
  const text = await r.text();
  try { return { status: r.status, body: JSON.parse(text) }; }
  catch { return { status: r.status, body: text }; }
}

async function cmdStatus() {
  const [h, g, o, m, f] = await Promise.all([
    fetchJSON('/webhook/health'),
    fetchJSON('/api/guardian/status'),
    fetchJSON('/api/oracle/status'),
    fetchJSON('/api/megazord/status'),
    fetchJSON('/api/features/status')
  ]);
  console.log('\n🔮 FRACTAL MX — SYSTEM STATUS\n');
  console.log(`Health:   ${h.body?.status || '?'}  (${h.body?.agents || 0} agentes)`);
  console.log(`Guardian: ${g.body?.initialized ? '✅' : '❌'}  (NEXUS+ATLAS)`);
  console.log(`Oracle:   ${o.body?.initialized ? '✅' : '❌'}  (queries hoy: ${o.body?.queries_today || 0}, $${o.body?.cost_today_usd || 0})`);
  console.log(`Megazord: ${m.body?.initialized ? '✅' : '❌'}`);
  console.log(`Features: ${Object.entries(f.body || {}).filter(([, v]) => v).length} cargados`);
}

async function cmdAsk(question, depth = 'auto') {
  const r = await fetchJSON('/api/oracle/consult', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question, agentName: 'NEIKY', depth })
  });
  console.log(`\n🔮 ORACLE (${r.body?.model_used} — $${r.body?.actual_cost?.toFixed(5) || '0'}):\n`);
  console.log(r.body?.answer || JSON.stringify(r.body, null, 2));
}

async function cmdReport() {
  const r = await fetchJSON('/api/features/analytics/realtime');
  console.log('\n📊 KPIs:\n', JSON.stringify(r.body, null, 2));
}

async function cmdSummary() {
  const r = await fetchJSON('/api/features/summary/executive');
  console.log('\n📝 RESUMEN EJECUTIVO:\n');
  console.log(r.body?.summary || JSON.stringify(r.body, null, 2));
}

async function cmdAtRisk() {
  const r = await fetchJSON('/api/features/projects/at-risk');
  console.log(`\n⚠️ Proyectos en riesgo: ${r.body?.count || 0}\n`);
  (r.body?.at_risk || []).forEach(p => console.log(`  • ${p.name} (${p.status}) — deadline ${p.deadline}`));
}

const cmds = {
  status: cmdStatus,
  ask: (args) => cmdAsk(args.join(' ')),
  report: cmdReport,
  summary: cmdSummary,
  'at-risk': cmdAtRisk
};

const [, , cmd, ...args] = process.argv;
if (!cmd || !cmds[cmd]) {
  console.log(`fractal-cli — control de Fractal MX

Comandos:
  status          Estado general del sistema
  ask <pregunta>  Consultar a ORACLE
  report          KPIs en tiempo real
  summary         Resumen ejecutivo
  at-risk         Proyectos con deadline < 3 días

Ej:  node fractal-cli.js ask "¿Cuántos proyectos hay activos?"`);
  process.exit(0);
}

cmds[cmd](args).catch(err => { console.error('❌', err.message); process.exit(1); });
