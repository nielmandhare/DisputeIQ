// Tests for the synthetic 100-dispute evaluation dataset + SyntheticDisputeProvider
// + evaluation service. Hermetic: uses an isolated DB and clears the live LLM
// key so ingestion stays heuristic/deterministic.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { db } from '../src/db.js';
import { config } from '../src/config.js';
import { generateSyntheticDisputes, SCENARIOS } from '../src/providers/syntheticDataset.js';
import { SyntheticDisputeProvider } from '../src/providers/syntheticProvider.js';
import { evaluatePopulation, buildEvaluationReport } from '../src/services/evaluation.js';

// Hermetic isolation: clear live LLM key so bulk ingestion is heuristic + deterministic.
process.env.RAZORPAY_SUBMISSION_MODE = 'simulated';
delete process.env.LLM_API_KEY;
config.llm.apiKey = '';

after(async () => {
  // let any in-flight ingestion writes settle, then clean up demo rows
  await new Promise((r) => setTimeout(r, 80));
  try { db.prepare("DELETE FROM disputes WHERE provider='demo'").run(); } catch { /* ignore */ }
});

test('generator is deterministic for a fixed seed', () => {
  const a = generateSyntheticDisputes(100, 20260601);
  const b = generateSyntheticDisputes(100, 20260601);
  assert.equal(a.length, 100);
  assert.equal(a[0].id, b[0].id);
  assert.equal(a[42].razorpayDisputeId, b[42].razorpayDisputeId);
  assert.equal(a[42].evidence.length, b[42].evidence.length);
  assert.notEqual(a[0].id, a[1].id); // distinct ids
});

test('generator produces exactly 100 disputes with required shape + ground truth', () => {
  const ds = generateSyntheticDisputes(100);
  assert.equal(ds.length, 100);
  const first = ds[0];
  assert.equal(first.provider, 'demo');
  assert.ok(first.id.startsWith('dupu_demo_'));
  assert.ok(Array.isArray(first.evidence) && first.evidence.length >= 1);
  assert.ok(first.groundTruth && typeof first.groundTruth.customerFavorable === 'boolean');
  assert.ok(first.groundTruth && typeof first.groundTruth.hasContradiction === 'boolean');
  // at least one contradiction scenario and one customer-favourable exist
  assert.ok(ds.some((d) => d.groundTruth.hasContradiction));
  assert.ok(ds.some((d) => d.groundTruth.customerFavorable));
  // OCR-required scenarios exist
  assert.ok(ds.some((d) => d.evidence.some((e) => e.ocrRequired)));
});

test('scenario archetypes are all represented and weighted', () => {
  const ds = generateSyntheticDisputes(100);
  const keys = new Set(ds.map((d) => d.scenarioKey));
  // every defined scenario should appear at least once in 100 draws
  for (const sc of SCENARIOS) assert.ok(keys.has(sc.key), `scenario ${sc.key} missing`);
});

test('SyntheticDisputeProvider loads 100 disputes with provider=demo, never Razorpay', () => {
  const res = SyntheticDisputeProvider.loadDemoDataset(100, { regenerateDrafts: true });
  assert.equal(res.provider, 'demo');
  assert.equal(res.loaded, 100);
  assert.ok(res.evidenceCount >= 100);
  // scenarioDistribution is real (sums to 100, covers all archetypes)
  const distSum = Object.values(res.scenarioDistribution).reduce((a, b) => a + b, 0);
  assert.equal(distSum, 100);
  for (const sc of SCENARIOS) assert.ok(res.scenarioDistribution[sc.key] > 0, `scenario ${sc.key} missing from distribution`);
  // verify DB rows are stamped provider='demo' and ids use the demo namespace
  const rows = db.prepare("SELECT provider, razorpayDisputeId FROM disputes WHERE provider='demo'").all();
  assert.equal(rows.length, 100);
  assert.ok(rows.every((r) => r.provider === 'demo' && r.razorpayDisputeId.startsWith('dupu_demo_')));
  // sanity: no real Razorpay id leaked into the demo set
  assert.ok(!rows.some((r) => /^dupu_[0-9a-f]{8,}$/.test(r.razorpayDisputeId) && !r.razorpayDisputeId.startsWith('dupu_demo_')));
  // loading a synthetic dispute generates a real DISPUTE_RECEIVED audit event
  const audit = db.prepare("SELECT COUNT(*) c FROM audit_events WHERE eventType='DISPUTE_RECEIVED' AND entityId IN (SELECT id FROM disputes WHERE provider='demo')").get();
  assert.equal(audit.c, 100);
});

test('SyntheticDisputeProvider clears previously loaded demo disputes', () => {
  const cleared = SyntheticDisputeProvider.clearDemoDataset();
  assert.ok(cleared >= 0);
  const remaining = db.prepare("SELECT COUNT(*) c FROM disputes WHERE provider='demo'").get();
  assert.equal(remaining.c, 0);
});

test('evaluation computes population metrics + detection vs ground truth', () => {
  SyntheticDisputeProvider.clearDemoDataset();
  SyntheticDisputeProvider.loadDemoDataset(100, { regenerateDrafts: true });
  const ev = evaluatePopulation();
  assert.equal(ev.synthetic, true);
  assert.equal(ev.total, 100);
  assert.ok(ev.ers.average >= 0 && ev.ers.average <= 100);
  // contradiction recall must be high (planted contradictions are detectable)
  assert.ok(ev.detection.contradictionRecall >= 0.8, `contradiction recall ${ev.detection.contradictionRecall}`);
  assert.equal(ev.detection.contradictionsFound, ev.detection.contradictionsTruth);
  // report renders and is honest about synthetic data
  const report = buildEvaluationReport(ev);
  assert.ok(report.includes('SYNTHETIC') || report.toLowerCase().includes('synthetic'));
  assert.ok(report.includes('100'));
});
