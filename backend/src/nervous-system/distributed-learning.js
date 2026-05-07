// backend/src/nervous-system/distributed-learning.js
// Fractal Virtual Team — Fase 5 MEGAZORD
// Sistema 3: Aprendizaje Distribuido — Lo que aprende uno, lo saben todos

const Anthropic = require('@anthropic-ai/sdk');
const { createClient } = require('@supabase/supabase-js');

const ALL_AGENTS = ['mariana', 'diana', 'alex', 'carlos', 'sofia', 'lucas', 'diego', 'max', 'valentina', 'roberto'];

class DistributedLearning {
  constructor(channelBus, collectiveMemory) {
    this.bus = channelBus;
    this.memory = collectiveMemory;
    this.claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    this.supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY
    );
    this._subscribed = false;
  }

  /**
   * Suscribirse a eventos de aprendizaje del bus
   */
  subscribe() {
    if (this._subscribed) return;
    this._subscribed = true;

    // Nueva memoria → distribuirla a agentes relevantes
    this.bus.on('knowledge:share').subscribe(async event => {
      if (event.type === 'new_memory') {
        setImmediate(() => this.distributeKnowledge(event).catch(err =>
          console.warn('[DistributedLearning] distributeKnowledge error:', err.message)
        ));
      }
    });

    // Corrección recibida → aprender de ella
    this.bus.on('agent:events').subscribe(async event => {
      if (event.type === 'correction_received') {
        setImmediate(() => this.learnFromCorrection(event).catch(err =>
          console.warn('[DistributedLearning] learnFromCorrection error:', err.message)
        ));
      }
      if (event.type === 'project_completed') {
        setImmediate(() => this.extractLessonsFromProject(event).catch(err =>
          console.warn('[DistributedLearning] extractLessons error:', err.message)
        ));
      }
    });

    console.log('[DistributedLearning] ✅ Suscrito a canales de aprendizaje');
  }

  /**
   * Distribuir nueva memoria a agentes que la necesitan
   */
  async distributeKnowledge(event) {
    const memory = await this.memory.getMemory(event.payload.memory_id);
    if (!memory) return;

    const relevantAgents = await this.identifyRelevantAgents(memory);
    if (!relevantAgents.length) return;

    console.log(`[DistributedLearning] Distribuyendo "${memory.topic}" a ${relevantAgents.join(', ')}`);

    // Emitir notificación a cada agente relevante
    for (const agentSlug of relevantAgents) {
      await this.bus.emit('agent:events', {
        type: 'new_knowledge_available',
        intended_for: [agentSlug],
        payload: {
          memory_id: memory.id,
          topic: memory.topic,
          category: memory.category,
          preview: memory.content.substring(0, 200)
        }
      }).catch(() => {});
    }
  }

  /**
   * Identificar qué agentes se benefician de una memoria
   */
  async identifyRelevantAgents(memory) {
    try {
      const response = await this.claude.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 150,
        messages: [{
          role: 'user',
          content: `Nueva memoria del equipo Fractal MX:
Categoría: ${memory.category}
Tema: ${memory.topic}
Contenido: ${memory.content.substring(0, 300)}

Agentes: mariana (hub coordinator), diana (client manager), alex (content creator), carlos (jr designer), sofia (project manager), lucas (analytics), diego (sr designer), max (video editor), valentina (art director), roberto (finance)

¿Qué agentes (slugs) deberían conocer esto? JSON array solo con slugs relevantes, sin explicación:
["slug1", "slug2"]`
        }]
      });

      const text = response.content[0].text.trim();
      const match = text.match(/\[.*\]/s);
      if (match) {
        const slugs = JSON.parse(match[0]);
        return slugs.filter(s => ALL_AGENTS.includes(s));
      }
    } catch (err) {
      console.warn('[DistributedLearning] identifyRelevantAgents error:', err.message);
    }
    return [];
  }

  /**
   * Aprender de corrección de Neiky y distribuir la lección
   */
  async learnFromCorrection(event) {
    if (!event.context?.original_response || !event.context?.correction) return;

    try {
      const response = await this.claude.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 300,
        messages: [{
          role: 'user',
          content: `Neiky corrigió al equipo:
Respuesta original: "${event.context.original_response.substring(0, 200)}"
Corrección: "${event.context.correction.substring(0, 200)}"

Extrae la lección en JSON:
{
  "topic": "...",
  "content": "...",
  "applies_to_all": true/false,
  "tags": ["tag1"]
}`
        }]
      });

      const text = response.content[0].text;
      const match = text.match(/\{[\s\S]*\}/);
      if (!match) return;

      const lesson = JSON.parse(match[0]);

      await this.memory.storeMemory({
        agent: { id: null, name: event.emitted_by || 'system' },
        category: 'lesson',
        topic: lesson.topic,
        content: lesson.content,
        context: event.context,
        tags: [...(lesson.tags || []), 'correction', 'neiky_feedback']
      });

      console.log(`[DistributedLearning] 📚 Lección registrada: ${lesson.topic}`);
    } catch (err) {
      console.warn('[DistributedLearning] learnFromCorrection parse error:', err.message);
    }
  }

  /**
   * Extraer lecciones de un proyecto completado
   */
  async extractLessonsFromProject(event) {
    const projectId = event.payload?.project_id;
    if (!projectId) return;

    try {
      // Obtener info del proyecto
      const { data: project } = await this.supabase
        .from('projects')
        .select('*, clients(name)')
        .eq('id', projectId)
        .single();

      if (!project) return;

      const response = await this.claude.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 500,
        messages: [{
          role: 'user',
          content: `Proyecto completado en Fractal MX:
Cliente: ${project.clients?.name || 'cliente'}
Tipo: ${project.type || 'proyecto'}
Descripción: ${(project.description || '').substring(0, 200)}

Extrae 2 lecciones clave para el equipo. JSON array:
[
  { "title": "...", "content": "...", "tags": ["tag1"] },
  { "title": "...", "content": "...", "tags": ["tag2"] }
]`
        }]
      });

      const text = response.content[0].text;
      const match = text.match(/\[[\s\S]*\]/);
      if (!match) return;

      const lessons = JSON.parse(match[0]);

      for (const lesson of lessons) {
        await this.memory.storeMemory({
          agent: { id: null, name: 'system' },
          category: 'best_practice',
          topic: lesson.title,
          content: lesson.content,
          context: { project_id: projectId },
          clientSpecific: project.client_id,
          tags: lesson.tags || []
        });
      }

      console.log(`[DistributedLearning] ✅ ${lessons.length} lecciones extraídas del proyecto ${projectId}`);
    } catch (err) {
      console.warn('[DistributedLearning] extractLessons error:', err.message);
    }
  }

  /**
   * Iniciar aprendizaje: cuando un agente tiene una experiencia, registrarla
   * Llamar desde cualquier agente después de completar trabajo
   */
  async recordExperience({ agent, experience, outcome, clientId = null, tags = [] }) {
    const isGoodOutcome = ['success', 'approved', 'great', 'excellent'].some(w =>
      (outcome || '').toLowerCase().includes(w)
    );

    const category = isGoodOutcome ? 'best_practice' : 'lesson';

    await this.memory.storeMemory({
      agent,
      category,
      topic: experience.substring(0, 100),
      content: `${experience}\n\nResultado: ${outcome}`,
      clientSpecific: clientId,
      tags: [...tags, isGoodOutcome ? 'success' : 'improvement_needed']
    });
  }
}

module.exports = DistributedLearning;
