/**
 * Pending Jobs — Mariana puede comprometerse a "revisar y regresar"
 * y luego mandar un mensaje proactivo sin que el cliente pregunte nada.
 *
 * Delay mínimo: 30 minutos (para que se sienta real, no automático).
 * El main server lo procesa con setInterval cada 30s.
 */

const fs   = require('fs');
const path = require('path');

const JOBS_FILE = path.join(__dirname, '..', 'data', 'pending-jobs.json');

function loadJobs() {
  try {
    if (!fs.existsSync(JOBS_FILE)) return [];
    return JSON.parse(fs.readFileSync(JOBS_FILE, 'utf8')) || [];
  } catch { return []; }
}

function saveJobs(jobs) {
  fs.writeFileSync(JOBS_FILE, JSON.stringify(jobs, null, 2), 'utf8');
}

// ─── Crear un job de follow-up ────────────────────────────────────────────────
// delayMs: tiempo en ms antes de mandar (mínimo 30 min por defecto)
function scheduleFollowup(phone, name, message, delayMs = 30 * 60 * 1000) {
  const jobs = loadJobs();
  // Evitar duplicados para el mismo número
  const existing = jobs.findIndex(j => j.phone === phone && !j.sent);
  if (existing >= 0) jobs.splice(existing, 1);

  jobs.push({
    id:      `job_${Date.now()}`,
    phone,
    name,
    message,
    sendAt:  Date.now() + delayMs,
    sent:    false,
    created: Date.now(),
  });
  saveJobs(jobs);
  console.log(`[jobs] Follow-up agendado para ${name} en ${Math.round(delayMs / 60000)} min`);
}

// ─── Obtener jobs listos para enviar ─────────────────────────────────────────
function getDueJobs() {
  const jobs = loadJobs();
  const now  = Date.now();
  return jobs.filter(j => !j.sent && j.sendAt <= now);
}

// ─── Marcar job como enviado ──────────────────────────────────────────────────
function markSent(jobId) {
  const jobs = loadJobs();
  const job  = jobs.find(j => j.id === jobId);
  if (job) {
    job.sent   = true;
    job.sentAt = Date.now();
    saveJobs(jobs);
  }
}

// ─── Cancelar follow-up pendiente (si el cliente vuelve a escribir antes) ────
function cancelPending(phone) {
  const jobs = loadJobs();
  const updated = jobs.map(j => j.phone === phone && !j.sent ? { ...j, sent: true, sentAt: 0, cancelled: true } : j);
  saveJobs(updated);
}

// ─── ¿Tiene follow-up pendiente? ─────────────────────────────────────────────
function hasPending(phone) {
  return loadJobs().some(j => j.phone === phone && !j.sent);
}

// ─── Generar el mensaje de regreso (después de "revisar") ────────────────────
function buildFollowupMessage(conv) {
  const profile = conv.profile || {};
  const pt      = profile.projectType;
  const biz     = profile.businessType ? ` para tu ${profile.businessType}` : '';
  const budget  = profile.budget ? `$${profile.budget.toLocaleString('es-MX')} MXN` : null;

  const { checkAvailability, nextSlot } = require('./project-manager');
  const avail = pt ? checkAvailability(pt) : { available: true };
  const slot  = !avail.available ? nextSlot(pt) : null;

  const PROJECT_LABELS = {
    branding:'branding', reels:'reels', web:'página web',
    social_media:'redes sociales', ads:'campañas', strategy:'estrategia',
    photography:'fotos', motion:'animación', video_4k:'video',
  };
  const label = pt ? (PROJECT_LABELS[pt] || pt) : 'tu proyecto';

  let msg = `Ya revisé todo con Fer y el equipo 🙌\n\n`;

  if (avail.available) {
    msg += `✅ Sí tenemos espacio para arrancar ${label}${biz}.\n`;
    msg += `📅 Podemos empezar la semana que entra.\n`;
    if (budget) msg += `💰 Con ${budget} hay cosas muy buenas que podemos hacer.\n`;
    msg += `\nFer te manda la propuesta mañana en la mañana. ¿Alguna duda mientras tanto?`;
  } else {
    msg += `Ahorita el equipo está con carga llena para ${label} — tenemos proyectos hasta ${slot}.\n`;
    msg += `Dos opciones:\n`;
    msg += `1️⃣ Te agendamos ${slot} y ya tienes tu lugar\n`;
    msg += `2️⃣ Si es urgente, vemos si hay fast track (tiene un costo extra)\n`;
    msg += `\n¿Qué te late más?`;
  }

  return msg;
}

module.exports = { scheduleFollowup, getDueJobs, markSent, cancelPending, hasPending, buildFollowupMessage };
