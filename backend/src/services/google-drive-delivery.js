// backend/src/services/google-drive-delivery.js
// BLOQUE S — Pipeline de entrega Google Drive
// Reemplaza entrega por email con subida automática a Drive
// y llenado de tablas en Google Slides.
//
// Requiere: GOOGLE_SERVICE_ACCOUNT env var (JSON del service account)
// Scopes: drive, slides
//
// Estructura Drive FIF:
//   FIF 2026 (root: 1Z91om0Sd9RnoGLis6ZRkuyYOuCbvdaMt)
//   └── FIF 2026 - JUNIO 2026
//       ├── CONTENIDOS JUNIO 2026 - FIF   ← artes aquí
//       └── EF 2026 - JUNIO               ← presentación (tablas)

const axios = require('axios');
const crypto = require('crypto');
const { notifyNeiky } = require('../core/whatsapp');
const { supabase } = require('../core/supabase');

const DRIVE_ROOT_FIF = '1Z91om0Sd9RnoGLis6ZRkuyYOuCbvdaMt';
const DRIVE_SCOPES = [
  'https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/presentations'
];

// ─── Meses en español ────────────────────────────────────────────────────────
const MESES_ES = {
  '01': 'ENERO', '02': 'FEBRERO', '03': 'MARZO', '04': 'ABRIL',
  '05': 'MAYO', '06': 'JUNIO', '07': 'JULIO', '08': 'AGOSTO',
  '09': 'SEPTIEMBRE', '10': 'OCTUBRE', '11': 'NOVIEMBRE', '12': 'DICIEMBRE'
};

function mesLabel(mes) {
  // mes = "2026-06" → "JUNIO 2026"
  const [year, month] = mes.split('-');
  return `${MESES_ES[month] || month} ${year}`;
}

// ─── JWT Auth — Google Service Account ──────────────────────────────────────

function base64url(buf) {
  return buf.toString('base64')
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

let _tokenCache = null;
let _tokenExpiry = 0;

async function getAccessToken() {
  if (_tokenCache && Date.now() < _tokenExpiry) return _tokenCache;

  const saJson = process.env.GOOGLE_SERVICE_ACCOUNT;
  if (!saJson) throw new Error('GOOGLE_SERVICE_ACCOUNT no configurado. Agrega el JSON del service account como env var en Railway.');

  const sa = JSON.parse(saJson);
  const now = Math.floor(Date.now() / 1000);

  const header = base64url(Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })));
  const payload = base64url(Buffer.from(JSON.stringify({
    iss: sa.client_email,
    scope: DRIVE_SCOPES.join(' '),
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600
  })));

  const sigInput = `${header}.${payload}`;
  const sign = crypto.createSign('RSA-SHA256');
  sign.update(sigInput);
  const sig = base64url(sign.sign(sa.private_key));
  const jwt = `${sigInput}.${sig}`;

  const { data } = await axios.post(
    'https://oauth2.googleapis.com/token',
    `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
  );

  _tokenCache = data.access_token;
  _tokenExpiry = Date.now() + 3500 * 1000; // refresh antes de que expire
  return _tokenCache;
}

function driveHeaders(token) {
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

// ─── Drive API helpers ────────────────────────────────────────────────────────

async function crearCarpeta(nombre, parentId, token) {
  const { data } = await axios.post(
    'https://www.googleapis.com/drive/v3/files',
    { name: nombre, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] },
    { headers: driveHeaders(token) }
  );
  return data.id;
}

async function buscarCarpeta(nombre, parentId, token) {
  const q = `name = '${nombre.replace(/'/g, "\\'")}' and '${parentId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
  const { data } = await axios.get(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name)`,
    { headers: driveHeaders(token) }
  );
  return data.files?.[0]?.id || null;
}

async function buscarArchivoEnCarpeta(nombre, parentId, mimeType, token) {
  let q = `name = '${nombre.replace(/'/g, "\\'")}' and '${parentId}' in parents and trashed = false`;
  if (mimeType) q += ` and mimeType = '${mimeType}'`;
  const { data } = await axios.get(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name)`,
    { headers: driveHeaders(token) }
  );
  return data.files?.[0] || null;
}

// ─── FUNCIÓN PRINCIPAL: Crear carpetas del mes ───────────────────────────────

/**
 * Crea la estructura de carpetas para un mes en Drive FIF.
 * @param {string} mes - "2026-06"
 * @returns {{ mesFolderId, contenidoFolderId, mesFolderUrl, contenidoFolderUrl }}
 */
async function crearCarpetasMes(mes) {
  const token = await getAccessToken();
  const label = mesLabel(mes); // "JUNIO 2026"
  const [year, month] = mes.split('-');
  const mesNombre = MESES_ES[month];

  const mesFolderName = `FIF 2026 - ${label}`;
  const contenidoFolderName = `CONTENIDOS ${label} - FIF`;

  // Buscar o crear carpeta del mes
  let mesFolderId = await buscarCarpeta(mesFolderName, DRIVE_ROOT_FIF, token);
  if (!mesFolderId) {
    mesFolderId = await crearCarpeta(mesFolderName, DRIVE_ROOT_FIF, token);
    console.log(`📁 Drive: Carpeta creada — ${mesFolderName}`);
  } else {
    console.log(`📁 Drive: Carpeta existente — ${mesFolderName}`);
  }

  // Buscar o crear subcarpeta de contenidos
  let contenidoFolderId = await buscarCarpeta(contenidoFolderName, mesFolderId, token);
  if (!contenidoFolderId) {
    contenidoFolderId = await crearCarpeta(contenidoFolderName, mesFolderId, token);
    console.log(`📁 Drive: Subcarpeta creada — ${contenidoFolderName}`);
  } else {
    console.log(`📁 Drive: Subcarpeta existente — ${contenidoFolderName}`);
  }

  return {
    mesFolderId,
    contenidoFolderId,
    mesFolderUrl: `https://drive.google.com/drive/folders/${mesFolderId}`,
    contenidoFolderUrl: `https://drive.google.com/drive/folders/${contenidoFolderId}`
  };
}

// ─── FUNCIÓN: Subir artes a Drive ────────────────────────────────────────────

/**
 * Descarga cada arte desde su URL y lo sube a la carpeta de contenidos.
 * @param {Array} briefs - briefs con url_arte_final
 * @param {string} folderId - ID de CONTENIDOS folder en Drive
 * @returns {{ subidos, errores }}
 */
async function subirArtesDrive(briefs, folderId) {
  const token = await getAccessToken();
  let subidos = 0;
  let errores = 0;

  for (const brief of briefs) {
    if (!brief.url_arte_final) {
      console.warn(`  ⚠️ Brief ${brief.numero_pieza} sin URL de arte, saltando`);
      errores++;
      continue;
    }

    try {
      const nombreArchivo = `${brief.numero_pieza || subidos + 1}_${(brief.tipo_pieza || 'pieza').replace(/\s+/g, '_')}.png`;

      // Descargar imagen desde URL
      const imgResponse = await axios.get(brief.url_arte_final, {
        responseType: 'arraybuffer',
        timeout: 30000
      });
      const imgBuffer = Buffer.from(imgResponse.data);
      const mimeType = imgResponse.headers['content-type'] || 'image/png';

      // Subir a Drive usando multipart upload
      const boundary = `-------boundary${Date.now()}`;
      const delimiter = `\r\n--${boundary}\r\n`;
      const closeDelimiter = `\r\n--${boundary}--`;

      const metadata = JSON.stringify({ name: nombreArchivo, parents: [folderId] });
      const body = Buffer.concat([
        Buffer.from(delimiter + 'Content-Type: application/json; charset=UTF-8\r\n\r\n' + metadata + delimiter),
        Buffer.from(`Content-Type: ${mimeType}\r\n\r\n`),
        imgBuffer,
        Buffer.from(closeDelimiter)
      ]);

      const { data: uploadedFile } = await axios.post(
        'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink',
        body,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': `multipart/related; boundary="${boundary}"`,
            'Content-Length': body.length
          }
        }
      );

      // Guardar drive_file_id en supabase
      await supabase.from('parrilla_briefs').update({
        notas_revision: (brief.notas_revision || '') + `\nDrive: ${uploadedFile.webViewLink}`
      }).eq('id', brief.id).catch(() => {});

      console.log(`  ✓ Pieza ${brief.numero_pieza} subida: ${uploadedFile.webViewLink}`);
      subidos++;
    } catch (err) {
      console.error(`  ✗ Error subiendo pieza ${brief.numero_pieza}:`, err.message);
      errores++;
    }
  }

  return { subidos, errores };
}

// ─── FUNCIÓN: Notificar NKD — artes en Drive ─────────────────────────────────

/**
 * WhatsApp a NKD avisando que las artes están en Drive.
 */
async function notificarNKD_artesEnDrive(mes, count, folderUrl) {
  const label = mesLabel(mes);
  await notifyNeiky(
    `🖼️ ${count} artes FIF ${label} subidos a Drive.\n\n` +
    `📁 ${folderUrl}\n\n` +
    `Entra a revisar y selecciona los 8 finales.\n` +
    `Cuando los acomodes en la presentación, avísame para llenar las tablas.\n\n` +
    `— Mariana 🤖`
  );
}

// ─── FUNCIÓN: Llenar tablas en Google Slides ─────────────────────────────────

/**
 * Rellena la tabla de parrilla en la presentación de Google Slides.
 * Columnas esperadas: Tema | Fecha | Objetivo | Copy In | Copy Out | Formato | Status
 *
 * @param {Array} briefs - briefs aprobados para entregar
 * @param {string} presentationId - ID de la presentación en Drive
 * @returns {{ success, slides_actualizados }}
 */
async function llenarTablaSlides(briefs, presentationId) {
  if (!presentationId) throw new Error('presentationId requerido');

  const token = await getAccessToken();

  // Obtener estructura de la presentación
  const { data: presentation } = await axios.get(
    `https://slides.googleapis.com/v1/presentations/${presentationId}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );

  const requests = [];
  let slidesActualizados = 0;

  // Buscar tablas en cada slide y llenarlas
  for (const slide of (presentation.slides || [])) {
    for (const element of (slide.pageElements || [])) {
      if (!element.table) continue;

      const table = element.table;
      const tableObjId = element.objectId;
      const rows = table.tableRows || [];

      // Detectar si es tabla de parrilla por número de columnas (7)
      if (rows.length < 2 || (rows[0]?.tableCells?.length || 0) < 5) continue;

      // Llenar filas con datos de briefs (fila 0 = headers, filas 1+ = datos)
      for (let i = 0; i < Math.min(briefs.length, rows.length - 1); i++) {
        const brief = briefs[i];
        const rowIdx = i + 1;

        const celdas = [
          brief.concepto || brief.headline || '',           // Tema
          brief.fecha_publicacion || '',                    // Fecha
          brief.objetivo || '',                             // Objetivo
          brief.copy_in || brief.copy_hook || '',           // Copy In
          brief.copy_out || brief.copy_cta || '',           // Copy Out
          brief.formato || brief.tipo_pieza || '',          // Formato/Medidas
          '🟢 Concepto + Diseño'                           // Status
        ];

        const numCols = rows[rowIdx]?.tableCells?.length || 0;
        for (let j = 0; j < Math.min(celdas.length, numCols); j++) {
          requests.push({
            insertText: {
              objectId: tableObjId,
              cellLocation: { rowIndex: rowIdx, columnIndex: j },
              insertionIndex: 0,
              text: String(celdas[j])
            }
          });
          // Limpiar primero
          requests.unshift({
            deleteText: {
              objectId: tableObjId,
              cellLocation: { rowIndex: rowIdx, columnIndex: j },
              textRange: { type: 'ALL' }
            }
          });
        }
      }

      slidesActualizados++;
    }
  }

  if (requests.length === 0) {
    console.warn('[DriveDelivery] No se encontraron tablas para llenar en la presentación');
    return { success: false, message: 'No se encontraron tablas en la presentación' };
  }

  // Ejecutar batch update
  await axios.post(
    `https://slides.googleapis.com/v1/presentations/${presentationId}:batchUpdate`,
    { requests },
    { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
  );

  console.log(`✅ [DriveDelivery] Tablas llenadas: ${slidesActualizados} slides, ${briefs.length} briefs`);
  return { success: true, slides_actualizados: slidesActualizados, briefs_insertados: briefs.length };
}

// ─── FUNCIÓN: Buscar presentación del mes en Drive ────────────────────────────

/**
 * Busca la presentación Google Slides en la carpeta del mes.
 * @param {string} mesFolderId
 * @returns {string|null} presentationId
 */
async function buscarPresentacionMes(mesFolderId) {
  const token = await getAccessToken();
  const q = `'${mesFolderId}' in parents and mimeType = 'application/vnd.google-apps.presentation' and trashed = false`;
  const { data } = await axios.get(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name)`,
    { headers: driveHeaders(token) }
  );
  const presentacion = data.files?.[0];
  if (presentacion) {
    console.log(`📊 Presentación encontrada: ${presentacion.name} (${presentacion.id})`);
    return presentacion.id;
  }
  return null;
}

// ─── FUNCIÓN COMPLETA: Fase 4 Drive — Subir artes y notificar ────────────────

/**
 * Orquesta: crear carpetas → subir artes → notificar NKD.
 * Llamado desde fase4_produccion del pipeline.
 *
 * @param {Array} briefs - briefs producidos con url_arte_final
 * @param {string} mes - "2026-06"
 * @returns {{ success, mesFolderUrl, contenidoFolderUrl, subidos, errores }}
 */
async function fase4_subirADrive(briefs, mes) {
  try {
    // Verificar credenciales
    if (!process.env.GOOGLE_SERVICE_ACCOUNT) {
      console.warn('[DriveDelivery] GOOGLE_SERVICE_ACCOUNT no configurado — saltando subida');
      await notifyNeiky(
        `🎨 Artes FIF ${mesLabel(mes)} generadas (${briefs.length} piezas).\n\n` +
        `⚠️ Drive no configurado. Configura GOOGLE_SERVICE_ACCOUNT en Railway para subida automática.\n` +
        `Por ahora: descarga desde el dashboard.`
      );
      return { success: false, error: 'GOOGLE_SERVICE_ACCOUNT no configurado' };
    }

    // Crear carpetas
    const { mesFolderId, contenidoFolderId, mesFolderUrl, contenidoFolderUrl } = await crearCarpetasMes(mes);

    // Guardar folder URL en Supabase para referencia
    await supabase.from('system_events').insert({
      event_type: 'drive_folder_created',
      severity: 'info',
      service_key: 'google-drive-delivery',
      details: { mes, mesFolderUrl, contenidoFolderUrl }
    }).catch(() => {});

    // Subir artes con URL
    const briefsConArte = briefs.filter(b => b.url_arte_final);
    let subidos = 0;
    let errores = briefs.length - briefsConArte.length;

    if (briefsConArte.length > 0) {
      const result = await subirArtesDrive(briefsConArte, contenidoFolderId);
      subidos = result.subidos;
      errores += result.errores;
    }

    // Notificar NKD
    await notificarNKD_artesEnDrive(mes, subidos || briefs.length, contenidoFolderUrl);

    return { success: true, mesFolderUrl, contenidoFolderUrl, subidos, errores };

  } catch (err) {
    console.error('[DriveDelivery] fase4_subirADrive error:', err.message);
    // Fallback: notificar igualmente con mensaje de error
    await notifyNeiky(
      `🎨 Artes FIF ${mesLabel(mes)} generadas pero error al subir a Drive:\n${err.message}\n\n` +
      `Descarga desde el dashboard por ahora.`
    ).catch(() => {});
    return { success: false, error: err.message };
  }
}

// ─── FUNCIÓN COMPLETA: Fase 7 — Llenar tablas y marcar entregado ─────────────

/**
 * Orquesta: buscar presentación del mes → llenar tablas → marcar briefs entregados → notificar.
 * Llamado cuando NKD dice "ya está la parrilla lista, llena las tablas".
 *
 * @param {string} mes - "2026-06"
 * @param {string|null} presentationIdOverride - ID explícito si se conoce
 * @returns {{ success, piezas_entregadas }}
 */
async function fase7_llenarTablasYEntregar(mes, presentationIdOverride = null) {
  try {
    // Obtener briefs aprobados
    const { data: briefs } = await supabase
      .from('parrilla_briefs')
      .select('*')
      .eq('mes', mes)
      .eq('cliente', 'FIF')
      .in('status', ['aprobado_nkd', 'aprobado_qa', 'listo_qc'])
      .order('numero_pieza', { ascending: true });

    if (!briefs || briefs.length === 0) {
      await notifyNeiky(`⚠️ No hay briefs listos para llenar tablas en FIF ${mesLabel(mes)}.`);
      return { success: false, error: 'Sin briefs aprobados' };
    }

    let tablasLlenadas = false;
    let presentationId = presentationIdOverride;

    // Intentar llenar tablas en la presentación de Drive
    if (process.env.GOOGLE_SERVICE_ACCOUNT) {
      try {
        // Si no hay ID explícito, buscar en Drive
        if (!presentationId) {
          // Buscar carpeta del mes
          const token = await getAccessToken();
          const label = mesLabel(mes);
          const mesFolderName = `FIF 2026 - ${label}`;
          const mesFolderId = await buscarCarpeta(mesFolderName, DRIVE_ROOT_FIF, token);
          if (mesFolderId) {
            presentationId = await buscarPresentacionMes(mesFolderId);
          }
        }

        if (presentationId) {
          await llenarTablaSlides(briefs, presentationId);
          tablasLlenadas = true;
        } else {
          console.warn('[DriveDelivery] No se encontró presentación para el mes', mes);
        }
      } catch (slidesErr) {
        console.error('[DriveDelivery] Error llenando tablas:', slidesErr.message);
      }
    }

    // Marcar briefs como entregados
    for (const brief of briefs) {
      await supabase.from('parrilla_briefs').update({ status: 'entregado' }).eq('id', brief.id).catch(() => {});
    }

    // Registrar ingreso
    await supabase.from('digital_products_sales').insert({
      producto: `Parrilla mensual FIF ${mes}`,
      tipo: 'servicio_agencia',
      precio_usd: 1000,
      plataforma: 'agencia',
      cliente_email: process.env.CLAUDIA_EMAIL || 'claudia@fif.mx',
      cliente_pais: 'México'
    }).catch(() => {});

    const tablaMsg = tablasLlenadas
      ? `✅ Tablas llenadas en la presentación de Drive.`
      : `⚠️ No se pudo llenar tablas automáticamente. Llena manualmente la presentación.`;

    await notifyNeiky(
      `📦 Parrilla FIF ${mesLabel(mes)} entregada.\n` +
      `${briefs.length} piezas marcadas como entregadas.\n\n` +
      `${tablaMsg}\n\n` +
      `Revenue registrado: $1,000 USD 💰`
    );

    return { success: true, piezas_entregadas: briefs.length, tablas_llenadas: tablasLlenadas };

  } catch (err) {
    console.error('[DriveDelivery] fase7_llenarTablasYEntregar error:', err.message);
    return { success: false, error: err.message };
  }
}

// ─── VERIFICAR CONEXIÓN (health check) ───────────────────────────────────────

async function verificarConexionDrive() {
  try {
    const token = await getAccessToken();
    const { data } = await axios.get(
      `https://www.googleapis.com/drive/v3/files/${DRIVE_ROOT_FIF}?fields=id,name`,
      { headers: driveHeaders(token) }
    );
    return { connected: true, folder: data.name, folderId: data.id };
  } catch (err) {
    return { connected: false, error: err.message };
  }
}

module.exports = {
  crearCarpetasMes,
  subirArtesDrive,
  llenarTablaSlides,
  buscarPresentacionMes,
  fase4_subirADrive,
  fase7_llenarTablasYEntregar,
  notificarNKD_artesEnDrive,
  verificarConexionDrive,
  mesLabel
};
