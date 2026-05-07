// backend/src/nervous-system/collective-memory.js
// Fractal Virtual Team — Fase 5 MEGAZORD
// Sistema 2: Memoria Colectiva — Knowledge compartido entre agentes

const { createClient } = require('@supabase/supabase-js');
const Anthropic = require('@anthropic-ai/sdk');

class CollectiveMemory {
  constructor() {
    this.supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY
    );
    this.claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    this.model = 'claude-haiku-4-5-20251001'; // Rápido y barato para síntesis
  }

  async initialize() {
    console.log('[CollectiveMemory] Inicializando memoria colectiva...');
    const { count } = await this.supabase
      .from('collective_memory')
      .select('*', { count: 'exact', head: true })
      .eq('is_active', true);
    console.log(`[CollectiveMemory] ✅ ${count || 0} memorias activas cargadas`);
  }

  /**
   * Almacenar nueva memoria colectiva
   * Cualquier agente puede contribuir conocimiento
   */
  async storeMemory({
    agent,
    category,
    topic,
    content,
    context = {},
    clientSpecific = null,
    projectSpecific = null,
    tags = []
  }) {
    // Buscar memorias relacionadas por texto
    const related = await this._findRelatedByText(topic, category);

    const { data: memory, error } = await this.supabase
      .from('collective_memory')
      .insert({
        category,
        topic,
        content,
        context,
        contributed_by: agent?.id || null,
        client_specific: clientSpecific,
        project_specific: projectSpecific,
        related_memories: related.map(r => r.id),
        tags: tags || [],
        is_active: true
      })
      .select()
      .single();

    if (error) {
      console.warn('[CollectiveMemory] Error storing memory:', error.message);
      return null;
    }

    console.log(`[CollectiveMemory] 💡 Nueva memoria: [${category}] ${topic} — contributed by ${agent?.name || 'system'}`);

    // Emitir evento al bus (non-blocking)
    if (global.megazord?.bus) {
      global.megazord.bus.emit('knowledge:share', {
        type: 'new_memory',
        emitted_by: agent?.id || null,
        payload: {
          memory_id: memory.id,
          category,
          topic,
          tags
        }
      }).catch(() => {});
    }

    return memory;
  }

  /**
   * Buscar memorias relevantes para una pregunta
   * Usa búsqueda textual en Supabase (full-text + keyword)
   */
  async query({ question, agent = null, context = {} }) {
    const keywords = this._extractKeywords(question);

    // Estrategia: buscar por keywords en topic y content
    let query = this.supabase
      .from('collective_memory')
      .select('*')
      .eq('is_active', true)
      .order('effectiveness_score', { ascending: false })
      .limit(15);

    // Filtrar por cliente si hay contexto
    if (context.client_id) {
      query = query.or(`client_specific.eq.${context.client_id},client_specific.is.null`);
    }

    const { data: allMemories } = await query;
    if (!allMemories?.length) return { memories: [], synthesis: null };

    // Score por relevancia de keywords
    const scored = allMemories
      .map(m => ({
        ...m,
        relevance: this._scoreRelevance(m, keywords, question)
      }))
      .filter(m => m.relevance > 0)
      .sort((a, b) => b.relevance - a.relevance)
      .slice(0, 8);

    if (!scored.length) return { memories: [], synthesis: null };

    // Sintetizar con Claude
    const synthesis = await this._synthesize(scored, question);

    return { memories: scored, synthesis };
  }

  /**
   * Validar que una memoria fue útil (aumenta su score)
   */
  async validateMemory(memoryId, wasUseful) {
    if (wasUseful) {
      await this.supabase.rpc('increment_memory_score', {
        memory_id: memoryId,
        delta: 0.1
      }).catch(() => {
        // Fallback manual
        this.supabase.from('collective_memory')
          .select('effectiveness_score, times_applied, times_validated_correct')
          .eq('id', memoryId)
          .single()
          .then(({ data }) => {
            if (data) {
              this.supabase.from('collective_memory').update({
                effectiveness_score: Math.min(1, (data.effectiveness_score || 0) + 0.1),
                times_applied: (data.times_applied || 0) + 1,
                times_validated_correct: (data.times_validated_correct || 0) + 1,
                updated_at: new Date().toISOString()
              }).eq('id', memoryId);
            }
          });
      });
    } else {
      await this.supabase.from('collective_memory')
        .select('effectiveness_score, times_applied')
        .eq('id', memoryId)
        .single()
        .then(({ data }) => {
          if (data) {
            this.supabase.from('collective_memory').update({
              effectiveness_score: Math.max(0, (data.effectiveness_score || 0) - 0.05),
              times_applied: (data.times_applied || 0) + 1,
              updated_at: new Date().toISOString()
            }).eq('id', memoryId);
          }
        });
    }
  }

  /**
   * Obtener memoria por ID
   */
  async getMemory(id) {
    const { data } = await this.supabase
      .from('collective_memory')
      .select('*')
      .eq('id', id)
      .single();
    return data;
  }

  /**
   * Total de memorias activas
   */
  async getTotalMemories() {
    const { count } = await this.supabase
      .from('collective_memory')
      .select('*', { count: 'exact', head: true })
      .eq('is_active', true);
    return count || 0;
  }

  /**
   * Obtener memorias de un cliente específico
   */
  async getClientMemories(clientId) {
    const { data } = await this.supabase
      .from('collective_memory')
      .select('*')
      .eq('client_specific', clientId)
      .eq('is_active', true)
      .order('effectiveness_score', { ascending: false })
      .limit(20);
    return data || [];
  }

  // ─── Privados ────────────────────────────────────────────────────────────────

  async _findRelatedByText(topic, category) {
    const { data } = await this.supabase
      .from('collective_memory')
      .select('id, topic, category')
      .eq('is_active', true)
      .ilike('topic', `%${topic.substring(0, 30)}%`)
      .limit(5);
    return data || [];
  }

  _extractKeywords(text) {
    if (!text) return [];
    // Stopwords básicas en español
    const stopwords = new Set(['de','el','la','los','las','un','una','que','en','y','a','por','con','del','al','es','se','no','lo','le','si','su','son','me','mi','yo','tu','este','esta','estos','estas','para','pero','mas','como','más','sin']);
    return text
      .toLowerCase()
      .replace(/[¿?¡!,;:.]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 3 && !stopwords.has(w));
  }

  _scoreRelevance(memory, keywords, question) {
    const text = `${memory.topic} ${memory.content} ${(memory.tags || []).join(' ')}`.toLowerCase();
    let score = 0;
    for (const kw of keywords) {
      if (text.includes(kw)) score += 1;
    }
    // Bonus por efectividad
    score += (memory.effectiveness_score || 0) * 0.5;
    return score;
  }

  async _synthesize(memories, question) {
    if (!memories.length) return null;
    try {
      const response = await this.claude.messages.create({
        model: this.model,
        max_tokens: 400,
        messages: [{
          role: 'user',
          content: `Pregunta del equipo: "${question}"

Memorias colectivas relevantes:
${memories.slice(0, 5).map((m, i) => `${i + 1}. [${m.category}] ${m.topic}: ${m.content.substring(0, 200)}`).join('\n')}

Sintetiza en 2-3 líneas el insight más útil. Directo y accionable.`
        }]
      });
      return response.content[0].text;
    } catch {
      return memories[0]?.content || null;
    }
  }
}

module.exports = CollectiveMemory;
