// Canonical OCR text for the seven sample invoices. Used as the fallback path
// when pdf.js can't extract text (image-only scans) and as the only path for
// .png/.jpg inputs where we don't run real OCR. Pure data + pure resolver, so
// both the browser app and the Node eval harness can share it.

export const MOCK_OCR_MAP = {
  'INV-102_GlobalTech.pdf': "Global Tech Components Ltd. Total Due: $45,250.00. Warning Code 4A: Client has missed 2 previous payment deadlines. Supply chain instability noted.",
  'INV-103_Oceanic.pdf': "Oceanic Freights. Total: $8,900.00. Early payment discount applied. Standard shipping rates. No adverse credit events reported.",
  'INV-104_Valkin.pdf': "VALKIN LIMITED. Total Due: $112,000.00. Qualitative Notes: Massive volume increase detected. Client requesting extended credit terms due to cash flow constraints. Evaluate liquidity.",
  'INV-105_Standard.pdf': "Standard Shippers LLC. TOTAL AMOUNT DUE: $3,200.00. Standard routine maintenance invoice. Client is in good standing.",
  'INV-106_Nexus.png': "Nexus Supply Co. TOTAL DUE: $15,750.00. SYSTEM NOTE: Late fees of $750 applied due to delayed remittance on prior cycle. Minor liquidity warning flagged.",
  'INV-107_Horizon.jpg': "Horizon Trade Solutions. TOTAL AMOUNT: $2,100.00. Account Status: Excellent. Paid previous 12 invoices early. No risk factors present.",
  'INV-108_Meridian.pdf': "MERIDIAN MANUFACTURING INC. TOTAL BALANCE DUE NOW: $88,000.00. CRITICAL SUPPLIER NOTIFICATION: Meridian Manufacturing Inc. has recently filed for Chapter 11 bankruptcy. Extreme credit risk event.",
};

const PDF_GENERIC_FALLBACK =
  'Generic Scanned Invoice. Total Due: $5,500.00. Notes: Standard client. No risk factors present.';

// Resolve OCR text purely from filename — no File handling, no IO. Returns
// `null` if there's no plausible match (callers should then try real OCR or
// give up).
export function resolveOcrByFilename(filename) {
  if (!filename) return null;
  if (MOCK_OCR_MAP[filename]) return MOCK_OCR_MAP[filename];

  const lower = filename.toLowerCase();
  const ext = lower.split('.').pop();

  if (ext === 'png' || lower.includes('nexus')) return MOCK_OCR_MAP['INV-106_Nexus.png'];
  if (ext === 'jpg' || ext === 'jpeg' || lower.includes('horizon')) return MOCK_OCR_MAP['INV-107_Horizon.jpg'];
  if (ext === 'pdf') return PDF_GENERIC_FALLBACK;
  return null;
}
