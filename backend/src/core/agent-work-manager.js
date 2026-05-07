// backend/src/core/agent-work-manager.js
// AgentWorkManager — Control real del equipo Fractal MX
//
// Responsabilidades:
//  1. getTeamStatus()     → consulta tasks reales desde Supabase
//  2. detectIdleAgents()  → quién no tiene nada asignado
//  3. assignAutoWork()    → crea tareas reales de investigación con Haiku
//  4. runResearchTask()   → ejecuta investigación real y guarda resultado en DB

'use strict';

const { supabase } = require('./supabase');
const { getModel }  = require('./model-routing');

// Agentes del equipo con su especialidad y temas de auto-investigación
const AGENT_ROSTER = {
  carlos:    { nombre: 'Carlos',    rol: 'Diseñador gráfico',    topics: ['tendencias diseño gráfico México 2026', 'paletas de color trending LATAM', 'tipografías populares redes sociales', 'motion graphics trends'] },
  diego:     { nombre: 'Diego',     rol: 'Editor/contenido editorial', topics: ['tendencias editorial digital MX', 'newsletter design 2026', 'infografías virales', 'UX writing trends'] },
  alex:      { nombre: 'Alex',      rol: 'Content creator',      topics: ['tendencias contenido Instagram MX 2026', 'formatos virales TikTok marcas', 'copywriting persuasivo LATAM', 'hooks para redes sociales'] },
  max:       { nombre: 'Max',       rol: 'Video producer',       topics: ['tendencias video marketing 2026', 'reels vs TikTok estrategia marcas', 'producción video low-cost viral', 'formatos video B2B México'] },
  valentina: { nombre: 'Valentina', rol: 'Art director / QA',    topics: ['brand identity trends 2026', 'QA procesos agencias creativas', 'dirección de arte digital MX', 'tendencias visuales marcas LATAM'] },
  sofia:     { nombre: 'Sofia',     rol: 'Project manager',      topics: ['gestión proyectos creativos ágil', 'herramientas PM agencias 2026', 'automatización flujos creativos', 'KPIs agencia creativa'] },
  diana:     { nombre: 'Diana',     rol: 'Client manager',       topics: ['retención clientes agencias creativas', 'CRM para agencias MX', 'comunicación cliente-agencia efectiva', 'upsell servicios creativos'] },
  lucas:     { nombre: 'Lucas',     rol: 'Analytics',            topics: ['métricas redes sociales LATAM 2026', 'ROI marketing digital MX', 'analytics herramientas gratuitas', 'benchmarks industria creativa MX'] },
  roberto:   { nombre: 'Roberto',   rol: 'Finance',              topics: ['pricing agencias creativas MX 2026', 'modelos facturación servicios digitales', 'márgenes rentables agencia', 'costos producción creativa México'] },
  nexus:     { nombre: 'Nexus',     rol: 'Estratega',            topics: ['estrategia marketing digital MX 2026', 'posicionamiento marcas LATAM', 'competidores agencias creativas CDMX', 'tendencias publicidad digital MX'] },
};

const IDLE_THRESHOLD_HOURS = 2; // Si no hay tarea activa en las últimas N horas, es idle

/**
 * Obtiene el status real de todos los agentes desde Supabase tasks
 * @returns {Promise<Array<{agent, nombre, rol, status, task, updated_at}>>}
 */
async function getTeamStatus() {
  const agentNames = Object.keys(AGENT_ROSTER);

  // Consulta las tareas de las últimas 24h — filtra por metadata.agent (string, no UUID)
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: tasks, error } = await supabase
    .from('tasks')
    .select('id, title, description, status, result, updated_at, created_at, metadata')
    .eq('metadata->>task_source', 'fractal_agents')
    .gte('updated_at', since)
    .order('updated_at', { ascending: false });

  if (error) {
    console.error('[AgentWorkManager] getTeamStatus error:', error.message);
    return agentNames.map(a => ({ agent: a, ...AGENT_ROSTER[a], status: 'desconocido', task: null }));
  }

  // Agrupar por agente (usando metadata.agent) — tomar la tarea más reciente de cada uno
  const latestByAgent = {};
  for (const task of (tasks || [])) {
    const agentKey = task.metadata?.agent;
    if (agentKey && !latestByAgent[agentKey]) {
      latestByAgent[agentKey] = task;
    }
  }

  const now = Date.now();
  return agentNames.map(agent => {
    const roster = AGENT_ROSTER[agent];
    const task = latestByAgent[agent] || null;

    let agentStatus;
    if (!task) {
      agentStatus = 'idle';
    } else if (task.status === 'in_progress') {
      const ageMs = now - new Date(task.updated_at).getTime();
      agentStatus = ageMs < IDLE_THRESHOLD_HOURS * 3600 * 1000 ? 'working' : 'idle';
    } else if (task.status === 'pending') {
      agentStatus = 'pending';
    } else if (task.status === 'done' || task.status === 'completed') {
      const ageMs = now - new Date(task.updated_at).getTime();
      agentStatus = ageMs < 30 * 60 * 1000 ? 'just_finished' : 'idle'; // 30min grace period
    } else {
      agentStatus = 'idle';
    }

    return { agent, ...roster, status: agentStatus, task, updated_at: task?.updated_at };
  });
}

/**
 * Devuelve lista de agentes sin actividad real
 */
async function detectIdleAgents() {
  const team = await getTeamStatus();
  return team.filter(a => a.status === 'idle');
}

/**
 * Crea tareas de investigación reales para agentes idle.
 * Ejecuta el research con Haiku y guarda resultado en Supabase.
 * @param {string[]} agentNames - Lista de agentes a asignar (undefined = todos los idle)
 * @returns {Promise<Array<{agent, task_id, topic, summary}>>}
 */
async function assignAutoWork(agentNames) {
  const idle = agentNames
    ? agentNames.map(a => AGENT_ROSTER[a] ? { agent: a, ...AGENT_ROSTER[a] } : null).filter(Boolean)
    : await detectIdleAgents();

  if (idle.length === 0) return [];

  const results = [];

  // Máximo 4 agentes en paralelo para no saturar la API
  const batch = idle.slice(0, 4);

  await Promise.all(batch.map(async ({ agent, nombre, rol, topics }) => {
    // Elegir un topic aleatorio de la lista del agente
    const topic = topics[Math.floor(Math.random() * topics.length)];

    try {
      // 1. Crear tarea en DB con status pending
      const { data: taskRow, error: insertErr } = await supabase
        .from('tasks')
        .insert({
          title:       `Auto-investigación: ${topic}`,
          description: `Investigación autónoma iniciada por Mariana. Tema: ${topic}`,
          status:      'in_progress',
          priority:    'low',
          metadata:    { task_type: 'auto_research', task_source: 'fractal_agents', agent, topic, agent_rol: rol, nombre }
        })
        .select()
        .single();

      if (insertErr) {
        console.error(`[AgentWorkManager] insert task for ${agent}:`, insertErr.message);
        return;
      }

      // 2. Ejecutar research real con Haiku
      const summary = await runResearchTask(agent, nombre, rol, topic);

      // 3. Actualizar tarea con resultado
      await supabase
        .from('tasks')
        .update({
          status:       'done',
          result:       summary,
          completed_at: new Date().toISOString(),
          metadata:     { task_type: 'auto_research', topic, agent_rol: rol, completed: true }
        })
        .eq('id', taskRow.id);

      // 4. Guardar hallazgo en semantic_memory si existe la tabla
      try {
        await supabase.from('semantic_memory').insert({
          agent,
          topic,
          content:    summary,
          source:     'auto_research',
          created_at: new Date().toISOString()
        });
      } catch (_) { /* tabla puede no existir */ }

      results.push({ agent, nombre, task_id: taskRow.id, topic, summary });
    } catch (err) {
      console.error(`[AgentWorkManager] assignAutoWork ${agent}:`, err.message);
    }
  }));

  return results;
}

/**
 * Ejecuta investigación real con Haiku.
 * Hace un llamado real a la API Anthropic para investigar el tema.
 */
async function runResearchTask(agent, nombre, rol, topic) {
  const Anthropic = require('@anthropic-ai/sdk');
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const client = new Anthropic(apiKey ? { apiKey } : {});

  const model = getModel(agent, 'auto_research') || 'claude-haiku-4-5-20251001';

  const response = await client.messages.create({
    model,
    max_tokens: 600,
    system: `Eres ${nombre}, ${rol} de Fractal MX, una agencia creativa digital en México. Tu tarea es hacer una investigación rápida y útil sobre el tema asignado. Entrega bullet points concisos y accionables. Máximo 5 puntos. Sé específico, con datos concretos cuando sea posible. Escribe en español.`,
    messages: [{
      role: 'user',
      content: `Investiga brevemente: "${topic}"\n\nDame los 4-5 hallazgos más relevantes y accionables para una agencia creativa en México en 2026. Formato: bullet points. Sin introducción, directo al grano.`
    }]
  });

  return response.content[0].text.trim();
}

/**
 * Formatea el status del equipo en texto para Mariana
 */
function formatTeamStatusMessage(teamStatus, newWork = []) {
  const working    = teamStatus.filter(a => a.status === 'working' || a.status === 'pending');
  const finished   = teamStatus.filter(a => a.status === 'just_finished');
  const idle       = teamStatus.filter(a => a.status === 'idle');

  const lines = ['*📊 STATUS REAL DEL EQUIPO*\n'];

  if (working.length > 0) {
    lines.push('*Trabajando ahora:*');
    working.forEach(a => {
      lines.push(`• ${a.nombre} — ${a.task?.title || 'tarea asignada'}`);
    });
    lines.push('');
  }

  if (finished.length > 0) {
    lines.push('*Terminaron hace poco:*');
    finished.forEach(a => {
      lines.push(`• ${a.nombre} — completó: "${a.task?.title}"`);
    });
    lines.push('');
  }

  if (idle.length > 0 && newWork.length === 0) {
    lines.push('*Sin tareas asignadas (idle):*');
    idle.forEach(a => lines.push(`• ${a.nombre} — ${a.rol}`));
    lines.push('');
  }

  if (newWork.length > 0) {
    lines.push('*Asigné auto-investigación a los que estaban libres:*');
    newWork.forEach(w => {
      const short = w.summary?.split('\n')[0]?.substring(0, 80) || w.topic;
      lines.push(`• ${w.nombre || w.agent} → "${w.topic}"\n  _Primer hallazgo:_ ${short}...`);
    });
  }

  if (working.length === 0 && finished.length === 0 && newWork.length === 0) {
    lines.push('Todos están idle en este momento. Escríbeme "asigna trabajo" y los pongo a investigar.');
  }

  return lines.join('\n').trim();
}

module.exports = {
  AGENT_ROSTER,
  getTeamStatus,
  detectIdleAgents,
  assignAutoWork,
  runResearchTask,
  formatTeamStatusMessage
};
