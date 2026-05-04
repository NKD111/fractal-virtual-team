// backend/src/nervous-system/knowledge-graph.js
// Fractal Virtual Team — Fase 5 MEGAZORD
// Sistema 7: Knowledge Graph Dinámico — El cerebro del equipo

const Graph = require('graphology');
const { createClient } = require('@supabase/supabase-js');
const Anthropic = require('@anthropic-ai/sdk');

class KnowledgeGraph {
  constructor() {
    // Multi-graph: permite múltiples edges entre mismo par de nodos (distintas relaciones)
    this.graph = new Graph({ multi: true, allowSelfLoops: false });
    this.supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY
    );
    this.claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    this._loaded = false;
  }

  /**
   * Cargar grafo desde Supabase
   */
  async loadFromDatabase() {
    if (this._loaded) return;

    try {
      // Cargar memorias como nodos
      const { data: memories } = await this.supabase
        .from('collective_memory')
        .select('id, category, topic, effectiveness_score, client_specific, tags, is_active')
        .eq('is_active', true)
        .limit(500);

      (memories || []).forEach(m => {
        if (!this.graph.hasNode(m.id)) {
          this.graph.addNode(m.id, {
            category: m.category,
            topic: m.topic,
            effectiveness: m.effectiveness_score || 0,
            client: m.client_specific,
            tags: m.tags || []
          });
        }
      });

      // Cargar relaciones como edges
      const { data: relationships } = await this.supabase
        .from('knowledge_relationships')
        .select('*')
        .limit(1000);

      (relationships || []).forEach(rel => {
        if (this.graph.hasNode(rel.source_id) && this.graph.hasNode(rel.target_id)) {
          try {
            this.graph.addEdge(rel.source_id, rel.target_id, {
              type: rel.relationship_type,
              strength: rel.strength || 0.5
            });
          } catch {
            // Edge ya existe — ignorar en multi-graph no debería pasar pero por seguridad
          }
        }
      });

      this._loaded = true;
      console.log(`[KnowledgeGraph] ✅ Grafo cargado: ${this.graph.order} nodos, ${this.graph.size} edges`);
    } catch (err) {
      console.warn('[KnowledgeGraph] Error loading from DB:', err.message);
    }
  }

  /**
   * Agregar memoria al grafo y crear relaciones automáticamente
   */
  async addMemory(memory) {
    if (!memory?.id) return;

    // Agregar nodo
    if (!this.graph.hasNode(memory.id)) {
      this.graph.addNode(memory.id, {
        category: memory.category,
        topic: memory.topic,
        effectiveness: memory.effectiveness_score || 0,
        client: memory.client_specific,
        tags: memory.tags || []
      });
    }

    // Detectar relaciones con nodos existentes
    await this._detectAndAddRelationships(memory);
  }

  async _detectAndAddRelationships(memory) {
    // Buscar nodos con tags similares
    const relatedNodes = [];
    this.graph.forEachNode((nodeId, attrs) => {
      if (nodeId === memory.id) return;
      const commonTags = (memory.tags || []).filter(t => (attrs.tags || []).includes(t));
      if (commonTags.length > 0 || attrs.client === memory.client_specific) {
        relatedNodes.push({ id: nodeId, topic: attrs.topic, commonTags });
      }
    });

    if (!relatedNodes.length) return;

    // Crear relaciones con los más relevantes
    for (const related of relatedNodes.slice(0, 3)) {
      try {
        const strength = Math.min(0.9, 0.3 + related.commonTags.length * 0.2);
        this.graph.addEdge(memory.id, related.id, {
          type: 'related_to',
          strength
        });

        // Persistir en DB
        await this.supabase.from('knowledge_relationships').insert({
          source_id: memory.id,
          target_id: related.id,
          relationship_type: 'related_to',
          strength
        }).catch(() => {});
      } catch {
        // Edge ya existe
      }
    }
  }

  /**
   * Encontrar conocimiento relacionado (BFS por el grafo)
   */
  findRelatedKnowledge(memoryId, depth = 2) {
    if (!this.graph.hasNode(memoryId)) return [];

    const related = new Set();
    const queue = [{ id: memoryId, d: 0 }];
    const visited = new Set([memoryId]);

    while (queue.length > 0) {
      const { id, d } = queue.shift();
      if (d >= depth) continue;

      this.graph.forEachNeighbor(id, (neighborId) => {
        if (!visited.has(neighborId)) {
          visited.add(neighborId);
          related.add(neighborId);
          queue.push({ id: neighborId, d: d + 1 });
        }
      });
    }

    return Array.from(related);
  }

  /**
   * Identificar nodos críticos (knowledge hubs — más conectados)
   */
  identifyKnowledgeHubs(minDegree = 5) {
    const hubs = [];

    this.graph.forEachNode((nodeId, attrs) => {
      const degree = this.graph.degree(nodeId);
      if (degree >= minDegree) {
        hubs.push({
          id: nodeId,
          topic: attrs.topic,
          category: attrs.category,
          connections: degree,
          effectiveness: attrs.effectiveness
        });
      }
    });

    return hubs.sort((a, b) => b.connections - a.connections).slice(0, 10);
  }

  /**
   * Detectar gaps de conocimiento (memorias aisladas o poco efectivas)
   */
  detectKnowledgeGaps() {
    const isolated = [];

    this.graph.forEachNode((nodeId, attrs) => {
      const degree = this.graph.degree(nodeId);
      if (degree === 0) {
        isolated.push({ id: nodeId, topic: attrs.topic, effectiveness: attrs.effectiveness });
      }
    });

    return {
      isolated_memories: isolated.length,
      details: isolated.slice(0, 5),
      recommendation: isolated.length > 0
        ? `${isolated.length} memorias aisladas — podrían beneficiarse de más conexiones`
        : 'Grafo bien conectado'
    };
  }

  /**
   * Stats del grafo
   */
  getStats() {
    return {
      nodes: this.graph.order,
      edges: this.graph.size,
      hubs: this.identifyKnowledgeHubs(3).length,
      gaps: this.detectKnowledgeGaps().isolated_memories,
      loaded: this._loaded
    };
  }

  /**
   * Actualizar efectividad de un nodo cuando su memoria es validada
   */
  updateNodeEffectiveness(memoryId, delta) {
    if (!this.graph.hasNode(memoryId)) return;
    const current = this.graph.getNodeAttribute(memoryId, 'effectiveness') || 0;
    this.graph.setNodeAttribute(memoryId, 'effectiveness', Math.max(0, Math.min(1, current + delta)));
  }
}

module.exports = KnowledgeGraph;
