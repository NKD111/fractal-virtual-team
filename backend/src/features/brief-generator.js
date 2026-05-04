// backend/src/features/brief-generator.js
// A1: Brief Generator Automático

const Anthropic = require('@anthropic-ai/sdk');
const { supabase } = require('../core/supabase');

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

class BriefGenerator {
  async generateFromConversation({ conversationId, clientId, projectType }) {
    const { data: messages } = await supabase
      .from('messages')
      .select('role, content, created_at')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true });
    if (!messages?.length) throw new Error('No hay mensajes en la conversación');

    const { data: client } = await supabase
      .from('clients').select('*').eq('id', clientId).maybeSingle();

    const conversationText = messages
      .map(m => `${m.role === 'user' ? 'Cliente' : 'Mariana'}: ${m.content}`)
      .join('\n')
      .substring(0, 8000);

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2000,
      system: `Eres el sistema Brief Generator de Fractal MX (agencia creativa AI-powered, CDMX).
Extrae información de la conversación para crear un brief de proyecto estructurado.
Responde SOLO en JSON válido, sin markdown ni explicaciones.`,
      messages: [{
        role: 'user',
        content: `Cliente: ${client?.name || 'Desconocido'}
Tipo de proyecto: ${projectType}

Conversación:
${conversationText}

Genera un brief JSON con esta estructura exacta:
{
  "project_type": "",
  "objective": "",
  "target_audience": "",
  "key_messages": ["", ""],
  "deliverables": ["", ""],
  "timeline": "",
  "references_links": [],
  "special_requirements": "",
  "tone": "",
  "missing_info": []
}`
      }]
    });

    let briefData;
    try { briefData = JSON.parse(response.content[0].text); }
    catch { briefData = { error: 'parse_failed', raw: response.content[0].text }; }

    const { data: brief } = await supabase.from('project_briefs').insert({
      client_id: clientId,
      client_name: client?.name,
      project_type: projectType,
      objective: briefData.objective,
      target_audience: briefData.target_audience,
      key_messages: briefData.key_messages || [],
      deliverables: briefData.deliverables || [],
      timeline: briefData.timeline,
      references_links: briefData.references_links || [],
      special_requirements: briefData.special_requirements,
      tone: briefData.tone,
      missing_info: briefData.missing_info || [],
      status: 'draft'
    }).select().single();

    if (briefData.missing_info?.length > 0) {
      return {
        brief, complete: false,
        missing: briefData.missing_info,
        follow_up_questions: await this.generateFollowUpQuestions(briefData.missing_info)
      };
    }
    return { brief, complete: true, missing: [] };
  }

  async generateFollowUpQuestions(missingFields) {
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 500,
      messages: [{
        role: 'user',
        content: `Genera preguntas naturales en español mexicano (tono Mariana: amable, profesional) para obtener información faltante en un brief de video/diseño:
${missingFields.join('\n')}

Una pregunta por campo. Formato JSON: ["pregunta1", "pregunta2"]`
      }]
    });
    try { return JSON.parse(response.content[0].text); }
    catch { return missingFields.map(f => `¿Podrías contarme más sobre ${f}?`); }
  }
}

module.exports = BriefGenerator;
