// backend/src/core/mariana-context.js
// Memoria de Mariana sobre cada cliente. Construye su system prompt con context cargado.

const { supabase } = require('./supabase');

class MarianaContext {

  /**
   * Recupera el context guardado para un cliente.
   * @returns {Object|null}
   */
  static async get(whatsapp) {
    const cleaned = this._normalizePhone(whatsapp);
    const { data, error } = await supabase
      .from('mariana_context')
      .select('*')
      .eq('client_whatsapp', cleaned)
      .single();
    if (error && error.code !== 'PGRST116') {
      console.warn('[MarianaContext.get]', error.message);
      return null;
    }
    return data || null;
  }

  /**
   * Crea/actualiza context. Upsert por client_whatsapp.
   */
  static async update(whatsapp, newInfo = {}) {
    const cleaned = this._normalizePhone(whatsapp);
    try {
      const existing = await this.get(cleaned);
      const merged = {
        client_whatsapp: cleaned,
        last_contact: new Date().toISOString(),
        total_messages: (existing?.total_messages || 0) + (newInfo.message_increment ? 1 : 0),
        ...existing,
        ...newInfo,
        // siempre actualizar last_contact aunque newInfo no lo traiga
        last_contact: newInfo.last_contact || new Date().toISOString()
      };
      delete merged.message_increment;
      delete merged.id;

      const { data, error } = await supabase
        .from('mariana_context')
        .upsert(merged, { onConflict: 'client_whatsapp' })
        .select()
        .single();
      if (error) {
        console.warn('[MarianaContext.update]', error.message);
        return null;
      }
      return data;
    } catch (e) {
      console.warn('[MarianaContext.update] exception:', e.message);
      return null;
    }
  }

  /**
   * Recupera los últimos N mensajes de la conversación.
   */
  static async getHistory(whatsapp, limit = 5) {
    const cleaned = this._normalizePhone(whatsapp);
    try {
      const { data: convs } = await supabase
        .from('conversations')
        .select('id')
        .eq('client_whatsapp', cleaned)
        .limit(1);
      if (!convs || convs.length === 0) return [];
      const convId = convs[0].id;
      // Probar tabla 'messages' (existing) — schema flexible
      const { data: msgs } = await supabase
        .from('messages')
        .select('role, content, direction, created_at, timestamp')
        .eq('conversation_id', convId)
        .order('created_at', { ascending: false, nullsFirst: false })
        .limit(limit);
      return (msgs || []).reverse();
    } catch (e) {
      console.warn('[MarianaContext.getHistory]', e.message);
      return [];
    }
  }

  /**
   * Construye el system prompt completo de Mariana enriquecido con context del cliente.
   */
  static async buildPrompt(whatsapp, basePrompt) {
    const ctx = await this.get(whatsapp);
    const history = await this.getHistory(whatsapp, 5);

    const ctxSection = `

═══ CONTEXTO ESPECÍFICO DE ESTE CLIENTE ═══

Cliente: ${ctx?.client_name || 'Desconocido (primer contacto o aún no identificado)'}
WhatsApp: ${whatsapp}
Tipo: ${ctx?.client_type || 'prospect'}
Primer contacto: ${ctx?.first_contact || 'AHORA'}
Último contacto: ${ctx?.last_contact || 'AHORA'}
Mensajes totales históricos: ${ctx?.total_messages || 0}
Proyectos previos: ${ctx?.total_projects || 0}
Notas: ${ctx?.notes || '(ninguna)'}
Pain points: ${JSON.stringify(ctx?.pain_points || [])}

HISTORIAL RECIENTE (últimos ${history.length} mensajes):
${history.map((m, i) => {
  const dir = m.direction === 'inbound' ? '👤 Cliente' : '🤖 Mariana';
  const txt = (m.content || '').slice(0, 200).replace(/\n+/g, ' ');
  return `${i + 1}. ${dir}: ${txt}`;
}).join('\n')}

═══ REGLAS ESPECÍFICAS PARA HOY ═══

- NUNCA dar precios sin consultar a Neiky (Fermín)
- Confirmar brief ANTES de proceder a producción
- Si cliente es 'difficult': ser extra-empática + escalar a Neiky
- NUNCA mencionar que eres IA salvo pregunta directa del cliente
- Mantener tono de tu personalidad base (cálido profesional con clientes / coqueta cómplice con Neiky)
`;
    return (basePrompt || '') + ctxSection;
  }

  /**
   * Marca al cliente como 'difficult', 'vip', 'lost', etc.
   */
  static async setClientType(whatsapp, type) {
    return this.update(whatsapp, { client_type: type });
  }

  /**
   * Agrega una nota al historial del cliente (append, no replace).
   */
  static async appendNote(whatsapp, note) {
    const ctx = await this.get(whatsapp);
    const newNotes = (ctx?.notes ? ctx.notes + '\n' : '') + `[${new Date().toISOString().slice(0,16)}] ${note}`;
    return this.update(whatsapp, { notes: newNotes });
  }

  static _normalizePhone(phone) {
    if (!phone) return '';
    let p = String(phone).replace('whatsapp:', '').replace(/[\s+]/g, '');
    if (p.startsWith('521') && p.length === 13) p = '52' + p.slice(3);
    return p;
  }
}

module.exports = MarianaContext;
