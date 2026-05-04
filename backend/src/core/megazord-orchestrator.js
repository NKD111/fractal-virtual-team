// backend/src/core/megazord-orchestrator.js
// Fractal Virtual Team — Fase 5 MEGAZORD
// El cerebro maestro del Sistema Nervioso Colectivo

const { ChannelBus, getChannelBus } = require('../nervous-system/channel-bus');
const CollectiveMemory = require('../nervous-system/collective-memory');
const DistributedLearning = require('../nervous-system/distributed-learning');
const CoordinationEngine = require('../nervous-system/coordination-engine');
const ConflictDetector = require('../nervous-system/conflict-detector');
const HuddleSystem = require('../nervous-system/huddle-system');
const KnowledgeGraph = require('../nervous-system/knowledge-graph');

class MegazordOrchestrator {
  constructor() {
    // Sistema 1: Channel Bus
    this.bus = getChannelBus();

    // Sistema 2: Memoria Colectiva
    this.memory = new CollectiveMemory();

    // Sistema 3: Aprendizaje Distribuido
    this.learning = new DistributedLearning(this.bus, this.memory);

    // Sistema 4: Coordinación Inteligente
    this.coordination = new CoordinationEngine(this.bus, this.memory);

    // Sistema 5: Detector de Conflictos
    this.conflicts = new ConflictDetector(this.bus);

    // Sistema 6: Huddle System
    this.huddles = new HuddleSystem(this.bus, this.memory);

    // Sistema 7: Knowledge Graph
    this.knowledgeGraph = new KnowledgeGraph();

    this._initialized = false;
  }

  /**
   * Inicializar el MEGAZORD completo
   */
  async initialize() {
    if (this._initialized) return;
    console.log('\n🤖 MEGAZORD — Iniciando Sistema Nervioso Colectivo...');

    try {
      // 1. Channel Bus (Redis Pub/Sub)
      await this.bus.initialize();
      console.log('  ✓ Sistema 1: Channel Bus activo');

      // 2. Memoria Colectiva
      await this.memory.initialize();
      console.log('  ✓ Sistema 2: Memoria Colectiva lista');

      // 3. Aprendizaje Distribuido — suscribir a canales
      this.learning.subscribe();
      console.log('  ✓ Sistema 3: Aprendizaje Distribuido suscrito');

      // 4. Coordinación (no necesita init especial)
      console.log('  ✓ Sistema 4: Motor de Coordinación listo');

      // 5. Detector de Conflictos — suscribir
      this.conflicts.subscribe();
      console.log('  ✓ Sistema 5: Detector de Conflictos suscrito');

      // 6. Huddle System — suscribir
      this.huddles.subscribe();
      console.log('  ✓ Sistema 6: Sistema de Huddles suscrito');

      // 7. Knowledge Graph — cargar desde DB
      await this.knowledgeGraph.loadFromDatabase();
      const kgStats = this.knowledgeGraph.getStats();
      console.log(`  ✓ Sistema 7: Knowledge Graph cargado (${kgStats.nodes} nodos, ${kgStats.edges} edges)`);

      this._initialized = true;
      console.log('🧠 MEGAZORD ACTIVO — 11 agentes operando como organismo colectivo\n');
    } catch (err) {
      console.error('[MEGAZORD] Error en inicialización:', err.message);
      // No lanzar — MEGAZORD falla gracefully
    }
  }

  /**
   * Punto de entrada para procesar eventos del equipo
   */
  async processTeamEvent(event) {
    if (!this._initialized) return null;

    switch (event.type) {
      case 'new_project':
        return this.coordination.coordinateProjectStart(event.payload);

      case 'agent_learned':
        return this.learning.distributeKnowledge(event);

      case 'decision_needed':
        return this.huddles.convokeHuddle(event.payload);

      case 'task_completed':
        return this.coordination.handleAgentCompletion(
          event.agent_slug,
          event.task,
          event.output
        );

      case 'correction_received':
        return this.learning.learnFromCorrection(event);

      case 'project_completed':
        return this.learning.extractLessonsFromProject(event);

      default:
        return this.bus.emit('agent:events', event).catch(() => null);
    }
  }

  /**
   * Status completo del organismo
   */
  async getOrganismStatus() {
    const [memTotal, activeCollab, unresolvedConflicts, activeHuddles] = await Promise.allSettled([
      this.memory.getTotalMemories(),
      this.coordination.getActiveCollaborations(),
      this.conflicts.getUnresolvedConflicts(),
      this.huddles.getActiveHuddles()
    ]);

    const busStats = await this.bus.getStats().catch(() => ({}));
    const kgStats = this.knowledgeGraph.getStats();

    return {
      initialized: this._initialized,
      bus: busStats,
      memory: {
        total_memories: memTotal.status === 'fulfilled' ? memTotal.value : 0
      },
      collaborations: {
        active: activeCollab.status === 'fulfilled' ? activeCollab.value.count : 0
      },
      conflicts: {
        unresolved: unresolvedConflicts.status === 'fulfilled' ? unresolvedConflicts.value.count : 0
      },
      huddles: {
        in_progress: activeHuddles.status === 'fulfilled' ? activeHuddles.value.count : 0
      },
      knowledge_graph: kgStats
    };
  }

  /**
   * Ayudante: cualquier agente consulta memoria colectiva
   */
  async queryMemory(question, agent, context = {}) {
    if (!this._initialized) return null;
    return this.memory.query({ question, agent, context });
  }

  /**
   * Ayudante: cualquier agente contribuye a memoria colectiva
   */
  async contributeMemory({ agent, category, topic, content, context = {}, clientSpecific = null, tags = [] }) {
    if (!this._initialized) return null;
    const memory = await this.memory.storeMemory({ agent, category, topic, content, context, clientSpecific, tags });
    if (memory) await this.knowledgeGraph.addMemory(memory);
    return memory;
  }

  /**
   * Ayudante: emitir evento al bus
   */
  async emitEvent(channel, event) {
    if (!this._initialized) return null;
    return this.bus.emit(channel, event);
  }
}

// Singleton
let instance = null;

function getMegazord() {
  if (!instance) instance = new MegazordOrchestrator();
  return instance;
}

module.exports = { MegazordOrchestrator, getMegazord };
