// backend/src/middleware/audit.js
// Express middleware que loguea TODA petición HTTP a audit_log + emite WebSocket.
// Mounted en index.js antes de las rutas — captura request/response timing/status.

const { supabase } = require('../core/supabase');

// Endpoints que NO loguear (alto volumen / poco valor)
const SKIP_PATHS = new Set([
  '/webhook/health',
  '/health',
  '/favicon.ico'
]);

const SKIP_PREFIX = ['/_next', '/static', '/assets'];

function shouldSkip(path) {
  if (SKIP_PATHS.has(path)) return true;
  return SKIP_PREFIX.some(p => path.startsWith(p));
}

/**
 * Audit middleware — captura método/path/status/duración + body summary.
 * NO loguea bodies completos (PII risk). Solo metadata.
 */
function auditMiddleware(req, res, next) {
  if (shouldSkip(req.path)) return next();

  const start = Date.now();
  const path = req.path;
  const method = req.method;
  const ip = req.headers['x-forwarded-for'] || req.connection?.remoteAddress || 'unknown';

  // Capturar response status sin tocar body
  const originalEnd = res.end;
  res.end = function (...args) {
    const duration = Date.now() - start;
    const status = res.statusCode;
    const isError = status >= 400;

    // Detectar actor por path patterns
    let actor = 'http';
    if (path.startsWith('/webhook/meta') || path.startsWith('/webhook/twilio')) actor = 'whatsapp_inbound';
    else if (path.startsWith('/webhook/email-inbound')) actor = 'email_inbound';
    else if (path.startsWith('/api/standup')) actor = 'standup_trigger';
    else if (path.startsWith('/api/axiom')) actor = 'axiom_trigger';
    else if (path.startsWith('/webhook/stripe')) actor = 'stripe_inbound';

    // Service inferido del path
    let service = 'backend';
    if (path.includes('webhook/meta')) service = 'meta';
    else if (path.includes('webhook/twilio')) service = 'twilio';
    else if (path.includes('webhook/email')) service = 'resend';
    else if (path.includes('axiom')) service = 'axiom';
    else if (path.includes('stripe')) service = 'stripe';

    // Solo loguear errors O endpoints importantes (no spam audit_log con health checks)
    const importantPaths = ['/api/standup', '/api/axiom', '/webhook/', '/api/payments'];
    const isImportant = importantPaths.some(p => path.startsWith(p)) || isError;

    if (isImportant) {
      // Async, no bloquear response
      supabase.rpc('log_action', {
        p_actor: actor,
        p_action: `${method.toLowerCase()}:${path.slice(0, 60)}`,
        p_service: service,
        p_status: isError ? 'failed' : 'success',
        p_details: {
          method,
          path,
          status,
          duration_ms: duration,
          ip,
          user_agent: (req.headers['user-agent'] || '').slice(0, 100)
        },
        p_error_code: isError ? `HTTP_${status}` : null
      }).then(() => {}).catch((e) => {
        // log_action puede no existir si SQL no se pegó. NO romper.
        if (!global._audit_warned) {
          console.warn('[audit] log_action skipped:', e?.message?.slice(0, 80));
          global._audit_warned = true;
        }
      });
    }

    // Emit WebSocket si hay io global
    if (global.io && isImportant) {
      try {
        global.io.emit('system:request', { method, path, status, duration_ms: duration, timestamp: new Date() });
      } catch (_) {}
    }

    originalEnd.apply(this, args);
  };

  next();
}

module.exports = auditMiddleware;
