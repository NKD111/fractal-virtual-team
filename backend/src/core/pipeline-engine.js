// backend/src/core/pipeline-engine.js
// FASE 5 — Workflows Modulares
// Un pipeline genérico que funciona para cualquier cliente.
// Para agregar un nuevo cliente: solo editar PIPELINE_CONFIG + crear su brand context.
// El código del pipeline nunca cambia.

const { supabase } = require('./supabase');
const contextLoader = require('./context-loader');

// ─── CONFIGURACIÓN POR CLIENTE ────────────────────────────────────────────────
// Cada cliente tiene su config. El pipeline usa la config, no hardcodes.
const PIPELINE_CONFIG = {
  FIF: {
    cliente:            'FIF',
    cliente_display:    'FIF / Vanexpo',
    contacto_entrega:   process.env.CLAUDIA_EMAIL || null,
    precio_usd:         1000,
    piezas_total:       10,
    piezas_seleccion:   8,
    drive_folder:       process.env.FIF_DRIVE_FOLDER || null,
    brand_context:      'visual/brand-FIF.md',
    client_context:     'clientes/FIF.md',
    dia_entrega:        20,
    modelo_imagen:      'gpt_image_2',
    ratio_post:         '4:5',
    formato_post:       '1080x1350px',
    cliente_key_sim:    'luis_tendero_fif',  // para client-simulator
    qa_threshold: {
      consistency:  70,  // score mínimo consistency-auditor
      emotional:     6,  // score mínimo emotional-reviewer (sobre 10)
      ctr:          50,  // score mínimo ctr-validator (solo banners)
      simulator:    60   // prob. mínima client-simulator
    },
    crons: {
      fase1: '0 9 1 * *',   // Día 1 → NEXUS analysis
      fase2: '0 9 5 * *',   // Día 5 → Develop briefs
      fase3: '0 10 7 * *',  // Día 7 → NKD approval
      fase4: '0 9 10 * *',  // Día 10 → Production
      fase6: '0 10 17 * *', // Día 17 → NKD final review
      fase7: '0 9 20 * *'   // Día 20 → Delivery to client
    }
  },

  ExpoMobility: {
    cliente:            'ExpoMobility',
    cliente_display:    'Expo Mobility',
    contacto_entrega:   process.env.EXPOMOBILITY_EMAIL || null,
    precio_usd:         null,     // NKD configura
    piezas_total:       10,
    piezas_seleccion:   8,
    drive_folder:       process.env.EXPOMOBILITY_DRIVE_FOLDER || null,
    brand_context:      'visual/brand-ExpoMobility.md', // se crea cuando llega el cliente
    client_context:     'clientes/ExpoMobility.md',
    dia_entrega:        20,
    modelo_imagen:      'gpt_image_2',
    ratio_post:         '4:5',
    formato_post:       '1080x1350px',
    cliente_key_sim:    'default',
    qa_threshold: {
      consistency:  70,
      emotional:     6,
      ctr:          50,
      simulator:    60
    },
    crons: {
      fase1: '0 9 1 * *',
      fase2: '0 9 5 * *',
      fase3: '0 10 7 * *',
      fase4: '0 9 10 * *',
      fase6: '0 10 17 * *',
      fase7: '0 9 20 * *'
    }
  }

  // ── Para agregar un nuevo cliente: ────────────────────────────────────────
  // 1. Copiar bloque ExpoMobility y renombrar
  // 2. Crear context/clientes/NuevoCliente.md
  // 3. Crear context/visual/brand-NuevoCliente.md
  // 4. Configurar las env vars necesarias
  // 5. El pipeline corre exactamente igual — zero cambios de código
};

// ─── PIPELINE GENÉRICO ────────────────────────────────────────────────────────

/**
 * getConfig(cliente_id)
 * Retorna la configuración de un cliente. Lanza error si no existe.
 */
function getConfig(cliente_id) {
  const config = PIPELINE_CONFIG[cliente_id];
  if (!config) {
    throw new Error(`Cliente "${cliente_id}" no encontrado en PIPELINE_CONFIG. Clientes disponibles: ${Object.keys(PIPELINE_CONFIG).join(', ')}`);
  }
  return config;
}

/**
 * getClientContext(cliente_id)
 * Carga el contexto modular del cliente para usar en prompts.
 */
function getClientContext(cliente_id) {
  const config = getConfig(cliente_id);
  const brandContext = contextLoader.loadFile(config.brand_context) || '';
  const clientContext = contextLoader.loadFile(config.client_context) || '';
  return `${clientContext}\n\n${brandContext}`.trim();
}

/**
 * getPipelineStatus(cliente_id, mes?)
 * Estado actual del pipeline de un cliente.
 */
async function getPipelineStatus(cliente_id, mes = null) {
  const config = getConfig(cliente_id);
  const month = mes || new Date().toISOString().substring(0, 7);

  try {
    const { data: briefs } = await supabase
      .from('parrilla_briefs')
      .select('status, tipo_pieza')
      .eq('cliente', config.cliente)
      .eq('mes', month);

    const statusCount = (briefs || []).reduce((acc, b) => {
      acc[b.status] = (acc[b.status] || 0) + 1;
      return acc;
    }, {});

    return {
      cliente:        config.cliente_display,
      mes:            month,
      total:          briefs?.length || 0,
      status:         statusCount,
      entregadas:     statusCount['entregado'] || 0,
      aprobadas_qa:   statusCount['aprobado_qa'] || 0,
      en_produccion:  statusCount['en_produccion'] || 0,
      pendientes_nkd: statusCount['pendiente_aprobacion_nkd'] || 0,
      precio_usd:     config.precio_usd,
      dia_entrega:    config.dia_entrega,
      configured:     !!(config.contacto_entrega && config.drive_folder)
    };
  } catch {
    return { cliente: config.cliente_display, mes: month, error: 'No data' };
  }
}

/**
 * getAllPipelinesStatus(mes?)
 * Estado de TODOS los clientes configurados.
 */
async function getAllPipelinesStatus(mes = null) {
  const results = await Promise.allSettled(
    Object.keys(PIPELINE_CONFIG).map(id => getPipelineStatus(id, mes))
  );
  return results.map(r => r.status === 'fulfilled' ? r.value : { error: r.reason?.message });
}

/**
 * isClientConfigured(cliente_id)
 * Verifica si un cliente tiene todas las env vars necesarias.
 */
function isClientConfigured(cliente_id) {
  const config = getConfig(cliente_id);
  return {
    cliente:          config.cliente,
    contacto:         !!config.contacto_entrega,
    drive_folder:     !!config.drive_folder,
    brand_context:    contextLoader.isAvailable() && !!contextLoader.loadFile(config.brand_context),
    client_context:   contextLoader.isAvailable() && !!contextLoader.loadFile(config.client_context),
    fully_configured: !!(config.contacto_entrega && config.drive_folder)
  };
}

module.exports = {
  PIPELINE_CONFIG,
  getConfig,
  getClientContext,
  getPipelineStatus,
  getAllPipelinesStatus,
  isClientConfigured
};
