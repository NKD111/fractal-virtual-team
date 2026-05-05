// backend/src/services/integrations/stripe.js
// Roberto: invoices reales en Stripe. Si STRIPE_SECRET_KEY no está,
// devuelve mock con el draft de invoice para que vea cómo se vería.

let stripeInstance = null;
function stripe() {
  if (stripeInstance) return stripeInstance;
  if (!process.env.STRIPE_SECRET_KEY) return null;
  const Stripe = require('stripe');
  stripeInstance = new Stripe(process.env.STRIPE_SECRET_KEY);
  return stripeInstance;
}

async function ensureCustomer({ email, name }) {
  const s = stripe();
  if (!s) throw new Error('STRIPE_SECRET_KEY no configurada');
  const existing = await s.customers.list({ email, limit: 1 });
  if (existing.data[0]) return existing.data[0];
  return await s.customers.create({ email, name });
}

/**
 * Crea factura con N items y la finaliza.
 * @param {object} args { customer_email, customer_name, items:[{description, amount_mxn, quantity?}], due_days?, currency? }
 */
async function createInvoice({ customer_email, customer_name, items, due_days = 14, currency = 'mxn' }) {
  if (!process.env.STRIPE_SECRET_KEY) {
    return {
      ok: false, mock: true,
      preview: { customer_email, customer_name, items, total: items.reduce((s, i) => s + i.amount_mxn * (i.quantity || 1), 0), currency }
    };
  }
  try {
    const s = stripe();
    const customer = await ensureCustomer({ email: customer_email, name: customer_name });
    for (const it of items) {
      await s.invoiceItems.create({
        customer: customer.id, currency,
        amount: Math.round(Number(it.amount_mxn) * 100) * (it.quantity || 1),
        description: it.description
      });
    }
    const inv = await s.invoices.create({
      customer: customer.id, collection_method: 'send_invoice', days_until_due: due_days
    });
    const finalized = await s.invoices.finalizeInvoice(inv.id);
    await s.invoices.sendInvoice(inv.id);
    return {
      ok: true,
      invoice_id: finalized.id,
      number: finalized.number,
      hosted_url: finalized.hosted_invoice_url,
      pdf_url: finalized.invoice_pdf,
      total: finalized.total / 100,
      currency
    };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

async function listInvoices(limit = 10) {
  if (!process.env.STRIPE_SECRET_KEY) return { ok: false, mock: true, invoices: [] };
  try {
    const s = stripe();
    const list = await s.invoices.list({ limit });
    return {
      ok: true,
      invoices: list.data.map(i => ({
        id: i.id, number: i.number, status: i.status,
        total: i.total / 100, customer_email: i.customer_email,
        hosted_url: i.hosted_invoice_url, paid: i.paid
      }))
    };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

module.exports = { createInvoice, listInvoices, ensureCustomer };
