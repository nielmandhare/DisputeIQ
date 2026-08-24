// Synthetic 100-dispute evaluation dataset generator for DisputeIQ.
//
// IMPORTANT (per project spec): This is a SYNTHETIC, controlled evaluation
// dataset. It is NOT a Razorpay system and must never be presented as one.
// Every record is clearly labelled provider: 'demo'. The goal is a serious,
// reproducible evaluation environment: a population of payment disputes with
// realistic merchants / customers / payments / orders / evidence / contradictions
// / missing-or-ambiguous evidence / OCR failures, each carrying GROUND-TRUTH
// labels so we can MEASURE DisputeIQ's detection performance (contradiction
// recall, customer-favourable identification, ERS calibration).
//
// Deterministic: a fixed seed (mulberry32) means the same 100 disputes are
// produced every run — essential for a controlled evaluation.

// ---- seeded PRNG (mulberry32) ----
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---- reference pools ----
const MERCHANTS = [
  { name: 'Bharat Electronics Mart', category: 'Consumer Electronics' },
  { name: 'Swadeshi Fashion Hub', category: 'Apparel' },
  { name: 'FreshKart Groceries', category: 'Grocery' },
  { name: 'BookWorm Online', category: 'Books' },
  { name: 'HomeStyle Furnishings', category: 'Home & Kitchen' },
  { name: 'FitGear Sports', category: 'Sports & Fitness' },
  { name: 'ToysNMore', category: 'Toys' },
  { name: 'MedPlus Pharma', category: 'Healthcare' },
  { name: 'AutoParts Direct', category: 'Automotive' },
  { name: 'Gourmet Bites', category: 'Food & Beverage' },
  { name: 'PixelTech Accessories', category: 'Electronics' },
  { name: 'Saffron Silk Sarees', category: 'Apparel' },
];

const FIRST = ['Aarav', 'Vivaan', 'Aditi', 'Diya', 'Kabir', 'Ananya', 'Reyansh', 'Isha', 'Arjun', 'Myra', 'Vihaan', 'Sara', 'Rohan', 'Kiara', 'Dev', 'Navya', 'Om', 'Aadhya', 'Krish', 'Riya'];
const LAST = ['Sharma', 'Verma', 'Iyer', 'Nair', 'Reddy', 'Mehta', 'Bose', 'Khan', 'Rao', 'Gupta', 'Das', 'Patel', 'Joshi', 'Chopra', 'Singh', 'Banerjee'];
const CITIES = ['Mumbai', 'Delhi', 'Bengaluru', 'Hyderabad', 'Chennai', 'Kolkata', 'Pune', 'Ahmedabad', 'Jaipur', 'Lucknow'];
const COURIERS = ['BlueDart', 'Delhivery', 'Ekart', 'IndiaPost', 'Xpressbees', 'ShadowFax'];
const PRODUCTS = ['Bluetooth Headphones BH-700', 'Cotton T-Shirt (Size L)', 'Organic Honey 500g', 'Mystery Novel Set (3 books)', 'Wooden Dining Chair', 'Yoga Mat Pro 6mm', 'Building Blocks Age 4+', 'Vitamin C Tablets 60s', 'Car Floor Mats (Swift)', 'Assorted Chocolates 1kg', 'USB-C Cable 2m', 'Banarasi Silk Saree'];

// 8-type evidence taxonomy (authoritative list, mirrors classifier.js)
const EVIDENCE_TYPES = [
  'INVOICE_OR_RECEIPT',
  'SHIPPING_OR_DELIVERY',
  'COMMUNICATION',
  'REFUND_OR_CANCELLATION',
  'IDENTITY_OR_KYC',
  'PRODUCT_PHOTO',
  'LEGAL_OR_DISPUTE_RESPONSE',
  'OTHER',
];

// Scenario archetypes. Each defines how to build evidence + the ground truth.
// weight = relative frequency in the 100-dispute population.
const SCENARIOS = [
  {
    key: 'strong_merchant_case',
    weight: 18,
    label: 'Strong merchant case (consistent evidence)',
    build: (r, ctx) => {
      const inv = `INVOICE\nInvoice No: INV-${ctx.order}\nDate: ${ctx.d1}\nSold To: ${ctx.customer}\nOrder: ORD-${ctx.order}\nAmount: Rs ${ctx.amount}.00\nItem: ${ctx.product}\nPayment Ref: ${ctx.pay}\nPaid in full.`;
      const ship = `SHIPPING CONFIRMATION\nCourier: ${ctx.courier}\nTracking: ${ctx.track}\nOrder: ORD-${ctx.order}\nDelivered on: ${ctx.d2} ${ctx.t2}\nAddress confirmed. Customer signed on receipt.`;
      const comm = `From: ${ctx.customer}\nSubject: Order received\nHi, I confirm receiving my ${ctx.product} today in good condition. Thanks!`;
      return {
        evidence: [
          { type: 'INVOICE_OR_RECEIPT', text: inv, name: 'invoice.txt' },
          { type: 'SHIPPING_OR_DELIVERY', text: ship, name: 'shipping.txt' },
          { type: 'COMMUNICATION', text: comm, name: 'email.txt' },
        ],
        groundTruth: { customerFavorable: false, expectedOutcome: 'CONTEST', hasContradiction: false, sufficientEvidence: true },
      };
    },
  },
  {
    key: 'contradiction_delivery',
    weight: 16,
    label: 'Contradiction: cancel/return claim dated before delivery',
    build: (r, ctx) => {
      const claim = `DISPUTE RAISED\nI cancelled this order ORD-${ctx.order} on ${ctx.d1} and never got the ${ctx.product}. Please refund Rs ${ctx.amount}.`;
      const ship = `SHIPPING CONFIRMATION\nCourier: ${ctx.courier}\nTracking: ${ctx.track}\nOrder: ORD-${ctx.order}\nDelivered on: ${ctx.d2} ${ctx.t2}\nDelivered to: ${ctx.customer}, ${ctx.city}`;
      const inv = `INVOICE\nInvoice No: INV-${ctx.order}\nOrder: ORD-${ctx.order}\nAmount: Rs ${ctx.amount}.00\nItem: ${ctx.product}`;
      return {
        evidence: [
          { type: 'COMMUNICATION', text: claim, name: 'customer_claim.txt' },
          { type: 'SHIPPING_OR_DELIVERY', text: ship, name: 'shipping.txt' },
          { type: 'INVOICE_OR_RECEIPT', text: inv, name: 'invoice.txt' },
        ],
        groundTruth: { customerFavorable: false, expectedOutcome: 'CONTEST', hasContradiction: true, contradictionType: 'chronological', sufficientEvidence: true },
      };
    },
  },
  {
    key: 'missing_evidence',
    weight: 14,
    label: 'Missing evidence: only invoice, no delivery proof',
    build: (r, ctx) => {
      const inv = `INVOICE\nInvoice No: INV-${ctx.order}\nOrder: ORD-${ctx.order}\nAmount: Rs ${ctx.amount}.00\nItem: ${ctx.product}`;
      const comm = `From: ${ctx.customer}\nI did not receive the ${ctx.product} I paid for.`;
      return {
        evidence: [
          { type: 'INVOICE_OR_RECEIPT', text: inv, name: 'invoice.txt' },
          { type: 'COMMUNICATION', text: comm, name: 'note.txt' },
        ],
        groundTruth: { customerFavorable: false, expectedOutcome: 'NEEDS_MORE_EVIDENCE', hasContradiction: false, sufficientEvidence: false },
      };
    },
  },
  {
    key: 'ambiguous_undated',
    weight: 10,
    label: 'Ambiguous: undated / partial evidence',
    build: (r, ctx) => {
      const inv = `INVOICE\nInvoice No: INV-${ctx.order}\nOrder: ORD-${ctx.order}\nAmount: Rs ${ctx.amount}.00\nItem: ${ctx.product}`;
      const ship = `Courier update: your package is out for delivery.`; // no date, no tracking
      return {
        evidence: [
          { type: 'INVOICE_OR_RECEIPT', text: inv, name: 'invoice.txt' },
          { type: 'SHIPPING_OR_DELIVERY', text: ship, name: 'sms.txt' },
        ],
        groundTruth: { customerFavorable: false, expectedOutcome: 'NEEDS_MORE_EVIDENCE', hasContradiction: false, sufficientEvidence: false },
      };
    },
  },
  {
    key: 'ocr_failure',
    weight: 8,
    label: 'OCR failure: scanned receipt unreadable',
    build: (r, ctx) => {
      const inv = `INVOICE\nInvoice No: INV-${ctx.order}\nOrder: ORD-${ctx.order}\nAmount: Rs ${ctx.amount}.00\nItem: ${ctx.product}`;
      return {
        evidence: [
          { type: 'INVOICE_OR_RECEIPT', text: inv, name: 'invoice.txt' },
          { type: 'INVOICE_OR_RECEIPT', text: '', name: 'receipt_scan.jpg', ocrRequired: true },
        ],
        groundTruth: { customerFavorable: false, expectedOutcome: 'NEEDS_OCR', hasContradiction: false, sufficientEvidence: false },
      };
    },
  },
  {
    key: 'customer_favorable_merchant_error',
    weight: 12,
    label: 'Customer-favourable: wrong item shipped',
    build: (r, ctx) => {
      const inv = `INVOICE\nInvoice No: INV-${ctx.order}\nOrder: ORD-${ctx.order}\nAmount: Rs ${ctx.amount}.00\nItem: ${ctx.product}`;
      const photo = `PRODUCT PHOTO\nThe item received is a different product (defective / wrong SKU), not the ${ctx.product} ordered. Photo attached showing mismatch.`;
      const comm = `From: ${ctx.customer}\nYou sent the wrong item. I want a refund.`;
      return {
        evidence: [
          { type: 'INVOICE_OR_RECEIPT', text: inv, name: 'invoice.txt' },
          { type: 'PRODUCT_PHOTO', text: photo, name: 'photo.txt' },
          { type: 'COMMUNICATION', text: comm, name: 'email.txt' },
        ],
        groundTruth: { customerFavorable: true, expectedOutcome: 'ACCEPT_REFUND', hasContradiction: false, sufficientEvidence: true },
      };
    },
  },
  {
    key: 'refund_already_processed',
    weight: 8,
    label: 'Refund already processed (merchant proof)',
    build: (r, ctx) => {
      const inv = `INVOICE\nInvoice No: INV-${ctx.order}\nOrder: ORD-${ctx.order}\nAmount: Rs ${ctx.amount}.00`;
      const refund = `REFUND CONFIRMATION\nRefund of Rs ${ctx.amount}.00 for ORD-${ctx.order} initiated on ${ctx.d1}.\nUTR: TXN${ctx.order}99. Expected to credit in 5-7 days.`;
      return {
        evidence: [
          { type: 'INVOICE_OR_RECEIPT', text: inv, name: 'invoice.txt' },
          { type: 'REFUND_OR_CANCELLATION', text: refund, name: 'refund.txt' },
        ],
        groundTruth: { customerFavorable: true, expectedOutcome: 'ACCEPT_REFUND', hasContradiction: false, sufficientEvidence: true },
      };
    },
  },
  {
    key: 'duplicate_transaction',
    weight: 6,
    label: 'Duplicate transaction',
    build: (r, ctx) => {
      const inv = `INVOICE\nInvoice No: INV-${ctx.order}\nOrder: ORD-${ctx.order}\nAmount: Rs ${ctx.amount}.00\nItem: ${ctx.product}`;
      const comm = `From: ${ctx.customer}\nI was charged TWICE for ORD-${ctx.order}. Two debits of Rs ${ctx.amount} appear on my statement.`;
      return {
        evidence: [
          { type: 'INVOICE_OR_RECEIPT', text: inv, name: 'invoice.txt' },
          { type: 'COMMUNICATION', text: comm, name: 'email.txt' },
        ],
        groundTruth: { customerFavorable: true, expectedOutcome: 'ACCEPT_REFUND', hasContradiction: false, sufficientEvidence: true },
      };
    },
  },
  {
    key: 'product_not_as_described',
    weight: 6,
    label: 'Product not as described (photos present)',
    build: (r, ctx) => {
      const inv = `INVOICE\nInvoice No: INV-${ctx.order}\nOrder: ORD-${ctx.order}\nAmount: Rs ${ctx.amount}.00\nItem: ${ctx.product}`;
      const photo = `PRODUCT PHOTO\nReceived ${ctx.product} but colour/spec differs from listing. Photo shows discrepancy.`;
      const ship = `SHIPPING CONFIRMATION\nCourier: ${ctx.courier}\nTracking: ${ctx.track}\nOrder: ORD-${ctx.order}\nDelivered on: ${ctx.d2}`;
      return {
        evidence: [
          { type: 'INVOICE_OR_RECEIPT', text: inv, name: 'invoice.txt' },
          { type: 'SHIPPING_OR_DELIVERY', text: ship, name: 'shipping.txt' },
          { type: 'PRODUCT_PHOTO', text: photo, name: 'photo.txt' },
        ],
        groundTruth: { customerFavorable: true, expectedOutcome: 'ACCEPT_REFUND', hasContradiction: false, sufficientEvidence: true },
      };
    },
  },
  {
    key: 'fraudulent',
    weight: 2,
    label: 'Fraudulent transaction (identity proof needed)',
    build: (r, ctx) => {
      const inv = `INVOICE\nInvoice No: INV-${ctx.order}\nOrder: ORD-${ctx.order}\nAmount: Rs ${ctx.amount}.00`;
      const kyc = `IDENTITY / KYC\nOrder ORD-${ctx.order} placed from an unrecognised device and IP. Customer disputes authorising this payment.`;
      return {
        evidence: [
          { type: 'INVOICE_OR_RECEIPT', text: inv, name: 'invoice.txt' },
          { type: 'IDENTITY_OR_KYC', text: kyc, name: 'kyc.txt' },
        ],
        groundTruth: { customerFavorable: true, expectedOutcome: 'ESCALATE', hasContradiction: false, sufficientEvidence: true },
      };
    },
  },
];

const REASON_FOR_SCENARIO = {
  strong_merchant_case: 'non_receipt_of_goods',
  contradiction_delivery: 'non_receipt_of_goods',
  missing_evidence: 'non_receipt_of_goods',
  ambiguous_undated: 'non_receipt_of_goods',
  ocr_failure: 'non_receipt_of_goods',
  customer_favorable_merchant_error: 'product_not_as_described',
  refund_already_processed: 'credit_not_processed',
  duplicate_transaction: 'duplicate_transaction',
  product_not_as_described: 'product_not_as_described',
  fraudulent: 'fraudulent_transaction',
};

function pick(r, arr) { return arr[Math.floor(r() * arr.length)]; }
function randInt(r, lo, hi) { return lo + Math.floor(r() * (hi - lo + 1)); }

function buildContext(r, i) {
  const merchant = pick(r, MERCHANTS);
  const customer = `${pick(r, FIRST)} ${pick(r, LAST)}`;
  const city = pick(r, CITIES);
  const courier = pick(r, COURIERS);
  const product = pick(r, PRODUCTS);
  const order = 100000 + i * 7 + randInt(r, 0, 6);
  const amount = randInt(r, 2, 48) * 100; // Rs 200–4800
  const day1 = randInt(r, 1, 27);
  const day2 = Math.min(28, day1 + randInt(r, 1, 5));
  const month = randInt(r, 1, 6);
  const d1 = `2026-0${month}-${String(day1).padStart(2, '0')}`;
  const d2 = `2026-0${month}-${String(day2).padStart(2, '0')}`;
  const t2 = `${String(randInt(r, 9, 18))}:${String(randInt(r, 10, 59)).padStart(2, '0')}`;
  const track = `${courier.slice(0, 2).toUpperCase()}-${randInt(r, 100000000, 999999999)}`;
  const pay = `pay_${randInt(r, 100000000000, 999999999999)}`;
  return { merchant, customer, city, courier, product, order, amount, d1, d2, t2, track, pay, i };
}

function weightedScenario(r) {
  const total = SCENARIOS.reduce((s, x) => s + x.weight, 0);
  let x = r() * total;
  for (const sc of SCENARIOS) {
    if (x < sc.weight) return sc;
    x -= sc.weight;
  }
  return SCENARIOS[0];
}

/**
 * Generate `count` synthetic dispute descriptors (default 100).
 * Each descriptor: { id, provider:'demo', merchant, customer, city, scenario,
 *   reasonCode, reasonLabel, amountInr, currency, createdAt, deadlineAt,
 *   evidence:[{type,text,name,ocrRequired?}], groundTruth:{...} }
 */
export function generateSyntheticDisputes(count = 100, seed = 20260601) {
  const r = mulberry32(seed);
  const disputes = [];
  for (let i = 0; i < count; i++) {
    const sc = weightedScenario(r);
    const ctx = buildContext(r, i);
    const { evidence, groundTruth } = sc.build(r, ctx);
    const created = Math.floor(Date.now() / 1000) - randInt(r, 1, 30) * 86400;
    const deadline = created + 36 * 3600; // 36h response window
    disputes.push({
      id: `dupu_demo_${String(i + 1).padStart(3, '0')}`,
      provider: 'demo',
      scenarioKey: sc.key,
      scenarioLabel: sc.label,
      merchant: ctx.merchant,
      customer: ctx.customer,
      city: ctx.city,
      reasonCode: REASON_FOR_SCENARIO[sc.key],
      reasonLabel: reasonLabel(REASON_FOR_SCENARIO[sc.key]),
      amountInr: ctx.amount,
      currency: 'INR',
      createdAt: created,
      deadlineAt: deadline,
      evidence,
      groundTruth,
    });
  }
  return disputes;
}

function reasonLabel(code) {
  const m = {
    non_receipt_of_goods: 'Non-receipt of goods',
    non_receipt_of_services: 'Non-receipt of services',
    credit_not_processed: 'Credit not processed',
    cancelled_recurring_payment: 'Cancelled recurring payment',
    product_not_as_described: 'Product not as described',
    duplicate_transaction: 'Duplicate transaction',
    fraudulent_transaction: 'Fraudulent transaction',
    general: 'General',
  };
  return m[code] || 'General';
}

export { EVIDENCE_TYPES, SCENARIOS };
