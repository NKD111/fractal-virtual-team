// backend/src/core/intelligence-engine.js
// Orquestador principal de los 10 sistemas de inteligencia
'use strict';

const patternAnalyzer = require('../intelligence/pattern-analyzer');
const decisionEngine = require('../intelligence/decision-engine');
const feedbackLearner = require('../intelligence/feedback-learner');
const selfEvaluation = require('../intelligence/self-evaluation');
const smartEscalation = require('../intelligence/smart-escalation');
const supervisionManager = require('./supervision-manager');
const { BUSINESS_KNOWLEDGE, detectRedFlags, detectGreenFlags, getClientRules } = require('../intelligence/business-understanding');

class IntelligenceEngine {
  constructor() {
    this.patternAnalyzer = patternAnalyzer;
    this.decisionEngine = decisionEngine;
    this.feedbackLearner = feedbackLearner;
    this.selfEvaluation = selfEvaluation;
    this.smartEscalation = smartEscalation;
    this.supervisionManager = supervisionManager;
    this._initialized = false;
  }

  initialize() {
    this._initialized = true;
    console.log('🧠 Intelligence Engine v1.0 activado');
    console.log('   ✅ Pattern Analyzer');
    console.log('   ✅ Decision Engine');
    console.log('   ✅ Feedback Learner');
    console.log('   ✅ Self-Evaluation');
    console.log('   ✅ Smart Escalation');
    console.log('   ✅ Supervision Manager');
    console.log('   ✅ Business Understanding');
  }

  /**
   * Se llama ANTES de que el agente genere una respuesta.
   * Enriquece el contexto con patrones, red flags, business rules.
   */
  async beforeAgentResponse(agent, message, context = {}) {
    const enriched = { ...context };

    try {
      // 1. Detectar red flags y green flags en el mensaje
      const redFlags = detectRedFlags(message || '');
      const greenFlags = detectGreenFlags(message || '');
      if (redFlags.length > 0) enriched.redFlags = redFlags;
      if (greenFlags.length > 0) enriched.greenFlags = greenFlags;

      // 2. Contexto específico del cliente si aplica
      if (context.clientName) {
        enriched.clientRules = getClientRules(context.clientName);
      }

      // 3. Analizar patrones si hay clientId
      if (context.clientId) {
        enriched.clientPatterns = await this.patternAnalyzer.analyzeClientPatterns(context.clientId)
          .catch(() => null);
      }

      // 4. Determinar nivel de autonomía del agente
      if (agent && agent.id) {
        enriched.canActAutonomously = await this.supervisionManager
          .shouldActAutonomously(agent.id, context.situationType || 'standard_response')
          .catch(() => false);
      }

      // 5. Clasificar tipo de situación y decisión necesaria
      if (message) {
        const situationType = this.decisionEngine.classifySituationType(message, context);
        enriched.situationType = situationType;
        enriched.decisionLevel = this.decisionEngine.classifyDecisionLevel(situationType);
      }

    } catch (err) {
      console.warn('[IntelligenceEngine] beforeAgentResponse error:', err.message);
    }

    return enriched;
  }

  /**
   * Se llama DESPUÉS de que el agente generó una respuesta.
   * Detecta promesas, trackea preguntas, auto-evalúa.
   */
  async afterAgentResponse(agent, response, context = {}) {
    if (!agent || !response) return;

    // Non-blocking: wrap en setImmediate para no añadir latencia
    setImmediate(async () => {
      try {
        // 1. Auto-evaluación ligera
        if (agent.id) {
          await this.selfEvaluation.evaluateAction(
            agent.id,
            { content: response, description: response.substring(0, 200) },
            { success: true }
          ).catch(() => {});
        }

        // 2. Actualizar trust score ligeramente por acción exitosa
        if (agent.id) {
          await this.supervisionManager.updateTrustScore(agent.id, 0.1).catch(() => {});
        }

      } catch (err) {
        console.warn('[IntelligenceEngine] afterAgentResponse error:', err.message);
      }
    });
  }

  /**
   * Procesa correcciones de Neiky hacia un agente
   */
  async onNeikyCorrection(originalAction, correctionText, agentId) {
    try {
      const lesson = await this.feedbackLearner.captureCorrection(
        originalAction, correctionText, agentId
      );

      // Reducir trust score por corrección recibida
      if (agentId) {
        await this.supervisionManager.updateTrustScore(agentId, -2).catch(() => {});
      }

      return lesson;
    } catch (err) {
      console.warn('[IntelligenceEngine] onNeikyCorrection error:', err.message);
      return null;
    }
  }

  /**
   * Escala una situación a Neiky con contexto completo
   */
  async escalate(situation, context = {}) {
    return this.smartEscalation.escalateWithContext(situation, context);
  }

  /**
   * Genera el Trust Dashboard para todos los agentes
   */
  async getTrustDashboard() {
    return this.supervisionManager.generateTrustDashboard();
  }
}

// Singleton
const engine = new IntelligenceEngine();
module.exports = engine;
