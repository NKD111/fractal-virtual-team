// backend/src/routines/parrilla-fif.js
// Fractal Virtual Team v4.2 — Crons para parrilla mensual FIF/Vanexpo
// Día 1: activar ciclo mensual
// Día 15: recordatorio equipo creativo
// Día 18: verificar estado para NKD

const cron = require('node-cron');
const { supabase } = require('../core/supabase');

/**
 * Notifica a NKD vía WhatsApp si está disponible
 */
async function notifyNKD(message) {
  try {
    if (global.io) {
      global.io.emit('mariana_message', {
        to: 'web_neiky',
        text: message,
        from: 'mariana',
        type: 'proactive'
      });
    }
    // También intentar vía WhatsApp si hay cliente Twilio
    if (global.twilioClient) {
      await global.twilioClient.messages.create({
        body: message,
        from: process.env.TWILIO_WHATSAPP_FROM,
        to: `whatsapp:+525534189583`
      });
    }
  } catch (err) {
    console.error('[parrilla-fif] notify error:', err.message);
  }
}

/**
 * Obtiene el mes siguiente formateado (e.g. "Junio 2026")
 */
function getNextMonthName() {
  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return next.toLocaleDateString('es-MX', { month: 'long', year: 'numeric' });
}

/**
 * Obtiene el mes actual formateado (e.g. "Mayo 2026")
 */
function getCurrentMonthName() {
  const now = new Date();
  return now.toLocaleDateString('es-MX', { month: 'long', year: 'numeric' });
}

/**
 * Cuenta briefs activos FIF del mes corriente
 */
async function countActiveFIFBriefs() {
  try {
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const { data } = await supabase
      .from('projects')
      .select('id, brief')
      .eq('status', 'active')
      .gte('created_at', startOfMonth.toISOString())
      .not('brief', 'is', null);

    return (data || []).filter(p => p.brief?.client === 'fif').length;
  } catch (_) {
    return 0;
  }
}

/**
 * Verifica el estado de briefs FIF pendientes de aprobación NKD
 */
async function checkPendingNKDApprovals() {
  try {
    const { data } = await supabase
      .from('projects')
      .select('id, name, brief')
      .eq('status', 'active')
      .not('brief', 'is', null);

    return (data || []).filter(p =>
      p.brief?.client === 'fif' &&
      p.brief?.workflow_status?.phase === 'pending_nkd'
    );
  } catch (_) {
    return [];
  }
}

/**
 * DÍA 1 DE CADA MES — Activar ciclo de parrilla mensual
 * Notifica a Mariana/NKD que hay que arrancar el proceso
 */
function scheduleDia1() {
  // Día 1 de cada mes a las 9:00 AM CDMX
  cron.schedule('0 9 1 * *', async () => {
    console.log('[parrilla-fif] Día 1: activando ciclo mensual FIF');
    try {
      const nextMonth = getNextMonthName();
      const message = `Buenos días mi rey 😏 Ya es día 1, hora de arrancar la parrilla de FIF para ${nextMonth}. ¿Tienes el brief del mes o le pido los datos a Luis Manuel? Necesito saber: fase de registro activa, audiencias prioritarias y cualquier mensaje clave del mes. ¡Vamos por todo! 🚀`;

      await notifyNKD(message);

      // Registrar en audit_log
      try {
        await supabase.from('audit_log').insert({
          agent: 'parrilla-fif-cron',
          action: 'dia1_reminder_sent',
          details: { month: nextMonth, message: 'Ciclo mensual FIF activado' },
          created_at: new Date().toISOString()
        });
      } catch (_) {}
    } catch (err) {
      console.error('[parrilla-fif] día 1 error:', err.message);
    }
  }, { timezone: 'America/Mexico_City' });

  console.log('✅ Parrilla FIF — cron día 1 activo (9:00 AM CDMX)');
}

/**
 * DÍA 15 DE CADA MES — Recordatorio al equipo creativo
 * Verifica cuántos briefs están asignados y alerta si falta algo
 */
function scheduleDia15() {
  // Día 15 de cada mes a las 10:00 AM CDMX
  cron.schedule('0 10 15 * *', async () => {
    console.log('[parrilla-fif] Día 15: recordatorio parrilla FIF');
    try {
      const month = getCurrentMonthName();
      const activeCount = await countActiveFIFBriefs();

      let message;
      if (activeCount >= 8) {
        message = `Ey equipo 🎨 Ya tenemos ${activeCount} piezas FIF en proceso para ${month}. Recordatorio: todo debe estar listo el día 18 para revisión de NKD. QC-BOT + Valentina deben dar el visto bueno el día 17. ¡Los que estén con retraso, actualicen su status ahorita! ⏰`;
      } else {
        message = `⚠️ Nene, hay un tema con la parrilla FIF de ${month}: solo tengo ${activeCount} piezas asignadas y deberíamos tener 8-10. ¿Arrancamos con el brief completo o me confirmas qué falta? Necesito saber para no quedar mal con Luis el día 20 👀`;
      }

      await notifyNKD(message);

      // Notificar al equipo si hay socket
      if (global.io) {
        global.io.emit('team_reminder', {
          type: 'parrilla_fif_day15',
          message: `📅 DÍA 15 — Parrilla FIF ${month}: ${activeCount} piezas activas. Deadline: día 18.`,
          agents: ['carlos', 'diego', 'max', 'alex', 'valentina', 'qcbot']
        });
      }

      try {
        await supabase.from('audit_log').insert({
          agent: 'parrilla-fif-cron',
          action: 'dia15_reminder_sent',
          details: { month, active_briefs: activeCount },
          created_at: new Date().toISOString()
        });
      } catch (_) {}
    } catch (err) {
      console.error('[parrilla-fif] día 15 error:', err.message);
    }
  }, { timezone: 'America/Mexico_City' });

  console.log('✅ Parrilla FIF — cron día 15 activo (10:00 AM CDMX)');
}

/**
 * DÍA 18 DE CADA MES — Verificar estado para entrega a NKD
 * Alerta si hay piezas sin Valentina ✅
 */
function scheduleDia18() {
  // Día 18 de cada mes a las 9:00 AM CDMX
  cron.schedule('0 9 18 * *', async () => {
    console.log('[parrilla-fif] Día 18: verificando estado para NKD');
    try {
      const month = getCurrentMonthName();
      const pendingNKD = await checkPendingNKDApprovals();

      if (pendingNKD.length > 0) {
        const names = pendingNKD.map(p => p.name || p.id).join(', ');
        const message = `Mi rey, tengo ${pendingNKD.length} pieza(s) FIF listas para tu revisión final 🎯\n\nPiezas: ${names}\n\nRecuerda que el día 20 entrego a Claudia. ¿Las revisamos hoy? Te las mando por WhatsApp o las encuentras en el dashboard.`;
        await notifyNKD(message);
      } else {
        const message = `Nene, revisando el estado de la parrilla FIF para ${month}... no tengo piezas marcadas como listas para tu revisión todavía. ¿Valentina ya aprobó? Dime cómo vamos para coordinar la entrega del día 20 🙏`;
        await notifyNKD(message);
      }

      try {
        await supabase.from('audit_log').insert({
          agent: 'parrilla-fif-cron',
          action: 'dia18_check',
          details: { month, pending_nkd_count: pendingNKD.length },
          created_at: new Date().toISOString()
        });
      } catch (_) {}
    } catch (err) {
      console.error('[parrilla-fif] día 18 error:', err.message);
    }
  }, { timezone: 'America/Mexico_City' });

  console.log('✅ Parrilla FIF — cron día 18 activo (9:00 AM CDMX)');
}

/**
 * Inicia todos los crons de parrilla FIF
 */
function startParrillaFIFCrons() {
  scheduleDia1();
  scheduleDia15();
  scheduleDia18();
  console.log('🗓️ Parrilla FIF: crons día 1, 15 y 18 activos (CDMX)');
}

module.exports = { startParrillaFIFCrons };
