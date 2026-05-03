const express = require('express');
const router = express.Router();
const { supabase } = require('../core/supabase');
const { v4: uuidv4 } = require('uuid');
const moment = require('moment-timezone');

// ─── INVOICES ─────────────────────────────────────────────────────────────────

// GET all invoices
router.get('/invoices', async (req, res) => {
  try {
    const { status, client_id, limit = 50 } = req.query;
    let query = supabase
      .from('invoices')
      .select('*, clients(name, company, email)')
      .order('created_at', { ascending: false })
      .limit(parseInt(limit));

    if (status) query = query.eq('status', status);
    if (client_id) query = query.eq('client_id', client_id);

    const { data, error } = await query;
    if (error) throw error;
    res.json({ success: true, invoices: data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET single invoice
router.get('/invoices/:id', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('invoices')
      .select('*, clients(*), projects(name)')
      .eq('id', req.params.id)
      .single();
    if (error) throw error;
    res.json({ success: true, invoice: data });
  } catch (err) {
    res.status(404).json({ success: false, error: 'Invoice not found' });
  }
});

// POST create invoice
router.post('/invoices', async (req, res) => {
  try {
    const { client_id, project_id, items = [], due_days = 30, notes = '' } = req.body;
    if (!client_id || !items.length) {
      return res.status(400).json({ error: 'client_id and items required' });
    }

    // Calculate totals
    const subtotal = items.reduce((sum, item) => sum + (item.quantity * item.unit_price), 0);
    const tax = subtotal * 0.16; // IVA 16%
    const total = subtotal + tax;

    // Generate invoice number
    const now = moment().tz('America/Mexico_City');
    const invoiceNumber = `FX-${now.format('YYYYMM')}-${String(Math.floor(Math.random() * 9000) + 1000)}`;

    const { data, error } = await supabase
      .from('invoices')
      .insert({
        client_id,
        project_id: project_id || null,
        invoice_number: invoiceNumber,
        status: 'draft',
        subtotal: Math.round(subtotal * 100) / 100,
        tax: Math.round(tax * 100) / 100,
        total: Math.round(total * 100) / 100,
        currency: 'MXN',
        due_date: moment().add(due_days, 'days').toISOString(),
        items,
        notes
      })
      .select('*, clients(name, email)')
      .single();

    if (error) throw error;

    // Log as financial record
    await supabase.from('financial_records').insert({
      record_type: 'income',
      amount: total,
      currency: 'MXN',
      category: 'services',
      description: `Factura ${invoiceNumber}`,
      invoice_id: data.id,
      month: now.month() + 1,
      year: now.year()
    });

    res.json({ success: true, invoice: data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PATCH update invoice status
router.patch('/invoices/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    const validStatuses = ['draft', 'sent', 'paid', 'overdue', 'cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const update = { status, updated_at: new Date().toISOString() };
    if (status === 'paid') update.paid_at = new Date().toISOString();

    const { data, error } = await supabase
      .from('invoices')
      .update(update)
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) throw error;
    res.json({ success: true, invoice: data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── PAYMENTS ─────────────────────────────────────────────────────────────────

// POST register payment
router.post('/payments', async (req, res) => {
  try {
    const { invoice_id, amount, method = 'transfer', reference = '', notes = '' } = req.body;
    if (!invoice_id || !amount) {
      return res.status(400).json({ error: 'invoice_id and amount required' });
    }

    // Get invoice to link client
    const { data: invoice } = await supabase.from('invoices').select('client_id, total').eq('id', invoice_id).single();

    const { data, error } = await supabase
      .from('payments')
      .insert({
        invoice_id,
        client_id: invoice?.client_id,
        amount: parseFloat(amount),
        currency: 'MXN',
        method,
        reference,
        status: 'confirmed',
        notes,
        confirmed_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) throw error;

    // Mark invoice as paid if full amount
    if (parseFloat(amount) >= invoice?.total) {
      await supabase.from('invoices').update({ status: 'paid', paid_at: new Date().toISOString() }).eq('id', invoice_id);
    }

    res.json({ success: true, payment: data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── P&L REPORT ───────────────────────────────────────────────────────────────

// GET P&L report for a month/year
router.get('/pl', async (req, res) => {
  try {
    const now = moment().tz('America/Mexico_City');
    const month = parseInt(req.query.month) || now.month() + 1;
    const year = parseInt(req.query.year) || now.year();

    const { data: records, error } = await supabase
      .from('financial_records')
      .select('*')
      .eq('month', month)
      .eq('year', year);

    if (error) throw error;

    const income = records.filter(r => r.record_type === 'income').reduce((s, r) => s + r.amount, 0);
    const expenses = records.filter(r => r.record_type === 'expense').reduce((s, r) => s + r.amount, 0);
    const profit = income - expenses;
    const margin = income > 0 ? ((profit / income) * 100).toFixed(1) : 0;

    // Pending invoices
    const { data: pending } = await supabase
      .from('invoices')
      .select('total, due_date, clients(name)')
      .in('status', ['sent', 'overdue']);

    const pendingTotal = pending?.reduce((s, i) => s + i.total, 0) || 0;
    const overdueItems = pending?.filter(i => new Date(i.due_date) < new Date()) || [];

    res.json({
      success: true,
      period: `${month}/${year}`,
      pl: {
        income: Math.round(income * 100) / 100,
        expenses: Math.round(expenses * 100) / 100,
        profit: Math.round(profit * 100) / 100,
        margin: parseFloat(margin),
        currency: 'MXN',
        records: records.length
      },
      cashflow: {
        pendingCollection: Math.round(pendingTotal * 100) / 100,
        overdueCount: overdueItems.length,
        overdueTotal: Math.round(overdueItems.reduce((s, i) => s + i.total, 0) * 100) / 100
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET financial summary (dashboard widget)
router.get('/summary', async (req, res) => {
  try {
    const now = moment().tz('America/Mexico_City');
    const startOfMonth = now.clone().startOf('month').toISOString();

    const [
      { data: invoices },
      { data: payments },
      { data: overdueInvoices }
    ] = await Promise.all([
      supabase.from('invoices').select('status, total').gte('created_at', startOfMonth),
      supabase.from('payments').select('amount, status').gte('created_at', startOfMonth).eq('status', 'confirmed'),
      supabase.from('invoices').select('total, due_date, clients(name)').eq('status', 'overdue')
    ]);

    const mrr = invoices?.filter(i => i.status === 'paid').reduce((s, i) => s + i.total, 0) || 0;
    const collected = payments?.reduce((s, p) => s + p.amount, 0) || 0;
    const pending = invoices?.filter(i => ['sent', 'draft'].includes(i.status)).reduce((s, i) => s + i.total, 0) || 0;
    const overdue = overdueInvoices?.reduce((s, i) => s + i.total, 0) || 0;

    res.json({
      success: true,
      currency: 'MXN',
      month: now.format('MMMM YYYY'),
      summary: {
        mrr: Math.round(mrr * 100) / 100,
        collected: Math.round(collected * 100) / 100,
        pendingCollection: Math.round(pending * 100) / 100,
        overdue: Math.round(overdue * 100) / 100,
        overdueClients: overdueInvoices?.map(i => ({ name: i.clients?.name, amount: i.total, due: i.due_date })) || []
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST add expense
router.post('/expenses', async (req, res) => {
  try {
    const { amount, category, description } = req.body;
    if (!amount || !category) return res.status(400).json({ error: 'amount and category required' });

    const now = moment().tz('America/Mexico_City');
    const { data, error } = await supabase.from('financial_records').insert({
      record_type: 'expense',
      amount: parseFloat(amount),
      currency: 'MXN',
      category,
      description,
      month: now.month() + 1,
      year: now.year()
    }).select().single();

    if (error) throw error;
    res.json({ success: true, expense: data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
