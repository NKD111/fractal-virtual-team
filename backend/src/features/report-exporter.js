// backend/src/features/report-exporter.js
// D3: Export de reportes (HTML, listo para impresión a PDF en navegador)

const { supabase } = require('../core/supabase');

class ReportExporter {
  async generateProjectReport(projectId) {
    const { data: project } = await supabase
      .from('projects').select('*, clients(*)').eq('id', projectId).maybeSingle();
    if (!project) throw new Error(`Project ${projectId} not found`);

    const { data: revisions } = await supabase
      .from('project_revisions').select('*').eq('project_id', projectId)
      .order('revision_number', { ascending: true });

    const { data: checklist } = await supabase
      .from('delivery_checklists').select('*').eq('project_id', projectId).maybeSingle();

    const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>Reporte: ${escapeHtml(project.name || 'Proyecto')}</title>
  <style>
    body { font-family: -apple-system, Arial, sans-serif; margin: 40px; color: #1a1a1a; }
    h1 { color: #6B46C1; margin-bottom: 0.2em; }
    .header { border-bottom: 2px solid #6B46C1; padding-bottom: 20px; margin-bottom: 30px; }
    .section { margin-bottom: 30px; }
    .badge { background: #6B46C1; color: white; padding: 3px 10px; border-radius: 4px; font-size: 12px; text-transform: uppercase; }
    table { width: 100%; border-collapse: collapse; }
    th, td { border: 1px solid #ddd; padding: 8px 10px; text-align: left; font-size: 14px; }
    th { background: #f3e8ff; }
    .meta { color: #666; font-size: 14px; }
  </style>
</head>
<body>
  <div class="header">
    <h1>Fractal MX — Reporte de Proyecto</h1>
    <p class="meta"><strong>Proyecto:</strong> ${escapeHtml(project.name || '—')}</p>
    <p class="meta"><strong>Cliente:</strong> ${escapeHtml(project.clients?.name || '—')}</p>
    <p class="meta"><strong>Status:</strong> <span class="badge">${escapeHtml(project.status || '—')}</span></p>
    <p class="meta"><strong>Generado:</strong> ${new Date().toLocaleDateString('es-MX')}</p>
  </div>

  <div class="section">
    <h2>Revisiones (${revisions?.length || 0})</h2>
    <table>
      <tr><th>#</th><th>Descripción</th><th>¿Incluida?</th><th>Status</th></tr>
      ${(revisions || []).map(r => `
        <tr>
          <td>${r.revision_number}</td>
          <td>${escapeHtml(r.description || '—')}</td>
          <td>${r.is_within_rounds ? '✅ Sí' : '⚠️ Extra'}</td>
          <td>${escapeHtml(r.status || '—')}</td>
        </tr>`).join('') || '<tr><td colspan="4">Sin revisiones</td></tr>'}
    </table>
  </div>

  <div class="section">
    <h2>Checklist de Entrega ${checklist ? `(${checklist.completion_percent}%)` : ''}</h2>
    <table>
      <tr><th>Tarea</th><th>Responsable</th><th>Status</th></tr>
      ${(checklist?.items || []).map(it => `
        <tr>
          <td>${escapeHtml(it.task || '—')}</td>
          <td>${escapeHtml(it.assigned_to || '—')}</td>
          <td>${it.done ? '✅ Completado' : '⏳ Pendiente'}</td>
        </tr>`).join('') || '<tr><td colspan="3">Sin checklist</td></tr>'}
    </table>
  </div>
</body>
</html>`;

    return { project_id: projectId, html, content_type: 'text/html' };
  }
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

module.exports = ReportExporter;
