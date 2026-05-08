// Mock company history database. Returns realistic-shape credit + payment data
// keyed loosely by name. Unknown counterparties get a neutral profile.

const RECORDS = {
  'global tech components': {
    canonicalName: 'Global Tech Components Ltd.',
    yearsTrading: 6,
    paidInvoicesPast12mo: 11,
    daysLatePast12mo: 47,
    avgDaysToPay: 38,
    creditFlags: ['MISSED_PAYMENT_X2', 'SUPPLY_CHAIN_INSTABILITY'],
    creditLimit: 50000,
    outstandingBalance: 45250,
  },
  'oceanic freights': {
    canonicalName: 'Oceanic Freights',
    yearsTrading: 4,
    paidInvoicesPast12mo: 24,
    daysLatePast12mo: 0,
    avgDaysToPay: 22,
    creditFlags: [],
    creditLimit: 75000,
    outstandingBalance: 8900,
  },
  'valkin limited': {
    canonicalName: 'VALKIN LIMITED',
    yearsTrading: 2,
    paidInvoicesPast12mo: 7,
    daysLatePast12mo: 12,
    avgDaysToPay: 41,
    creditFlags: ['VOLUME_SPIKE_3X', 'EXTENDED_TERMS_REQUESTED', 'LIQUIDITY_WATCH'],
    creditLimit: 60000,
    outstandingBalance: 112000,
  },
  'standard shippers': {
    canonicalName: 'Standard Shippers LLC',
    yearsTrading: 9,
    paidInvoicesPast12mo: 48,
    daysLatePast12mo: 3,
    avgDaysToPay: 28,
    creditFlags: [],
    creditLimit: 40000,
    outstandingBalance: 3200,
  },
  'nexus supply': {
    canonicalName: 'Nexus Supply Co.',
    yearsTrading: 3,
    paidInvoicesPast12mo: 14,
    daysLatePast12mo: 31,
    avgDaysToPay: 44,
    creditFlags: ['LATE_FEES_APPLIED', 'LIQUIDITY_WATCH'],
    creditLimit: 30000,
    outstandingBalance: 15750,
  },
  'horizon trade': {
    canonicalName: 'Horizon Trade Solutions',
    yearsTrading: 11,
    paidInvoicesPast12mo: 52,
    daysLatePast12mo: 0,
    avgDaysToPay: 14,
    creditFlags: ['EARLY_PAYER'],
    creditLimit: 100000,
    outstandingBalance: 2100,
  },
  'meridian manufacturing': {
    canonicalName: 'MERIDIAN MANUFACTURING INC.',
    yearsTrading: 18,
    paidInvoicesPast12mo: 36,
    daysLatePast12mo: 88,
    avgDaysToPay: 67,
    creditFlags: ['CHAPTER_11_FILED', 'EXTREME_CREDIT_RISK'],
    creditLimit: 0,
    outstandingBalance: 88000,
  },
};

export function lookupCompany(name) {
  if (!name) return defaultProfile(name);
  const key = name.toLowerCase();
  for (const [k, v] of Object.entries(RECORDS)) {
    if (key.includes(k) || k.includes(key.split(' ')[0])) {
      return { found: true, ...v };
    }
  }
  return defaultProfile(name);
}

function defaultProfile(name) {
  return {
    found: false,
    canonicalName: name || 'Unknown Counterparty',
    yearsTrading: 0,
    paidInvoicesPast12mo: 0,
    daysLatePast12mo: 0,
    avgDaysToPay: null,
    creditFlags: ['NEW_COUNTERPARTY'],
    creditLimit: 10000,
    outstandingBalance: 0,
  };
}
