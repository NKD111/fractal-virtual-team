// routines/index.js — Simplificado: 1 solo cron.
//
// REGLA: solo crons que entregan un archivo o mensaje concreto.
// Todo lo demás (briefings, councils, oracle reports, axiom scans,
// metric snapshots, monthly reviews) fue retirado.

const cron = require('node-cron');

const TZ = { timezone: 'America/Mexico_City' };

class RoutineManager {
  constructor() {
    this._tasks = [];
    this._initialized = false;
  }

  initialize() {
    if (this._initialized) return;
    console.log('⏰ ROUTINES: inicializando schedule único...');

    // ÚNICO CRON: Revenue Report — Lunes 9 AM CDMX
    // Entrega: reporte semanal de ingresos vía WhatsApp a Neiky.
    this._tasks.push(
      cron.schedule(
        '0 9 * * 1',
        () => this.weeklyRevenue().catch(e => console.error('weeklyRevenue:', e.message)),
        TZ
      )
    );

    this._initialized = true;
    console.log(`✅ ROUTINES: 1 cron activo (revenue lunes 9:00 CDMX)`);
  }

  async weeklyRevenue() {
    console.log('💰 ROUTINE: Weekly Revenue Report...');
    const { weeklyRevenueReport } = require('./revenue-pipeline');
    return weeklyRevenueReport();
  }
}

module.exports = RoutineManager;
