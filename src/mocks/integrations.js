// In-process mocks for Xero, GoCardless, HubSpot. Returns realistic-shape JSON
// with simulated latency and a configurable failure-injection rate (Chaos mode).

import { lookupCompany } from './companyDb.js';

const config = { chaosMode: false, xeroFailureRate: 0.3 };

export function setChaosMode(on) {
  config.chaosMode = !!on;
}
export function getChaosMode() {
  return config.chaosMode;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const jitter = (lo, hi) => lo + Math.random() * (hi - lo);
const rid = (prefix, len = 10) => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < len; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return `${prefix}${s}`;
};

// ---------- Xero ----------
export const xero = {
  async createInvoice(payload) {
    await sleep(jitter(220, 480));
    if (config.chaosMode && Math.random() < config.xeroFailureRate) {
      const err = new Error('Xero 503: ServiceUnavailable — rate limit exceeded');
      err.code = 'XERO_503';
      err.retryable = true;
      throw err;
    }
    const id = rid('inv_', 16);
    return {
      Id: id,
      InvoiceNumber: `INV-${Math.floor(10000 + Math.random() * 89999)}`,
      Type: 'ACCREC',
      Status: 'AUTHORISED',
      Contact: { Name: payload.companyName },
      LineItems: [
        {
          Description: payload.description || 'Trade finance invoice',
          UnitAmount: payload.amount,
          Quantity: 1,
          AccountCode: '200',
          TaxType: 'OUTPUT',
        },
      ],
      Total: payload.amount,
      CurrencyCode: payload.currency || 'USD',
      Date: new Date().toISOString().slice(0, 10),
      DueDate: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
      UpdatedDateUTC: new Date().toISOString(),
    };
  },
};

// ---------- GoCardless ----------
export const gocardless = {
  async createMandate(customer) {
    await sleep(jitter(180, 380));
    return {
      id: rid('MD', 12),
      created_at: new Date().toISOString(),
      scheme: 'bacs',
      status: 'active',
      reference: `OCEANX-${Date.now()}`,
      links: { customer: rid('CU', 12) },
      metadata: { counterparty: customer.companyName },
    };
  },
  async schedulePayment(mandateId, amount, currency = 'USD') {
    await sleep(jitter(160, 320));
    const chargeDate = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
    return {
      id: rid('PM', 12),
      created_at: new Date().toISOString(),
      charge_date: chargeDate,
      amount: Math.round(amount * 100), // pence/cents
      currency,
      status: 'pending_submission',
      reference: `OCEANX-DD-${Date.now()}`,
      links: { mandate: mandateId },
    };
  },
};

// ---------- HubSpot ----------
export const hubspot = {
  async upsertDeal(payload) {
    await sleep(jitter(150, 300));
    return {
      id: String(Math.floor(1e10 + Math.random() * 9e10)),
      properties: {
        dealname: `${payload.companyName} — Funded`,
        amount: String(payload.amount),
        dealstage: 'closedwon',
        pipeline: 'trade-finance',
        hs_object_source: 'OCEANX_AGENT',
        oceanx_invoice_id: payload.xeroInvoiceId,
        oceanx_payment_id: payload.gocardlessPaymentId,
        oceanx_risk_score: String(payload.riskScore),
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  },
};

// ---------- CompanyDB ----------
export const companyDb = {
  async lookup(name) {
    await sleep(jitter(80, 200));
    return lookupCompany(name);
  },
};
