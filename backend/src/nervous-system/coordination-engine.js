// backend/src/nervous-system/coordination-engine.js
// Fractal Virtual Team — Fase 5 MEGAZORD
// Sistema 4: Coordinación Inteligente — Agentes colaboran sin Mariana de cuello botella

const Anthropic = require('@anthropic-ai/sdk');
const { createClient } = require('@supabase/supabase-js');

const AGENT_ROLES = {
  'diego':    { role: 'design_lead', expertise: ['branding', 'print', 'visual identity'] },
  'carlos':   { role: 'design_collaborator', expertise: ['digital assets', 'social media graphics'] },
  'max':      { role: 'video_production', expertise: ['reels', 'video editing', 'motion graphics'] },
  'alex':     { role: 'content_creation', expertise: ['copywriting', 'captions', 'blog posts'] },
  'valentina':{ role: 'quality_review', expertise: ['creative direction', 'brand consistency'] },
  'sofia':    { role: 'timeline_management', expertise: ['project planning', 'deadlines', 'resources'] },
  'lucas':    { role: 'analytics', expertise: ['metrics', 'performance prediction', 'reporting'] },
  'roberto':  { role: 'financial_validation', expertise: ['pricing', 'invoicing', 'margins'] },
  'diana':    { role: 'client_relations', expertise: ['negotiation', 'client communication'] },
  'mariana':  { role: 'orchestration', expertise: ['coordination', 'hub', 'routing'] }
};

class CoordinationEngine {
  constructor(channelBus, collectiveMemory) {
    this.bus = channelBus;
    this.memory = collectiveMemory;
    this.claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    this.supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY
    );
    this.activeCollaborations = new Map();
  }

  /**
   * Cuando inicia un proyecto, auto-coordinar al equipo sin intervención de Mariana
   */
  async coordinateProjectStart(project) {
    console.log(`[CoordinationEngine] 🚀 Coordinando proyecto: ${project.client_name || project.id}`);

    // 1. Identificar agentes necesarios
    const { primary, others, reasoning } = await this.identifyRequiredAgents(project);

    // 2. Consultar memoria colectiva del cliente
    let clientContext = '';
    if (project.client_id && this.memory) {
      const mem = await this.memory.query({
        question: `Información y patrones del cliente ${project.client_name}`,
        context: { client_id: project.client_id }
      }).catch(() => ({ synthesis: null }));
      clientContext = mem.synthesis || '';
    }

    // 3. Crear registro de colaboración
    const allParticipants = primary ? [primary, ...others] : others;
    const allIds = allParticipants.map(a => a).filter(Boolean); // slugs

    const { data: collaboration } = await this.supabase
      .from('agent_collaborations')
      .insert({
        project_id: project.id || null,
        primary_agent: null, // No tenemos UUIDs del agente en este contexto, usamos slugs
        collaborating_agents: null,
        collaboration_type: 'parallel_work',
        status: 'active',
        context: {
          client_name: project.client_name,
          project_type: project.type,
          primary_slug: primary,
          collaborators: others,
          client_context: clientContext.substring(0, 500),
          reasoning
        }
      })
      .select()
      .single();

    const collaborationId = collaboration?.id;
    if (collaborationId) {
      this.activeCollaborations.set(collaborationId, { project, agents: allIds, startedAt: new Date() });
    }

    // 4. Notificar a todos en paralelo via bus
    await Promise.allSettled(
      allIds.map(agentSlug =>
        this.bus.emit('collaboration:invite', {
          type: 'auto_coordination',
          emitted_by: 'coordination_engine',
          payload: {
            collaboration_id: collaborationId,
            project_id: project.id,
            project_type: project.type,
            client_name: project.client_name,
            role: AGENT_ROLES[agentSlug]?.role || 'support',
            is_primary: agentSlug === primary,
            client_context: clientContext.substring(0, 300),
            other_participants: allIds.filter(a => a !== agentSlug)
          }
        })
      )
    );

    console.log(`[CoordinationEngine] ✅ Colaboración creada: primary=${primary}, team=[${others.join(', ')}]`);
    return { collaborationId, primary, collaborators: others, reasoning };
  }

  /**
   * Identificar qué agentes se necesitan para un proyecto
   */
  async identifyRequiredAgents(project) {
    try {
      const agentList = Object.entries(AGENT_ROLES)
        .map(([slug, info]) => `${slug}: ${info.role} (${info.expertise.join(', ')})`)
        .join('\n');

      const response = await this.claude.messages.create({
        model: 'claude-haiku-4-5',
        max_tokens: 200,
        messages: [{
          role: 'user',
          content: `Proyecto en Fractal MX:
Tipo: ${project.type || 'desconocido'}
Cliente: ${project.client_name || 'cliente'}
Descripción: ${(project.description || '').substring(0, 200)}

Agentes disponibles:
${agentList}

¿Quién debe liderar y quiénes apoyan? JSON:
{"primary": "slug", "others": ["slug2", "slug3"], "reasoning": "..."}`
        }]
      });

      const text = response.content[0].text;
      const match = text.match(/\{[\s\S]*\}/);
      if (match) {
        const result = JSON.parse(match[0]);
        const validSlugs = Object.keys(AGENT_ROLES);
        return {
          primary: validSlugs.includes(result.primary) ? result.primary : 'mariana',
          others: (result.others || []).filter(s => validSlugs.includes(s)),
          reasoning: result.reasoning || ''
        };
      }
    } catch (err) {
      console.warn('[CoordinationEngine] identifyRequiredAgents error:', err.message);
    }

    // Defaults por tipo de proyecto
    return this._defaultAgentsForType(project.type);
  }

  _defaultAgentsForType(type = '') {
    const lower = type.toLowerCase();
    if (lower.includes('diseño') || lower.includes('branding') || lower.includes('logo')) {
      return { primary: 'diego', others: ['carlos', 'valentina', 'sofia'], reasoning: 'Proyecto de diseño' };
    }
    if (lower.includes('video') || lower.includes('reel')) {
      return { primary: 'max', others: ['alex', 'valentina'], reasoning: 'Proyecto de video' };
    }
    if (lower.includes('contenido') || lower.includes('social')) {
      return { primary: 'alex', others: ['diego', 'sofia'], reasoning: 'Proyecto de contenido' };
    }
    return { primary: 'mariana', others: ['sofia', 'roberto'], reasoning: 'Proyecto general' };
  }

  /**
   * Cuando un agente termina su parte, detectar próximos pasos y notificar
   */
  async handleAgentCompletion(agentSlug, task, output) {
    console.log(`[CoordinationEngine] ✓ ${agentSlug} completó: ${task?.title || 'tarea'}`);

    const nextSteps = await this._determineNextSteps(agentSlug, task, output);

    for (const step of nextSteps) {
      await this.bus.emit('agent:events', {
        type: 'task_handoff',
        emitted_by: agentSlug,
        payload: {
          previous_agent: agentSlug,
          previous_task: task,
          output_summary: (output || '').substring(0, 300),
          next_step: step.action,
          next_agent: step.next_agent,
          context: step.context
        }
      }).catch(() => {});
    }

    return nextSteps;
  }

  async _determineNextSteps(agentSlug, task, output) {
    // Lógica básica de handoff según rol
    const handoffs = {
      'diego': [{ next_agent: 'valentina', action: 'QC review de diseño', context: {} }],
      'carlos': [{ next_agent: 'diego', action: 'Review propuesta alternativa', context: {} }],
      'alex': [{ next_agent: 'valentina', action: 'Revisión de contenido', context: {} }],
      'sofia': [{ next_agent: 'mariana', action: 'Actualización de timeline al cliente', context: {} }],
      'roberto': [{ next_agent: 'mariana', action: 'Validación financiera completa', context: {} }],
    };
    return handoffs[agentSlug] || [];
  }

  /**
   * Obtener colaboraciones activas
   */
  async getActiveCollaborations() {
    const { data, count } = await this.supabase
      .from('agent_collaborations')
      .select('*', { count: 'exact' })
      .eq('status', 'active');
    return { collaborations: data || [], count: count || 0 };
  }
}

module.exports = CoordinationEngine;
