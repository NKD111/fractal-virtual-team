// backend/src/features/revision-tracker.js
// A6: Historial de Revisiones (con flag de "extra-rounds")

const { supabase } = require('../core/supabase');
const { notifyNeiky } = require('../core/whatsapp');

class RevisionTracker {
  async logRevision({ projectId, clientId, description, requestedBy = null }) {
    const { count } = await supabase
      .from('project_revisions')
      .select('*', { count: 'exact', head: true })
      .eq('project_id', projectId);
    const revisionNumber = (count || 0) + 1;

    const { data: project } = await supabase
      .from('projects').select('*, clients(*)').eq('id', projectId).maybeSingle();

    const isVanexpo = !!project?.clients?.name && /vanexpo/i.test(project.clients.name);
    const includedRounds = isVanexpo ? 999 : 2;
    const isWithinRounds = revisionNumber <= includedRounds;
    const extraCost = isWithinRounds ? 0 : null;

    const { data: revision } = await supabase.from('project_revisions').insert({
      project_id: projectId,
      client_id: clientId,
      revision_number: revisionNumber,
      requested_by: requestedBy,
      description,
      is_within_rounds: isWithinRounds,
      extra_cost: extraCost,
      status: 'pending'
    }).select().single();

    if (!isWithinRounds) await this._notifyExtra(revision, project, revisionNumber);
    return revision;
  }

  async _notifyExtra(revision, project, revisionNumber) {
    const msg =
`⚠️ *REVISIÓN EXTRA #${revisionNumber}*

Proyecto: ${project?.name || 'sin nombre'}
Cliente: ${project?.clients?.name || 'sin cliente'}

Descripción: ${revision.description}

👉 Este cliente ya usó sus 2 rondas incluidas. ¿Cobramos extra? Define el monto.`;
    try { await notifyNeiky(msg); } catch (err) { console.warn('[RevisionTracker] notify error:', err.message); }
  }

  async getForProject(projectId) {
    const { data } = await supabase
      .from('project_revisions').select('*').eq('project_id', projectId)
      .order('revision_number', { ascending: true });
    return data || [];
  }
}

module.exports = RevisionTracker;
