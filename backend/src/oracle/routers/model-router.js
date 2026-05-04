// backend/src/oracle/routers/model-router.js
// Decides whether a query should use Haiku, Sonnet, or Opus based on complexity.

class ModelRouter {
  constructor() {
    // Cost per 1K tokens (USD) — input / output
    this.costs = {
      haiku:  { input: 0.00025, output: 0.00125 },
      sonnet: { input: 0.003,   output: 0.015   },
      opus:   { input: 0.015,   output: 0.075   }
    };
  }

  async determineModel({ question, depth, requireResearch }) {
    if (depth && depth !== 'auto') {
      const model = this.depthToModel(depth);
      return { model, depth, estimated_cost: this.estimateCost(depth) };
    }

    // Research minimum = Sonnet (needs synthesis quality)
    if (requireResearch) {
      return { model: 'sonnet', depth: 'standard', estimated_cost: this.estimateCost('standard') };
    }

    const score = this.scoreComplexity(question);
    if (score < 30) return { model: 'haiku',  depth: 'quick',    estimated_cost: this.estimateCost('quick') };
    if (score < 70) return { model: 'sonnet', depth: 'standard', estimated_cost: this.estimateCost('standard') };
    return             { model: 'opus',   depth: 'premium',  estimated_cost: this.estimateCost('premium') };
  }

  scoreComplexity(question = '') {
    let score = 20; // baseline
    const lq = question.toLowerCase();

    // Simple indicators
    if (/^(qué|cuál|cuándo|dónde|cuánto|sí o no|what|when|where|how much)/i.test(lq)) score -= 10;
    if (question.length < 50) score -= 10;

    // Medium indicators
    if (/(cómo|por qué|recomiend|compara|analiz|why|how|recommend|compare)/i.test(lq)) score += 20;
    if (question.length > 150) score += 15;

    // Complex indicators
    if (/(estrategia|decisión|implicaciones|predic|evalúa|considera todas|strategy|decide|implications|predict|evaluate)/i.test(lq)) score += 40;
    if (question.length > 400) score += 20;

    return Math.max(0, Math.min(100, score));
  }

  depthToModel(depth) {
    return { quick: 'haiku', standard: 'sonnet', premium: 'opus' }[depth] || 'sonnet';
  }

  estimateCost(depth) {
    const tokens = {
      quick:    { i: 200, o: 200  },
      standard: { i: 500, o: 1000 },
      premium:  { i: 800, o: 2000 }
    };
    const model = this.depthToModel(depth);
    const t = tokens[depth] || tokens.standard;
    const c = this.costs[model];
    return (t.i / 1000) * c.input + (t.o / 1000) * c.output;
  }

  // Compute actual cost from real token usage
  actualCost(model, inputTokens, outputTokens) {
    const c = this.costs[model] || this.costs.sonnet;
    return (inputTokens / 1000) * c.input + (outputTokens / 1000) * c.output;
  }
}

module.exports = ModelRouter;
