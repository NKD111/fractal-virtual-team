// backend/src/core/qc-gate.js
// QC-Bot intercept layer: before ANY email leaves the system, run a
// quality check vs the promised deliverables. If reject, return suggestions
// instead of letting it through.

const Anthropic = require('@anthropic-ai/sdk');
const { supabase } = require('./supabase');
const { audit } = require('./telemetry');

const anthropic = process.env.ANTHROPIC_API_KEY
  ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  : null;

/**
 * Reviews an outbound email vs what was promised.
 * @param {object} args
 * @param {string} args.taskId
 * @param {string} args.agent
 * @param {string} args.subject
 * @param {string} args.html
 * @param {Array}  args.promised  [{type, desc}, …]
 * @param {Array}  args.delivered [{type, url|note, …}, …]
 * @returns {Promise<{passed:boolean, score:number, issues:string[], suggestion:string}>}
 */
async function reviewEmail({ taskId, agent, subject, html, promised = [], delivered = [] }) {
  // Quick rule-based checks first (no API cost)
  const issues = [];
  if (!subject || subject.length < 10) issues.push('Asunto muy corto o vacío');
  if (!html || html.replace(/<[^>]+>/g, '').trim().length < 60) issues.push('Cuerpo demasiado corto');

  // Did the email actually mention each promised deliverable?
  const text = (html || '').toLowerCase();
  for (const p of promised) {
    if (p.type === 'image' && !text.includes('img') && !text.includes('imagen') && !text.includes('referencia')) {
      issues.push(`Prometí imagen pero no la veo referenciada en el correo`);
    }
  }

  // If hard fails already, return without spending Claude tokens
  if (issues.length >= 2 || !anthropic) {
    const passed = issues.length === 0;
    await persistReview({ taskId, agent, passed, score: passed ? 7 : 4, issues, preview: subject });
    return { passed, score: passed ? 7 : 4, issues, suggestion: '' };
  }

  // Claude evaluation
  const promisedTxt = promised.map(p => `- ${p.type}: ${p.desc}`).join('\n');
  const deliveredTxt = delivered.map(d => `- ${d.type}: ${d.url ? '(con archivo)' : d.note || d.desc || ''}`).join('\n');

  try {
    const res = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      system: `Eres QC-BOT, brutal quality reviewer en Fractal MX. Lees emails antes de
salir y verificas:
1. Asunto profesional y claro
2. Tono coherente con marca (cálido pero profesional, sin generic ni IA-vibes)
3. Promesas vs entregables: TODOS los items prometidos están reflejados
4. Sin info confidencial leakeada (no mencionar otros clientes por nombre)
5. Sin promesas de fechas imposibles
6. CTA o próximo paso claro

Devuelve JSON SOLO:
{ "passed": <bool>, "score": <0-10>, "issues": ["…"], "suggestion": "<si reject, qué cambiar; si approved, ''>" }`,
      messages: [{
        role: 'user',
        content:
`Email saliendo de ${agent.toUpperCase()}:
SUBJECT: ${subject}
PROMETIDO:
${promisedTxt}
ENTREGADO:
${deliveredTxt}
HTML (primeros 2000 chars):
${html.slice(0, 2000)}`
      }]
    });
    const txt = res.content[0]?.text || '{}';
    const cleaned = txt.replace(/```json\s*|\s*```/g, '').trim();
    const verdict = JSON.parse(cleaned);
    const passed = verdict.passed === true && (verdict.score || 0) >= 6.5;
    await persistReview({ taskId, agent, passed, score: verdict.score || 0, issues: verdict.issues || [], preview: subject });
    return {
      passed,
      score: verdict.score || 0,
      issues: verdict.issues || [],
      suggestion: verdict.suggestion || ''
    };
  } catch (err) {
    // Fail-open: if QC service breaks, let the email through but log
    console.warn('[QC] review failed, letting through:', err.message);
    await audit({ actor: 'qcbot', action: 'review.error', target: taskId, details: { error: err.message }, ok: false });
    return { passed: true, score: 5, issues: ['QC service unavailable'], suggestion: '' };
  }
}

async function persistReview({ taskId, agent, passed, score, issues, preview }) {
  try {
    await supabase.from('qc_reviews').insert({
      task_id: taskId, agent, output_kind: 'email',
      passed, score, issues, output_preview: String(preview || '').slice(0, 200)
    });
    await audit({
      actor: 'qcbot', action: passed ? 'review.passed' : 'review.failed',
      target: taskId, details: { agent, score, issues }
    });
  } catch (e) { /* silent */ }
}

module.exports = { reviewEmail };
