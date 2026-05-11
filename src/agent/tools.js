// Tool catalog for the agent. Each tool has a JSON-schema-shaped definition
// (so it ports cleanly to Anthropic tool-use or MCP later) and a JS impl.

import { xero, gocardless, hubspot, companyDb, apollo, instantly, dripify, cin7, wise } from '../mocks/integrations.js';
import { buildExtractPrompt, buildScorePrompt } from './prompts.js';

// ---------- Tool definitions (the LLM sees these) ----------
export const TOOL_CATALOG = [
  {
    name: 'extractInvoice',
    description: 'Parse OCR text into canonical invoice fields. Always call first.',
    args: { ocrText: 'string (already provided in state.ocrText)' },
  },
  {
    name: 'lookupCompanyHistory',
    description: 'Pull counterparty payment history + credit flags from CompanyDB.',
    args: { companyName: 'string' },
  },
  {
    name: 'enrichLeadApollo',
    description: 'Enrich counterparty profile from Apollo (contacts, revenue, industry). Call after extractInvoice, before lookupCompanyHistory.',
    args: { companyName: 'string' },
  },
  {
    name: 'triggerInstantlyCampaign',
    description: 'Trigger cold-email outreach via Instantly. Only call when state.history.found === false (new counterparty with no prior history).',
    args: { companyName: 'string', email: 'string (from apolloEnrichment contacts)' },
  },
  {
    name: 'startDripifySequence',
    description: 'Enroll prospect in LinkedIn outreach via Dripify. Only call when state.history.found === false.',
    args: { companyName: 'string', linkedinUrl: 'string (from apolloEnrichment contacts)' },
  },
  {
    name: 'scoreRisk',
    description: 'Combine invoice + history → riskScore (0-100), confidence (0-1), reasoning.',
    args: { /* uses state.invoice and state.history */ },
  },
  {
    name: 'escalateToHuman',
    description: 'Push to human review queue. Required when risk > 70 or confidence < 0.7.',
    args: { reason: 'string' },
  },
  {
    name: 'generateXeroInvoice',
    description: 'Create the invoice record in Xero. Only on the clear-to-fund path.',
    args: { /* uses state.invoice */ },
  },
  {
    name: 'scheduleGoCardlessDebit',
    description: 'Create direct-debit mandate + schedule charge. Requires Xero invoice id.',
    args: { /* uses state.invoice and state.xeroInvoice */ },
  },
  {
    name: 'createCIN7Product',
    description: 'Create product record in CIN7 inventory system. Call on clear-to-fund path before createCIN7PurchaseOrder.',
    args: { /* uses state.invoice */ },
  },
  {
    name: 'createCIN7PurchaseOrder',
    description: 'Create purchase order in CIN7 linked to the product. Requires state.cin7Product.',
    args: { /* uses state.invoice and state.cin7Product */ },
  },
  {
    name: 'initiateWiseTransfer',
    description: 'Pay supplier via Wise bank transfer. Call after scheduleGoCardlessDebit, before updateHubSpotDeal.',
    args: { /* uses state.invoice */ },
  },
  {
    name: 'updateHubSpotDeal',
    description: 'Upsert the deal in HubSpot CRM with funded status and IDs.',
    args: { /* uses state.invoice, state.xeroInvoice, state.gocardlessPayment, state.risk */ },
  },
  {
    name: 'done',
    description: 'Terminate the loop. Call only when all required steps for the path are complete.',
    args: {},
  },
];

// ---------- Tool implementations ----------
// Each impl receives ({ args, state, llm, policy }) and returns an object
// that gets merged into state. Tools may also throw; the orchestrator handles
// retries/escalation.

export const TOOL_IMPLS = {
  async extractInvoice({ args, state, llm }) {
    const ocrText = args.ocrText || state.ocrText;
    const prompt = buildExtractPrompt(ocrText);
    const raw = await llm(prompt);
    const parsed = safeJson(raw, { companyName: 'Unknown', invoiceAmount: 0, currency: 'USD', rawNotes: '' });
    return { invoice: parsed };
  },

  async lookupCompanyHistory({ args, state }) {
    const name = args.companyName || state.invoice?.companyName;
    const history = await companyDb.lookup(name);
    return { history };
  },

  async enrichLeadApollo({ args, state }) {
    const name = args.companyName || state.invoice?.companyName;
    const response = await apollo.enrichCompany(name);
    return { apolloEnrichment: { request: { companyName: name }, response } };
  },

  async triggerInstantlyCampaign({ args, state }) {
    const contact = state.apolloEnrichment?.response?.contacts?.[0];
    const payload = {
      companyName: args.companyName || state.invoice?.companyName,
      email: contact?.email || args.email || 'unknown@example.com',
    };
    const response = await instantly.triggerCampaign(payload);
    return { instantlyCampaign: { request: payload, response } };
  },

  async startDripifySequence({ args, state }) {
    const contact = state.apolloEnrichment?.response?.contacts?.[0];
    const payload = {
      companyName: args.companyName || state.invoice?.companyName,
      linkedinUrl: contact?.linkedin_url || args.linkedinUrl || '',
    };
    const response = await dripify.startSequence(payload);
    return { dripifySequence: { request: payload, response } };
  },

  async scoreRisk({ state, llm, policy }) {
    if (!state.invoice || !state.history) {
      throw new Error('scoreRisk requires invoice and history in state');
    }
    const prompt = buildScorePrompt({ invoice: state.invoice, history: state.history, policy });
    const raw = await llm(prompt);
    const parsed = safeJson(raw, { riskScore: 50, riskBand: 'WATCH', confidence: 0.5, reasoning: 'LLM parse fallback.' });
    return { risk: parsed };
  },

  async escalateToHuman({ args, state }) {
    return {
      escalation: {
        reason: args.reason || 'Policy-driven escalation',
        snapshot: {
          invoice: state.invoice,
          history: state.history,
          risk: state.risk,
        },
      },
    };
  },

  async generateXeroInvoice({ state }) {
    const inv = state.invoice;
    if (!inv) throw new Error('generateXeroInvoice requires invoice in state');
    const payload = {
      companyName: inv.companyName,
      amount: Number(inv.invoiceAmount) || 0,
      currency: inv.currency || 'USD',
      description: 'Auto-generated by OceanX agent',
    };
    const response = await xero.createInvoice(payload);
    return { xeroInvoice: { request: payload, response } };
  },

  async scheduleGoCardlessDebit({ state }) {
    const inv = state.invoice;
    const xeroInv = state.xeroInvoice?.response;
    if (!inv || !xeroInv) throw new Error('scheduleGoCardlessDebit requires invoice + xeroInvoice');
    const mandateReq = { companyName: inv.companyName };
    const mandate = await gocardless.createMandate(mandateReq);
    const payment = await gocardless.schedulePayment(mandate.id, Number(inv.invoiceAmount) || 0, inv.currency || 'USD');
    return {
      gocardlessMandate: { request: mandateReq, response: mandate },
      gocardlessPayment: { request: { mandateId: mandate.id, amount: inv.invoiceAmount, currency: inv.currency || 'USD' }, response: payment },
    };
  },

  async createCIN7Product({ state }) {
    const inv = state.invoice;
    if (!inv) throw new Error('createCIN7Product requires invoice in state');
    const payload = { companyName: inv.companyName, amount: Number(inv.invoiceAmount) || 0, currency: inv.currency || 'USD' };
    const response = await cin7.createProduct(payload);
    return { cin7Product: { request: payload, response } };
  },

  async createCIN7PurchaseOrder({ state }) {
    const inv = state.invoice;
    const product = state.cin7Product?.response;
    if (!inv || !product) throw new Error('createCIN7PurchaseOrder requires invoice and cin7Product');
    const payload = { companyName: inv.companyName, productId: product.ProductID, amount: Number(inv.invoiceAmount) || 0, currency: inv.currency || 'USD' };
    const response = await cin7.createPurchaseOrder(payload);
    return { cin7PurchaseOrder: { request: payload, response } };
  },

  async initiateWiseTransfer({ state }) {
    const inv = state.invoice;
    if (!inv) throw new Error('initiateWiseTransfer requires invoice in state');
    const payload = { companyName: inv.companyName, amount: Number(inv.invoiceAmount) || 0, currency: inv.currency || 'USD' };
    const response = await wise.initiateTransfer(payload);
    return { wiseTransfer: { request: payload, response } };
  },

  async updateHubSpotDeal({ state }) {
    const payload = {
      companyName: state.invoice?.companyName,
      amount: Number(state.invoice?.invoiceAmount) || 0,
      xeroInvoiceId: state.xeroInvoice?.response?.Id,
      gocardlessPaymentId: state.gocardlessPayment?.response?.id,
      riskScore: state.risk?.riskScore,
    };
    const response = await hubspot.upsertDeal(payload);
    return { hubspotDeal: { request: payload, response } };
  },

  async done() {
    return { done: true };
  },
};

function safeJson(raw, fallback) {
  if (!raw) return fallback;
  try {
    const cleaned = String(raw).replace(/```json/gi, '').replace(/```/g, '').trim();
    const firstBrace = cleaned.indexOf('{');
    const lastBrace = cleaned.lastIndexOf('}');
    if (firstBrace === -1 || lastBrace === -1) return fallback;
    return JSON.parse(cleaned.slice(firstBrace, lastBrace + 1));
  } catch {
    return fallback;
  }
}
