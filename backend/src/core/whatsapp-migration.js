// backend/src/core/whatsapp-migration.js
// Fractal Virtual Team v4.2 — Migración WhatsApp → Supabase

/**
 * MIGRACIÓN: Mariana WhatsApp Original → Supabase Central
 *
 * Este script migra TODA la historia de WhatsApp para que la
 * Mariana Unificada conozca a Neiky desde el primer momento.
 *
 * USO (ejecutar manualmente cuando Neiky autorice):
 *   const migration = new WhatsAppMigration();
 *   await migration.migrateAll();
 */

let Twilio;
try {
  Twilio = require('twilio');
} catch (e) {
  console.warn('Twilio no instalado — migración no disponible');
}

const { createClient } = require('@supabase/supabase-js');

class WhatsAppMigration {
  constructor() {
    if (Twilio && process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
      this.twilio = Twilio(
        process.env.TWILIO_ACCOUNT_SID,
        process.env.TWILIO_AUTH_TOKEN
      );
    }

    this.supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY
    );

    // Estado de la migración
    this.stats = {
      fetched: 0,
      migrated: 0,
      errors: 0,
      skipped: 0
    };
  }

  /**
   * Migra todas las conversaciones de WhatsApp
   */
  async migrateAll() {
    if (!this.twilio) {
      throw new Error('Twilio no configurado. Verifica TWILIO_ACCOUNT_SID y TWILIO_AUTH_TOKEN');
    }

    console.log('🔄 Iniciando migración WhatsApp → Supabase...');
    console.log('⚠️  Este proceso puede tardar varios minutos');

    // 1. Obtener ID de Mariana
    const { data: mariana } = await this.supabase
      .from('agents')
      .select('id')
      .eq('name', 'MARIANA')
      .single();

    if (!mariana) throw new Error('MARIANA no encontrada en base de datos');
    console.log(`✅ Mariana encontrada: ${mariana.id}`);

    // 2. Obtener todos los mensajes de Twilio
    const messages = await this.fetchAllMessages();
    this.stats.fetched = messages.length;
    console.log(`📥 ${messages.length} mensajes encontrados en Twilio`);

    // 3. Procesar en batches
    const BATCH_SIZE = 50;
    for (let i = 0; i < messages.length; i += BATCH_SIZE) {
      const batch = messages.slice(i, i + BATCH_SIZE);
      await this.migrateBatch(batch, mariana.id);

      console.log(`📦 Batch ${Math.floor(i/BATCH_SIZE) + 1}/${Math.ceil(messages.length/BATCH_SIZE)} — Migrados: ${this.stats.migrated} | Errores: ${this.stats.errors}`);
    }

    console.log('\n✅ Migración completa:');
    console.log(`   Fetched: ${this.stats.fetched}`);
    console.log(`   Migrados: ${this.stats.migrated}`);
    console.log(`   Saltados (duplicados): ${this.stats.skipped}`);
    console.log(`   Errores: ${this.stats.errors}`);

    // 4. Generar embeddings si hay servicio disponible
    await this.generateEmbeddings();

    return this.stats;
  }

  /**
   * Migra un batch de mensajes
   */
  async migrateBatch(messages, marianaId) {
    for (const msg of messages) {
      try {
        await this.migrateMessage(msg, marianaId);
        this.stats.migrated++;
      } catch (error) {
        if (error.code === '23505') {
          // Duplicate key — ya existe
          this.stats.skipped++;
        } else {
          this.stats.errors++;
          console.error(`Error migrando ${msg.sid}: ${error.message}`);
        }
      }
    }
  }

  /**
   * Obtiene todos los mensajes de Twilio
   */
  async fetchAllMessages() {
    const allMessages = [];
    const neikyNumber = process.env.NEIKY_WHATSAPP;
    const twilioNumber = process.env.TWILIO_WHATSAPP_NUMBER;

    if (!neikyNumber || !twilioNumber) {
      throw new Error('NEIKY_WHATSAPP y TWILIO_WHATSAPP_NUMBER son requeridos');
    }

    console.log(`📱 Buscando mensajes entre ${neikyNumber} y ${twilioNumber}...`);

    // Mensajes enviados por Neiky (inbound)
    try {
      const inbound = await this.twilio.messages.list({
        from: `whatsapp:${neikyNumber}`,
        to: `whatsapp:${twilioNumber}`,
        limit: 1000
      });
      allMessages.push(...inbound);
    } catch (e) {
      console.warn('No se pudieron obtener mensajes inbound:', e.message);
    }

    // Mensajes enviados por el sistema (outbound)
    try {
      const outbound = await this.twilio.messages.list({
        from: `whatsapp:${twilioNumber}`,
        to: `whatsapp:${neikyNumber}`,
        limit: 1000
      });
      allMessages.push(...outbound);
    } catch (e) {
      console.warn('No se pudieron obtener mensajes outbound:', e.message);
    }

    // Ordenar por fecha
    return allMessages.sort((a, b) =>
      new Date(a.dateCreated) - new Date(b.dateCreated)
    );
  }

  /**
   * Migra un mensaje individual a Supabase
   */
  async migrateMessage(msg, marianaId) {
    const neikyNumber = process.env.NEIKY_WHATSAPP;
    const isFromNeiky = msg.from?.includes(neikyNumber) || false;

    await this.supabase
      .from('conversations')
      .insert({
        agent_id: marianaId,
        channel: 'whatsapp',
        channel_id: msg.sid,
        message_in: isFromNeiky ? msg.body : null,
        message_out: !isFromNeiky ? msg.body : null,
        sentiment: 'neutral',
        timestamp: new Date(msg.dateCreated),
        metadata: {
          migrated_from: 'twilio',
          original_sid: msg.sid,
          status: msg.status,
          direction: isFromNeiky ? 'inbound' : 'outbound'
        }
      });
  }

  /**
   * Genera embeddings para búsqueda semántica (opcional)
   */
  async generateEmbeddings() {
    console.log('\n🧠 Intentando generar embeddings para búsqueda semántica...');

    const { data: conversations } = await this.supabase
      .from('conversations')
      .select('id, message_in, message_out')
      .eq('channel', 'whatsapp')
      .is('embedding', null)
      .limit(500);

    if (!conversations || conversations.length === 0) {
      console.log('ℹ️  Sin conversaciones para generar embeddings');
      return;
    }

    console.log(`📊 ${conversations.length} conversaciones sin embedding`);

    let embedded = 0;
    for (const conv of conversations) {
      const text = `${conv.message_in || ''} ${conv.message_out || ''}`.trim();
      if (!text) continue;

      const embedding = await this.generateEmbedding(text);
      if (!embedding) continue;

      await this.supabase
        .from('conversations')
        .update({ embedding })
        .eq('id', conv.id);

      embedded++;
    }

    console.log(`✅ ${embedded} embeddings generados`);
  }

  /**
   * Genera embedding para un texto
   * Placeholder — implementar con Voyage AI, OpenAI, o similar
   */
  async generateEmbedding(text) {
    // TODO: Implementar cuando se tenga el servicio
    // Opción 1 — Voyage AI:
    // const response = await fetch('https://api.voyageai.com/v1/embeddings', {
    //   method: 'POST',
    //   headers: { 'Authorization': `Bearer ${process.env.VOYAGE_API_KEY}`, 'Content-Type': 'application/json' },
    //   body: JSON.stringify({ input: text, model: 'voyage-large-2' })
    // });
    // const data = await response.json();
    // return data.data[0].embedding;

    // Opción 2 — OpenAI:
    // const openai = new OpenAI();
    // const result = await openai.embeddings.create({ model: 'text-embedding-3-small', input: text });
    // return result.data[0].embedding;

    return null; // Placeholder hasta configurar servicio
  }

  /**
   * Reporte del estado de migración
   */
  async getMigrationStatus() {
    const { count: totalConversations } = await this.supabase
      .from('conversations')
      .select('id', { count: 'exact' })
      .eq('channel', 'whatsapp');

    const { count: withEmbeddings } = await this.supabase
      .from('conversations')
      .select('id', { count: 'exact' })
      .eq('channel', 'whatsapp')
      .not('embedding', 'is', null);

    return {
      total_migrated: totalConversations || 0,
      with_embeddings: withEmbeddings || 0,
      pending_embeddings: (totalConversations || 0) - (withEmbeddings || 0)
    };
  }
}

module.exports = WhatsAppMigration;

// ─── EJECUCIÓN DIRECTA (node whatsapp-migration.js) ─────────────────────────
if (require.main === module) {
  require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

  console.log('🌸 Fractal Virtual Team v4.2 — Migración WhatsApp');
  console.log('⚠️  AUTORIZACIÓN DE NEIKY REQUERIDA ANTES DE EJECUTAR\n');

  const migration = new WhatsAppMigration();
  migration.migrateAll()
    .then(stats => {
      console.log('\n🎉 Migración exitosa:', stats);
      process.exit(0);
    })
    .catch(err => {
      console.error('\n❌ Error en migración:', err.message);
      process.exit(1);
    });
}
