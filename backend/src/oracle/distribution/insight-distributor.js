// backend/src/oracle/distribution/insight-distributor.js
// Decides if an insight is valuable, identifies relevant agents, and shares it.

const Anthropic = require('@anthropic-ai/sdk');
const { supabase } = require('../../core/supabase');

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

class InsightDistributor {
  async consider(result, sourceAgent) {
    const importance = this.estimateImportance(result);
    if (importance < 3) return; // not worth distributing
    await this.distribute({
      content: result.answer,
      sourceAgent,
      importance
    });
  }

  estimateImportance(result) {
    const len = result?.answer?.length || 0;
    if (len > 1500) return 5;
    if (len > 1000) return 4;
    if (len > 500)  return 3;
    return 2;
  }

  async distribute({ content, sourceAgent, importance }) {
    try {
      const { data: allAgents } = await supabase
        .from('agents')
        .select('id, name, role')
        .neq('id', sourceAgent.agentData?.id || sourceAgent.id);

      if (!allAgents?.length) return;

      // Use Haiku (cheap) to identify which agents should care
      const relevanceCheck = await anthropic.messages.create({
        model: 'claude-haiku-4-5',
        max_tokens: 300,
        messages: [{
          role: 'user',
          content: `Insight: "${String(content).substring(0, 300)}"

Agentes disponibles: ${allAgents.map(a => `${a.name} (${a.role})`).join(', ')}

¿Qué agentes deberían recibir este insight? Responde SOLO los nombres separados por coma, sin explicación.`
        }]
      });

      const relevantNames = (relevanceCheck.content?.[0]?.text || '')
        .split(',')
        .map(n => n.trim().toLowerCase())
        .filter(Boolean);

      const relevantAgents = allAgents.filter(a =>
        relevantNames.some(n => a.name.toLowerCase().includes(n))
      );

      if (!relevantAgents.length) return;

      await supabase.from('oracle_distributions').insert({
        insight_topic: `Insight de ${sourceAgent.agentData?.name || sourceAgent.name || sourceAgent.slug}`,
        insight_content: String(content).substring(0, 1000),
        importance,
        distributed_to: relevantAgents.map(a => a.id)
      });

      console.log(`🔮 ORACLE distribuyó insight a: ${relevantAgents.map(a => a.name).join(', ')}`);
    } catch (err) {
      console.warn('[InsightDistributor] distribute error:', err.message);
    }
  }
}

module.exports = InsightDistributor;
