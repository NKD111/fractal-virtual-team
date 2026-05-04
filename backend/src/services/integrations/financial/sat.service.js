// SAT / Facturama Service — CFDI 4.0 invoice generation for Mexico
// Provider: Facturama (https://facturama.mx)
// Roberto uses this to generate invoices automatically

const axios = require('axios');

class SATService {
  constructor() {
    this.username = process.env.FACTURAMA_USERNAME;
    this.password = process.env.FACTURAMA_PASSWORD;
    this.env = process.env.FACTURAMA_ENV || 'sandbox';
    this.available = !!(this.username && this.username !== 'PENDING');
    this.baseUrl = this.env === 'sandbox'
      ? 'https://apisandbox.facturama.mx'
      : 'https://api.facturama.mx';
  }

  isAvailable() { return this.available; }

  get authHeader() {
    const encoded = Buffer.from(`${this.username}:${this.password}`).toString('base64');
    return { Authorization: `Basic ${encoded}`, 'Content-Type': 'application/json' };
  }

  /**
   * Generate CFDI 4.0 invoice
   */
  async createInvoice(invoiceData) {
    if (!this.available) throw new Error('Facturama credentials not configured');

    const cfdi = {
      Serie: invoiceData.serie || 'F',
      Currency: 'MXN',
      ExpeditionPlace: process.env.SAT_EXPEDITION_ZIP || '06600',
      CfdiType: 'I',
      PaymentForm: invoiceData.paymentForm || '03', // 03 = Transferencia
      PaymentMethod: 'PUE',
      Receiver: {
        Rfc: invoiceData.receiverRfc,
        Name: invoiceData.receiverName,
        CfdiUse: invoiceData.cfdiUse || 'G03', // G03 = Gastos en general
        FiscalRegime: invoiceData.receiverRegime || '616',
        TaxZipCode: invoiceData.receiverZip || '06600'
      },
      Items: invoiceData.items.map(item => ({
        ProductCode: item.productCode || '81161500',
        IdentificationNumber: item.id || 'SRV001',
        Description: item.description,
        Unit: item.unit || 'Servicio',
        UnitCode: item.unitCode || 'E48',
        UnitPrice: item.unitPrice,
        Quantity: item.quantity || 1,
        Subtotal: item.unitPrice * (item.quantity || 1),
        TaxObject: '02',
        Taxes: [{
          Total: item.unitPrice * (item.quantity || 1) * 0.16,
          Name: 'IVA',
          Base: item.unitPrice * (item.quantity || 1),
          Rate: 0.16,
          IsRetention: false
        }],
        Total: item.unitPrice * (item.quantity || 1) * 1.16
      }))
    };

    const response = await axios.post(`${this.baseUrl}/api/3/cfdis`, cfdi, {
      headers: this.authHeader
    });

    console.log(`[SAT] ✅ CFDI generado: ${response.data.Id}`);
    return response.data;
  }

  /**
   * Get invoice PDF/XML download URLs
   */
  async getInvoiceFiles(cfdiId) {
    if (!this.available) return null;
    const pdfUrl = `${this.baseUrl}/api/3/cfdis/${cfdiId}/pdf`;
    const xmlUrl = `${this.baseUrl}/api/3/cfdis/${cfdiId}/xml`;
    return { pdfUrl, xmlUrl };
  }

  /**
   * Cancel invoice
   */
  async cancelInvoice(cfdiId, motive = '02') {
    if (!this.available) throw new Error('Facturama not configured');
    await axios.delete(`${this.baseUrl}/api/cfdis/${cfdiId}?type=issued&motive=${motive}`, {
      headers: this.authHeader
    });
    console.log(`[SAT] ✅ CFDI cancelado: ${cfdiId}`);
    return { ok: true };
  }
}

module.exports = new SATService();
