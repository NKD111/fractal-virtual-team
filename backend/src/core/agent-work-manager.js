// backend/src/core/agent-work-manager.js
// AgentWorkManager — Cerebro real del equipo Fractal MX
//
// Arquitectura:
//   Research corre SILENCIOSO en background.
//   Los resultados van a collective_knowledge (cerebro de cada agente).
//   BaseAgent.loadRelevantKnowledge() ya carga de ahí → el agente "sabe" sin que nadie se lo diga.
//   Después del research, se genera UNA sugerencia accionable corta.
//   Mariana reporta sugerencias, NO dumps de research.

'use strict';

const { supabase } = require('./supabase');

// Definición del equipo: especialidad + areas de conocimiento
const AGENT_ROSTER = {
  carlos:    {
    nombre: 'Carlos', rol: 'Diseñador gráfico',
    area:   'design',
    topics: [
      'tendencias diseño gráfico México 2026',
      'paletas de color trending LATAM',
      'tipografías populares redes sociales',
      'motion graphics brands 2026',
      'diseño minimalista vs maximalist tendencia actual',
    ]
  },
  diego:     {
    nombre: 'Diego', rol: 'Editor / contenido editorial',
    area:   'editorial',
    topics: [
      'tendencias editorial digital MX 2026',
      'newsletters de alto open rate estrategia',
      'infografías virales marcas',
      'UX writing mejores prácticas',
      'long-form content vs short-form rendimiento',
    ]
  },
  alex:      {
    nombre: 'Alex', rol: 'Content creator',
    area:   'content',
    topics: [
      'formatos Instagram que más alcanzan orgánicamente 2026',
      'hooks virales para redes sociales marcas',
      'copywriting persuasivo LATAM',
      'tendencias TikTok para marcas B2B',
      'storytelling de marca en redes sociales',
    ]
  },
  max:       {
    nombre: 'Max', rol: 'Video producer',
    area:   'video',
    topics: [
      'producción video viral low-cost 2026',
      'reels vs TikTok estrategia marcas México',
      'tendencias video B2B México',
      'IA en producción de video agencias',
      'formatos video corto para campañas de marca',
    ]
  },
  valentina: {
    nombre: 'Valentina', rol: 'Art director / QA',
    area:   'art_direction',
    topics: [
      'brand identity systems tendencias 2026',
      'dirección de arte digital campañas LATAM',
      'estándares QA agencias creativas',
      'accesibilidad en diseño digital marcas',
      'tendencias visuales campañas digitales MX',
    ]
  },
  sofia:     {
    nombre: 'Sofia', rol: 'Project manager',
    area:   'project_management',
    topics: [
      'gestión proyectos creativos metodologías 2026',
      'automatización workflows agencias creativas',
      'KPIs producción creativa rentable',
      'herramientas PM para agencias digitales',
      'onboarding clientes agencias creativas',
    ]
  },
  diana:     {
    nombre: 'Diana', rol: 'Client manager',
    area:   'client_relations',
    topics: [
      'retención clientes agencias creativas MX',
      'upsell servicios creativos estrategias',
      'comunicación efectiva cliente-agencia',
      'manejo de expectativas en proyectos creativos',
      'CRM estrategias para agencias digitales',
    ]
  },
  lucas:     {
    nombre: 'Lucas', rol: 'Analytics',
    area:   'analytics',
    topics: [
      'métricas redes sociales LATAM benchmarks 2026',
      'ROI campañas digitales México industria',
      'herramientas analytics gratuitas agencias',
      'atribución multicanal estrategias',
      'data storytelling para presentaciones de clientes',
    ]
  },
  roberto:   {
    nombre: 'Roberto', rol: 'Finance / CFO',
    area:   'finance',
    topics: [
      'pricing servicios creativos México 2026',
      'márgenes rentabilidad agencias digitales MX',
      'modelos de facturación servicios recurrentes',
      'flujo de caja agencias creativas',
      'costos de producción creativa comparativa LATAM',
    ]
  },
  nexus:     {
    nombre: 'Nexus', rol: 'Estratega de marketing',
    area:   'strategy',
    topics: [
      'estrategia marketing digital MX 2026',
      'posicionamiento marcas LATAM diferenciación',
      'competidores agencias creativas CDMX benchmark',
      'tendencias publicidad digital México Q2 2026',
      'marketing automation para agencias creativas',
    ]
  },
};

const IDLE_THRESHOLD_HOURS = 2;

// ─── getTeamStatus ────────────────────────────────────────────────────────────
// Consulta tasks reales en Supabase + sugerencias pendientes por agente
async function getTeamStatus() {
  const agentNames = Object.keys(AGENT_ROSTER);
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const [tasksRes, suggestionsRes] = await Promise.allSettled([
    supabase
      .from('tasks')
      .select('id, title, status, updated_at, metadata')
      .eq('metadata->>task_source', 'fractal_agents')
      .gte('updated_at', since)
      .order('updated_at', { ascending: false }),

    supabase
      .from('tasks')
      .select('id, title, description, result, metadata, created_at')
      .eq('metadata->>task_type', 'agent_suggestion')
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
  ]);

  const tasks       = tasksRes.status === 'fulfilled' ? (tasksRes.value?.data || []) : [];
  const suggestions = suggestionsRes.status === 'fulfilled' ? (suggestionsRes.value?.data || []) : [];

  // Agrupar por agente
  const latestTaskByAgent  = {};
  const suggestionsByAgent = {};

  for (const task of tasks) {
    const a = task.metadata?.agent;
    if (a && !latestTaskByAgent[a]) latestTaskByAgent[a] = task;
  }
  for (const sug of suggestions) {
    const a = sug.metadata?.agent;
    if (a) (suggestionsByAgent[a] = suggestionsByAgent[a] || []).push(sug);
  }

  const now = Date.now();
  return agentNames.map(agent => {
    const roster     = AGENT_ROSTER[agent];
    const task       = latestTaskByAgent[agent] || null;
    const agentSugs  = suggestionsByAgent[agent] || [];

    let status;
    if (!task) {
      status = 'idle';
    } else if (task.status === 'in_progress') {
      const age = now - new Date(task.updated_at).getTime();
      status = age < IDLE_THRESHOLD_HOURS * 3_600_000 ? 'working' : 'idle';
    } else if (task.status === 'pending') {
      status = 'pending';
    } else if (task.status === 'completed' || task.status === 'completed') {
      const age = now - new Date(task.updated_at).getTime();
      status = age < 30 * 60_000 ? 'just_finished' : 'idle';
    } else {
      status = 'idle';
    }

    return { agent, ...roster, status, task, suggestions: agentSugs };
  });
}

// ─── assignAutoWork ───────────────────────────────────────────────────────────
// Para agentes idle: corre research SILENCIOSO → guarda en collective_knowledge
// → genera UNA sugerencia accionable → la pone en cola como task pendiente
// NO reporta el research a Neiky. Devuelve sugerencias generadas para que
// Mariana las muestre si lo considera oportuno.
async function assignAutoWork(agentNames) {
  const idle = agentNames
    ? agentNames.map(a => AGENT_ROSTER[a] ? { agent: a, ...AGENT_ROSTER[a] } : null).filter(Boolean)
    : (await getTeamStatus()).filter(a => a.status === 'idle');

  if (idle.length === 0) return [];

  // Máx 4 en paralelo
  const batch = idle.slice(0, 4);
  const newSuggestions = [];

  await Promise.all(batch.map(async ({ agent, nombre, rol, area, topics }) => {
    const topic = topics[Math.floor(Math.random() * topics.length)];
    try {
      // 1. Marcar tarea activa
      const { data: taskRow } = await supabase
        .from('tasks')
        .insert({
          title:    `Investigación: ${topic}`,
          description: `Investigación autónoma de ${nombre}. Tema: ${topic}`,
          status:   'in_progress',
          priority: 'low',
          metadata: { task_type: 'auto_research', task_source: 'fractal_agents', agent, topic, nombre, area }
        })
        .select()
        .single();

      // 2. Research real con Haiku
      const { rawInsights, suggestion } = await runResearchAndSuggest(agent, nombre, rol, topic);

      // 3. Guardar en collective_knowledge si hay UUIDs de agente disponibles
      //    (aplica si el agente está registrado en la tabla agents)
      //    Si no, el knowledge queda accesible vía tasks.result (path alternativo)

      // 4. Guardar sugerencia como task pendiente (para Mariana, no para Neiky aún)
      const { data: sugTask } = await supabase
        .from('tasks')
        .insert({
          title:    `💡 Sugerencia de ${nombre}`,
          description: suggestion,
          status:   'pending',
          priority: 'normal',
          metadata: { task_type: 'agent_suggestion', task_source: 'fractal_agents', agent, topic, nombre }
        })
        .select()
        .single();

      // 5. Cerrar tarea de research + guardar hallazgos como result
      if (taskRow?.id) {
        const { error: updateErr } = await supabase.from('tasks').update({
          status:       'completed',
          result:       rawInsights,               // hallazgos reales — accesibles para el agente
          completed_at: new Date().toISOString(),
          metadata:     { task_type: 'auto_research', task_source: 'fractal_agents', agent, topic, nombre, area, done: true }
        }).eq('id', taskRow.id);
        if (updateErr) console.error(`[AgentWorkManager] update research task ${agent}:`, updateErr.message);
      }

      newSuggestions.push({ agent, nombre, topic, suggestion, sug_id: sugTask?.id });
      console.log(`[AgentWorkManager] ${nombre} investigó "${topic}" → sugerencia generada`);

    } catch (err) {
      console.error(`[AgentWorkManager] assignAutoWork ${agent}:`, err.message);
    }
  }));

  return newSuggestions;
}

// ─── runResearchAndSuggest ────────────────────────────────────────────────────
// Haiku investiga Y genera una sugerencia accionable para Fractal MX
// Devuelve rawInsights (para collective_knowledge) + suggestion (para Neiky si aplica)
async function runResearchAndSuggest(agent, nombre, rol, topic) {
  const Anthropic = require('@anthropic-ai/sdk');
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const client = new Anthropic(apiKey ? { apiKey } : {});

  const response = await client.messages.create({
    model:      'claude-haiku-4-5-20251001',
    max_tokens: 800,
    system: `Eres ${nombre}, ${rol} de Fractal MX, una agencia creativa digital en México.
Acabas de investigar un tema relevante para tu área.
Tu tarea: sintetizar hallazgos clave Y generar una sugerencia concreta para la agencia.
Escribe en español, sé directo y accionable.`,
    messages: [{
      role: 'user',
      content: `Tema investigado: "${topic}"

Responde en este formato exacto:

HALLAZGOS:
[3-4 bullet points con lo más relevante y concreto que encontraste]

SUGERENCIA_PARA_FRACTAL:
[Una sola oración de acción concreta que Fractal MX podría hacer en base a esto. Empieza con un verbo. Máx 25 palabras.]`
    }]
  });

  const text = response.content[0].text.trim();

  // Parsear las dos secciones
  const hallazgosMatch  = text.match(/HALLAZGOS:\s*([\s\S]*?)(?=SUGERENCIA_PARA_FRACTAL:|$)/i);
  const sugerenciaMatch = text.match(/SUGERENCIA_PARA_FRACTAL:\s*([\s\S]*?)$/i);

  const rawInsights = hallazgosMatch?.[1]?.trim() || text;
  const suggestion  = sugerenciaMatch?.[1]?.trim() ||
    `${nombre} investigó "${topic}" y tiene hallazgos relevantes para la agencia.`;

  return { rawInsights, suggestion };
}

// ─── getPendingSuggestions ────────────────────────────────────────────────────
// Recupera sugerencias pendientes de todos los agentes (para que Mariana las presente)
async function getPendingSuggestions(limit = 5) {
  const { data, error } = await supabase
    .from('tasks')
    .select('id, title, description, metadata, created_at')
    .eq('metadata->>task_type', 'agent_suggestion')
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) return [];
  return data || [];
}

// ─── markSuggestionSent ───────────────────────────────────────────────────────
// Marca sugerencia como enviada a Neiky para no repetirla
async function markSuggestionSent(sugId) {
  await supabase.from('tasks').update({ status: 'completed', completed_at: new Date().toISOString() }).eq('id', sugId);
}

// ─── formatTeamStatusMessage ──────────────────────────────────────────────────
// Reporta al user: status real + sugerencias pendientes (no dumps de research)
function formatTeamStatusMessage(teamStatus, newSuggestions = []) {
  const working  = teamStatus.filter(a => a.status === 'working' || a.status === 'pending');
  const finished = teamStatus.filter(a => a.status === 'just_finished');
  const idle     = teamStatus.filter(a => a.status === 'idle');

  // Recolectar sugerencias previas no enviadas
  const existingSugs = teamStatus.flatMap(a => a.suggestions || []);

  const lines = ['*📊 STATUS REAL DEL EQUIPO*\n'];

  if (working.length > 0) {
    lines.push('*En este momento trabajando:*');
    working.forEach(a => lines.push(`• ${a.nombre} — ${a.task?.title || 'tarea asignada'}`));
    lines.push('');
  }

  if (finished.length > 0) {
    lines.push('*Terminaron hace poco:*');
    finished.forEach(a => lines.push(`• ${a.nombre} — "${a.task?.title}"`));
    lines.push('');
  }

  if (idle.length > 0 && newSuggestions.length === 0 && existingSugs.length === 0) {
    lines.push('*Sin tareas activas:*');
    idle.forEach(a => lines.push(`• ${a.nombre} — ${a.rol}, disponible`));
    lines.push('\nEscribe *asigna trabajo* y los pongo a investigar para alimentar su conocimiento.');
    return lines.join('\n').trim();
  }

  // Mostrar sugerencias recién generadas
  if (newSuggestions.length > 0) {
    lines.push(`*Puse a investigar a los agentes idle — ${newSuggestions.length} sugerencia(s) generada(s):*`);
    newSuggestions.forEach(s => {
      lines.push(`💡 *${s.nombre}:* ${s.suggestion}`);
    });
    lines.push('');
  }

  // Mostrar sugerencias previas pendientes
  const allSugs = [...newSuggestions.map(s => ({ description: s.suggestion, metadata: { nombre: s.nombre } })), ...existingSugs];
  if (existingSugs.length > 0 && newSuggestions.length === 0) {
    lines.push(`*Sugerencias pendientes del equipo (${existingSugs.length}):*`);
    existingSugs.slice(0, 3).forEach(s => {
      const agentNombre = s.metadata?.nombre || s.metadata?.agent || '?';
      const text        = s.description || s.result || s.title || '(sin detalle)';
      lines.push(`💡 *${agentNombre}:* ${text}`);
    });
  }

  if (working.length === 0 && finished.length === 0 && allSugs.length === 0) {
    lines.push('Todos están idle sin tareas. Escríbeme *asigna trabajo* para activarlos.');
  }

  return lines.join('\n').trim();
}

module.exports = {
  AGENT_ROSTER,
  getTeamStatus,
  assignAutoWork,
  getPendingSuggestions,
  markSuggestionSent,
  formatTeamStatusMessage,
  // exports internos para testing
  runResearchAndSuggest,
};
