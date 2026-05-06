// backend/src/agents/mariana-templates.js
// Templates de respuesta listos para situaciones comunes en WhatsApp.
// Mariana puede llamarlos via key, e.g. templates.welcomeProspect(client_name)

const HORARIO_INICIO = 9;  // 9 AM CDMX
const HORARIO_FIN = 20;    // 8 PM CDMX

function isBusinessHours() {
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Mexico_City' }));
  const h = now.getHours();
  const day = now.getDay(); // 0=Sun, 6=Sat
  return day >= 1 && day <= 5 && h >= HORARIO_INICIO && h < HORARIO_FIN;
}

const templates = {

  welcomeProspectNew(clientName) {
    return `Hola${clientName ? ' ' + clientName : ''}! 👋 Bienvenido a Fractal MX. Qué gusto saludarte. ¿Con quién tengo el gusto y en qué te podemos ayudar?`;
  },

  welcomeReturningClient(clientName, lastProjectType) {
    return `Ey ${clientName || ''}! Qué gusto verte por aquí otra vez. ${lastProjectType ? `La última vez trabajamos juntos en ${lastProjectType}. ` : ''}¿En qué te puedo ayudar hoy?`;
  },

  outsideBusinessHours() {
    return `Hola 🌙 Recibí tu mensaje. Estamos fuera de horario de oficina (9 AM - 8 PM CDMX, L-V). Mañana en horario te contactamos sin falta. Si es urgente, déjamelo saber y veo qué puedo coordinar.`;
  },

  briefRequest(projectType) {
    const byType = {
      video: '¿Me cuentas un poco más del video? Tipo (comercial / institucional / social), duración estimada, y si tienes referencias o moodboard.',
      branding: 'Para hacer la propuesta acertada: ¿es marca nueva o refresh de existente? ¿industria? ¿algún tono o estilo que ya tengas en mente?',
      social: '¿Para qué redes principalmente? ¿Tienes ya un calendario base o partimos desde cero? ¿Cuál es el objetivo principal — awareness, ventas, comunidad?',
      web: '¿Es landing page, sitio completo o e-commerce? ¿Tienes el dominio? ¿Algún referente de diseño que te guste?',
      otro: '¿Me cuentas en qué consiste el proyecto? Mientras más detalle, mejor podemos ajustar la propuesta.'
    };
    return byType[projectType] || byType.otro;
  },

  briefConfirmation(briefSummary) {
    return `Para confirmar antes de seguir, déjame parafrasear lo que entendí:\n\n${briefSummary}\n\n¿Es correcto? ¿Algo que ajustar antes de mandarte la cotización formal?`;
  },

  budgetSoftAsk() {
    return 'Para que la propuesta sea relevante y no te haga perder tiempo, ¿tienes idea aproximada del rango de inversión que están considerando? Tenemos opciones desde $X hasta $Y dependiendo del alcance.';
  },

  escalateToHuman(reason) {
    return `Mira, esta decisión está mejor con Fermín directamente — quiero asegurarme de darte la mejor respuesta. Le paso el contexto y te confirmamos lo más pronto. Mientras tanto, ¿algo más en lo que te ayude?`;
  },

  deliveryReady(deliverableUrl) {
    return `Listo! Aquí tienes los entregables finales:\n\n${deliverableUrl}\n\nRevísalos en tranquilidad. Cuando confirmes que todo está OK, te paso el link de pago para cerrar.\n\n¿Tienes alguna pregunta?`;
  },

  paymentLink(paymentUrl, amountMxn) {
    return `Aquí tienes el link de pago:\n\n${paymentUrl}\n\nMonto: $${amountMxn?.toLocaleString('es-MX') || '?'} MXN\n\nUna vez procese el pago, recibirás confirmación automática y arrancamos formalmente. Cualquier duda, aquí estoy.`;
  },

  paymentConfirmed(amountMxn) {
    return `💰 Pago confirmado por $${amountMxn?.toLocaleString('es-MX')} MXN. Mil gracias!\n\nYa quedó registrado de nuestro lado. El equipo arrancó. Te mantenemos al tanto del progreso.`;
  },

  followUp24h(clientName) {
    return `Hola${clientName ? ' ' + clientName : ''}! Solo dando seguimiento al mensaje de ayer. ¿Tuviste oportunidad de revisar?`;
  },

  spamRateLimited() {
    return `Detecté muchos mensajes seguidos. Tomo un momento para revisar y respondo con calma. Si es urgente, escribe "URGENTE" y lo priorizo.`;
  },

  closeOfDay() {
    return `Cerramos por hoy 🌙 Si me escribiste hoy y quedó algo pendiente, mañana primero hago seguimiento. Buenas noches!`;
  }
};

module.exports = { templates, isBusinessHours };
