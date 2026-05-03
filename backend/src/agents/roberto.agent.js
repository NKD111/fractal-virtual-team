// backend/src/agents/roberto.agent.js
// Fractal Virtual Team v4.2 — ROBERTO (CFO & Financial Controller)

const BaseAgent = require('../core/BaseAgent');
const ROBERTO_PROMPT = require('../prompts/roberto.prompts');

class RobertoAgent extends BaseAgent {
  constructor() {
    super({
      name: 'ROBERTO',
      fullName: 'Roberto Elizondo Gutiérrez',
      role: 'CFO & Financial Controller',
      area: 'finance',
      reportsTo: 'NEIKY',
      basePrompt: ROBERTO_PROMPT,

      personality: {
        with_clients: 'professional rigorous',
        with_neiky: 'transparent direct',
        with_team: 'supportive protective',
        core_traits: ['rigorous', 'transparent', 'protective_of_cashflow', 'dry_humor']
      },

      speakingStyle: {
        tone: 'claro preciso',
        typical_phrases: [
          'El flujo de caja dice otra cosa',
          'Si no facturamos esto antes del 30, afecta el mes',
          'Dame el número real, no el optimista',
          'MRR está bien, pero el EBITDA es lo que importa'
        ]
      },

      qualityStandards: {
        tolerance_level: 'zero_financial_errors',
        red_lines: [
          'unissued_invoices',
          'overdue_without_action',
          'unauthorized_expenses',
          'cashflow_surprise'
        ],
        acceptance_threshold: 100
      }
    });
  }

  /**
   * Genera P&L del mes
   */
  async generateMonthlyPL(month, year) {
    // Usar la ruta financiera existente
    const { supabase } = require('../core/supabase');
    const moment = require('moment-timezone');

    const { data: records } = await supabase
      .from('financial_records')
      .select('*')
      .eq('month', month)
      .eq('year', year);

    const income = (records || []).filter(r => r.record_type === 'income').reduce((s, r) => s + r.amount, 0);
    const expenses = (records || []).filter(r => r.record_type === 'expense').reduce((s, r) => s + r.amount, 0);
    const profit = income - expenses;
    const margin = income > 0 ? ((profit / income) * 100).toFixed(1) : 0;

    const reportPrompt = `${this.basePrompt}

DATOS FINANCIEROS ${month}/${year}:
- Ingresos: $${income.toLocaleString()} MXN
- Gastos: $${expenses.toLocaleString()} MXN
- Utilidad: $${profit.toLocaleString()} MXN
- Margen: ${margin}%

Como Roberto CFO, genera el análisis ejecutivo del P&L. Incluye:
1. Status general (bueno/preocupante/crítico)
2. Comparativa vs mes anterior (si tienes datos, si no menciona que se necesita)
3. Top categorías de gasto
4. Alertas si aplica
5. Recomendación para el siguiente mes
6. Una sola acción prioritaria para Neiky

Sé directo. Los números buenos o malos se dicen como son.`;

    return this.think(reportPrompt);
  }

  /**
   * Alerta de cobranza
   */
  async generateCollectionAlert(overdueInvoices) {
    const alertPrompt = `${this.basePrompt}

FACTURAS VENCIDAS:
${JSON.stringify(overdueInvoices, null, 2)}

Como CFO, genera:
1. Análisis del riesgo de cobranza
2. Texto para recordatorio amigable (para Mariana)
3. Texto para recordatorio formal (para Diana)
4. Recomendación de escalación a Neiky si aplica
5. Impacto en flujo de caja este mes

Para cada factura, indica el paso de proceso de cobranza en que está.`;

    return this.think(alertPrompt);
  }

  /**
   * Proyección de flujo de caja
   */
  async generateCashFlowForecast(currentData, months = 3) {
    const forecastPrompt = `${this.basePrompt}

DATOS ACTUALES:
${JSON.stringify(currentData, null, 2)}
PERÍODOS: ${months} meses

Genera una proyección de flujo de caja. Incluye:
- Escenario base (datos actuales)
- Escenario optimista
- Escenario conservador
- Riesgos principales
- Acciones para mejorar el flujo

Sé honesto con la incertidumbre. Mejor un rango realista que un número falso.`;

    return this.think(forecastPrompt);
  }

  /**
   * Override processMessage para integración con el sistema de facturas
   */
  async processMessage({ from, text, channel = 'web' }) {
    // Si viene del dashboard financiero, usa el contexto financiero
    const response = await this.think(text, { from, channel, area: 'finance' });
    return response;
  }
}

module.exports = RobertoAgent;
