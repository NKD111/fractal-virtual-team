// backend/src/core/oracle-memory.js
// Oracle memory engine — aprende de proyectos, errores, patrones de clientes.
// Sincroniza con Supabase tabla oracle_memory + lee learning/patterns.json local.

const { supabase } = require('./supabase');

class OracleMemory {

  /**
   * Insert una memoria nueva. Categorías:
   * - 'technical_solution': errores conocidos + fix
   * - 'client_pattern': tipos de clientes y cómo tratarlos
   * - 'market_insight': lo que AXIOM encontró
   * - 'operational': mejores prácticas internas
   */
  static async remember(category, content, options = {}) {
    const { relevance_score = 5, source = 'manual' } = options;
    try {
      const { data, error } = await supabase
        .from('oracle_memory')
        .insert({ category, content, relevance_score, source })
        .select()
        .single();
      if (error) throw error;
      return data;
    } catch (e) {
      console.warn('[OracleMemory.remember]', e.message);
      return null;
    }
  }

  /**
   * Busca memorias relevantes a una query. Por ahora keyword match;
   * cuando pgvector esté habilitado, usa embeddings.
   */
  static async recall(query, limit = 5) {
    const { data } = await supabase
      .from('oracle_memory')
      .select('*')
      .ilike('content', `%${query}%`)
      .order('relevance_score', { ascending: false })
      .limit(limit);
    // Bump times_applied
    if (data && data.length > 0) {
      const ids = data.map(d => d.id);
      await supabase.from('oracle_memory')
        .update({ times_applied: supabase.raw('times_applied + 1') })
        .in('id', ids).then(() => {}).catch(() => {});
    }
    return data || [];
  }

  /**
   * Top memorias por relevancia + uso.
   */
  static async topInsights(limit = 10) {
    const { data } = await supabase
      .from('oracle_memory')
      .select('category, content, relevance_score, times_applied')
      .order('relevance_score', { ascending: false })
      .limit(limit);
    return data || [];
  }

  /**
   * Sincroniza patterns.json local → oracle_memory.
   * Llamar al startup del backend.
   */
  static async syncFromPatternsFile() {
    const fs = require('fs');
    const path = require('path');
    const ppath = path.join(process.env.HOME || process.env.USERPROFILE || '/root', 'claude-eye/learning/patterns.json');
    if (!fs.existsSync(ppath)) {
      console.log('[OracleMemory] no patterns.json found at', ppath);
      return 0;
    }
    try {
      const data = JSON.parse(fs.readFileSync(ppath, 'utf8'));
      const patterns = data.patterns || [];
      let inserted = 0;
      for (const p of patterns) {
        // Skip dupe by exact content match
        const { data: exists } = await supabase
          .from('oracle_memory')
          .select('id')
          .eq('source', 'patterns_json')
          .ilike('content', p.context.slice(0, 100) + '%')
          .limit(1);
        if (exists && exists.length > 0) continue;
        const { error } = await supabase.from('oracle_memory').insert({
          category: 'operational',
          content: `[${p.key}] ${p.value} — ${p.context}`,
          relevance_score: 7,
          source: 'patterns_json'
        });
        if (!error) inserted++;
      }
      console.log(`[OracleMemory] synced ${inserted} patterns from patterns.json`);
      return inserted;
    } catch (e) {
      console.warn('[OracleMemory.syncFromPatternsFile]', e.message);
      return 0;
    }
  }

  /**
   * Aprende de un proyecto completado.
   */
  static async learnFromProject(project, outcome) {
    const content = `Proyecto ${project.project_type} para ${project.client_name}: ${outcome}. ` +
                    `Budget: $${project.budget_mxn}, revisiones: ${project.revision_count}/${project.max_revisions}.`;
    return this.remember('client_pattern', content, { relevance_score: 6, source: 'project_completion' });
  }

  /**
   * Aprende de un error técnico.
   */
  static async learnFromError(error, fix) {
    const content = `Error: ${error}. Fix aplicado: ${fix}.`;
    return this.remember('technical_solution', content, { relevance_score: 8, source: 'error_recovery' });
  }
}

module.exports = OracleMemory;
