/**
 * Project Manager — Mariana sabe qué proyectos están corriendo,
 * cuándo hay espacio y si puede comprometer tiempos.
 */

const fs   = require('fs');
const path = require('path');

const PROJECTS_FILE = path.join(__dirname, '..', 'data', 'projects.json');

function loadProjects() {
  try {
    return JSON.parse(fs.readFileSync(PROJECTS_FILE, 'utf8')).projects || [];
  } catch {
    return [];
  }
}

// ─── ¿Hay espacio para un proyecto nuevo de este tipo? ───────────────────────
function checkAvailability(projectType) {
  const projects = loadProjects();
  const active   = projects.filter(p => p.status === 'in_progress' || p.status === 'active');
  const sameType = active.filter(p => p.type === projectType);
  const highLoad = active.filter(p => p.load === 'high');

  // Si hay 2+ proyectos del mismo tipo activos = ocupado en esa área
  if (sameType.length >= 2) {
    return { available: false, reason: 'tipo_lleno', count: sameType.length };
  }
  // Si hay 3+ proyectos high load en general = equipo saturado
  if (highLoad.length >= 3) {
    return { available: false, reason: 'carga_alta', count: highLoad.length };
  }
  return { available: true };
}

// ─── Próximas entregas ────────────────────────────────────────────────────────
function upcomingDeliveries(days = 14) {
  const projects = loadProjects();
  const now      = new Date();
  const cutoff   = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

  return projects.filter(p => {
    if (p.deliveryDate === 'ongoing') return false;
    const d = new Date(p.deliveryDate);
    return d >= now && d <= cutoff;
  }).sort((a, b) => new Date(a.deliveryDate) - new Date(b.deliveryDate));
}

// ─── Cuándo es el siguiente hueco disponible para un tipo de proyecto ─────────
function nextSlot(projectType) {
  const avail = checkAvailability(projectType);
  if (avail.available) return 'disponible ahorita';

  const upcoming = upcomingDeliveries(30);
  const relevant = upcoming.find(p => p.type === projectType);
  if (relevant) {
    const d = new Date(relevant.deliveryDate);
    const month = d.toLocaleString('es-MX', { month: 'long' });
    const day   = d.getDate();
    return `a partir del ${day} de ${month}`;
  }
  return 'en las próximas semanas';
}

// ─── Generar comentario de disponibilidad para el cliente ─────────────────────
function availabilityComment(projectType) {
  const avail = checkAvailability(projectType);

  if (avail.available) {
    return null; // No hace falta decir nada, hay espacio
  }

  const slot = nextSlot(projectType);
  const comments = [
    `Ahorita el equipo está con la carga bastante llena, pero ${slot} tendríamos espacio. ¿Te funciona ese timing?`,
    `Neta que el equipo está al tope ahorita — ${slot} podríamos arrancar. ¿Tienes esa flexibilidad?`,
    `El equipo tiene proyectos hasta ${slot} — si puedes esperar eso, lo agendamos ya.`,
  ];
  return comments[Math.floor(Math.random() * comments.length)];
}

// ─── Resumen para Fer (en notificación) ──────────────────────────────────────
function teamStatusSummary() {
  const projects = loadProjects();
  const active   = projects.filter(p => p.status === 'in_progress' || p.status === 'active');
  const deliveries = upcomingDeliveries(7);

  let summary = `📊 Estado del equipo\n`;
  summary += `Proyectos activos: ${active.length}\n`;
  if (deliveries.length) {
    summary += `Entregas esta semana:\n`;
    deliveries.forEach(p => { summary += `  • ${p.client} — ${p.type} — ${p.deliveryDate}\n`; });
  }
  return summary;
}

module.exports = { checkAvailability, upcomingDeliveries, nextSlot, availabilityComment, teamStatusSummary };
