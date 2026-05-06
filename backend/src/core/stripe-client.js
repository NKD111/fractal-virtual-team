// backend/src/core/stripe-client.js
// Wrapper de Stripe para Fractal MX. Crear payment links + webhook handler.

const { supabase } = require('./supabase');

let _stripe = null;
function getStripe() {
  if (_stripe) return _stripe;
  const key = process.env.STRIPE_SECRET_KEY || process.env.STRIPE_KEY;
  if (!key) {
    throw new Error('STRIPE_SECRET_KEY no está en env. Agregar en Railway.');
  }
  _stripe = require('stripe')(key);
  return _stripe;
}

/**
 * Crea un payment link de Stripe para un proyecto.
 * @param {Object} args - { amount_mxn, description, client_whatsapp, project_id, currency?, metadata? }
 * @returns {Object} - { payment_url, payment_id, expires_at }
 */
async function createPaymentLink({ amount_mxn, description, client_whatsapp, project_id, currency = 'mxn', metadata = {} }) {
  const stripe = getStripe();
  const amountCents = Math.round(amount_mxn * 100);

  // Crear product + price + payment_link en un flow
  const product = await stripe.products.create({
    name: description?.slice(0, 100) || 'Servicio Fractal MX',
    metadata: { client_whatsapp, project_id, ...metadata }
  });

  const price = await stripe.prices.create({
    unit_amount: amountCents,
    currency,
    product: product.id
  });

  const paymentLink = await stripe.paymentLinks.create({
    line_items: [{ price: price.id, quantity: 1 }],
    metadata: { client_whatsapp, project_id, ...metadata },
    after_completion: { type: 'hosted_confirmation' }
  });

  // Log
  await supabase.rpc('log_action', {
    p_actor: 'mariana',
    p_action: 'payment_link_created',
    p_service: 'stripe',
    p_status: 'success',
    p_details: { project_id, amount_mxn, payment_id: paymentLink.id, url: paymentLink.url }
  }).then(() => {}).catch(() => {});

  return {
    payment_url: paymentLink.url,
    payment_id: paymentLink.id,
    product_id: product.id,
    price_id: price.id
  };
}

/**
 * Procesa un webhook de Stripe. Valida firma + extrae info pago + registra en revenue_log.
 */
async function processWebhook(rawBody, signatureHeader) {
  const stripe = getStripe();
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.warn('[stripe] STRIPE_WEBHOOK_SECRET no configurado — skip signature validation');
  }

  let event;
  try {
    event = webhookSecret
      ? stripe.webhooks.constructEvent(rawBody, signatureHeader, webhookSecret)
      : JSON.parse(rawBody);
  } catch (err) {
    throw new Error(`Webhook signature failed: ${err.message}`);
  }

  // Procesar solo checkout.session.completed o payment_intent.succeeded
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const amount_mxn = (session.amount_total || 0) / 100;
    const metadata = session.metadata || {};

    // Insert en revenue_log
    await supabase.from('revenue_log').insert({
      source: 'stripe',
      project_id: metadata.project_id || null,
      amount_mxn,
      amount_usd: session.currency === 'usd' ? amount_mxn : null,
      client_email: session.customer_details?.email || null,
      client_whatsapp: metadata.client_whatsapp || null,
      status: 'confirmed',
      external_ref: session.id,
      notes: `Stripe Checkout: ${session.payment_status}`
    });

    // Update project status si tenemos project_id
    if (metadata.project_id) {
      await supabase.from('projects').update({ paid: true, status: 'paid' }).eq('id', metadata.project_id);
    }

    // Notificar a NKD via WhatsApp
    try {
      const ChannelAdapter = require('./channel-adapter');
      const NKD = process.env.NEIKY_WHATSAPP || '+5215534189583';
      await ChannelAdapter.send(NKD,
        `💰 Pago recibido: $${amount_mxn.toLocaleString('es-MX')} MXN${metadata.client_whatsapp ? ' de cliente ' + metadata.client_whatsapp : ''}.\n\nProyecto ${metadata.project_id || '(sin id)'} marcado como PAID.`
      );
    } catch (e) {
      console.warn('[stripe] notify NKD failed:', e.message);
    }

    await supabase.rpc('log_action', {
      p_actor: 'stripe_webhook',
      p_action: 'payment_received',
      p_service: 'stripe',
      p_status: 'success',
      p_details: { amount_mxn, project_id: metadata.project_id, session_id: session.id }
    }).then(() => {}).catch(() => {});

    return { ok: true, processed: 'checkout.session.completed', amount_mxn };
  }

  // Otros eventos: solo log
  await supabase.rpc('log_action', {
    p_actor: 'stripe_webhook',
    p_action: 'event_ignored',
    p_service: 'stripe',
    p_status: 'success',
    p_details: { event_type: event.type, event_id: event.id }
  }).then(() => {}).catch(() => {});

  return { ok: true, processed: 'ignored', event_type: event.type };
}

module.exports = { createPaymentLink, processWebhook, getStripe };
