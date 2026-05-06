// backend/src/agents/mariana-sales-script.js
// Script de ventas estructurado en 5 pasos. Mariana lo usa cuando un prospect pregunta por servicios.
// Cada paso tiene: detector (cuándo aplicar), action (qué hacer), tone (cómo decirlo).

const { templates } = require('./mariana-templates');

const SALES_STEPS = {
  STEP_1_QUALIFY: {
    detect: (msg, ctx) => !ctx.qualified && (/servicio|cotizac|presupuesto|propuesta|trabajar|contratar/i.test(msg)),
    action: async (msg, ctx) => {
      return {
        next_step: 'STEP_2_DISCOVER',
        reply: 'Hola! Bienvenido a Fractal MX 🎯 ¿Qué tipo de proyecto tienes en mente? — Video / Branding / Redes Sociales / Web / Otro',
        update_ctx: { qualified: true, in_sales_flow: true }
      };
    }
  },

  STEP_2_DISCOVER: {
    detect: (msg, ctx) => ctx.in_sales_flow && !ctx.brief_received,
    action: async (msg, ctx) => {
      // Detect project type from msg
      let project_type = 'otro';
      if (/video|comercial|reel/i.test(msg)) project_type = 'video';
      else if (/marca|brand|logo|identidad/i.test(msg)) project_type = 'branding';
      else if (/redes|social|instagram|tiktok|facebook|content/i.test(msg)) project_type = 'social';
      else if (/web|sitio|landing|página/i.test(msg)) project_type = 'web';

      return {
        next_step: 'STEP_3_BRIEF',
        reply: `Perfecto, ${project_type === 'otro' ? 'cuéntame más' : 'genial que estás considerando ' + project_type}. ${templates.briefRequest(project_type)}`,
        update_ctx: { project_type }
      };
    }
  },

  STEP_3_BRIEF: {
    detect: (msg, ctx) => ctx.project_type && !ctx.brief_confirmed,
    action: async (msg, ctx) => {
      // Aquí Claude infiere el brief structure a partir del mensaje completo + history
      // Por ahora plantilla simple
      const briefSummary = `- Proyecto: ${ctx.project_type}\n- Detalle: ${msg.slice(0, 200)}\n- Cliente: ${ctx.client_name || 'pendiente confirmar nombre'}`;
      return {
        next_step: 'STEP_4_BUDGET',
        reply: templates.briefConfirmation(briefSummary),
        update_ctx: { brief_received: true, brief_summary: briefSummary }
      };
    }
  },

  STEP_4_BUDGET: {
    detect: (msg, ctx) => ctx.brief_received && !ctx.budget_signaled && /^(sí|si|correcto|ok|yes|exacto|perfecto)/i.test(msg.trim()),
    action: async (msg, ctx) => {
      return {
        next_step: 'STEP_5_PROPOSAL',
        reply: 'Excelente. ' + templates.budgetSoftAsk(),
        update_ctx: { brief_confirmed: true }
      };
    }
  },

  STEP_5_PROPOSAL: {
    detect: (msg, ctx) => ctx.brief_confirmed && !ctx.proposal_sent,
    action: async (msg, ctx) => {
      // Si menciona presupuesto → aceptar y escalar a Fermín
      const hasNumber = /\d+\s*(k|mil|mxn|usd|dolar)/i.test(msg);
      if (hasNumber) {
        return {
          next_step: 'ESCALATED',
          reply: 'Perfecto. Con esa información ya tenemos lo necesario para una propuesta acertada. Iniciamos en cuanto la confirmemos con Fermín del lado nuestro. Te tenemos el documento listo en las próximas horas. ¿Tienes alguna pregunta mientras?',
          update_ctx: { proposal_sent: true, escalated_to_human: true, budget_signaled: msg }
        };
      } else {
        return {
          next_step: 'STEP_5_PROPOSAL',
          reply: 'Sin problema, podemos ajustar a tu presupuesto. ¿Algún rango aproximado para no enviarte una propuesta fuera de tu intención? — desde $20k MXN hasta $XXk MXN dependiendo del alcance.',
          update_ctx: {}
        };
      }
    }
  }
};

/**
 * Process incoming message through sales flow.
 * @returns { reply, next_step, ctx_updates } or null si no aplica
 */
async function processSalesMessage(msg, ctx) {
  for (const [stepName, step] of Object.entries(SALES_STEPS)) {
    if (step.detect(msg, ctx)) {
      const result = await step.action(msg, ctx);
      return { ...result, current_step: stepName };
    }
  }
  return null; // no aplicó ningún step
}

module.exports = { SALES_STEPS, processSalesMessage };
