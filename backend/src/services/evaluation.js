// Evaluation service — measures DisputeIQ's performance over the synthetic
// 100-dispute population using the GROUND-TRUTH labels embedded in the dataset.
//
// This is a CONTROLLED evaluation: because each synthetic dispute carries a
// ground-truth label (customerFavorable, hasContradiction, expectedOutcome,
// sufficientEvidence), we can compute detection precision/recall and ERS
// calibration. The dataset is SYNTHETIC — the report states this explicitly.
import { db } from '../db.js';
import { listForDispute as listContradictions } from '../repositories/contradictions.js';
import { generateSyntheticDisputes } from '../providers/syntheticDataset.js';

/**
 * Evaluate the loaded demo population.
 * Returns: { population, ersBuckets, contradictionStats, customerFavorable,
 *            readinessTiers, detection (vs ground truth), generatedAt, synthetic:true }
 */
export function evaluatePopulation() {
  const rows = db.prepare("SELECT * FROM disputes WHERE provider='demo' ORDER BY razorpayDisputeId ASC").all();
  const total = rows.length;
  if (total === 0) {
    return { synthetic: true, total: 0, note: 'No demo disputes loaded. Call /api/demo/seed first.' };
  }

  // ERS distribution
  const ersBuckets = { '0-20': 0, '21-40': 0, '41-60': 0, '61-80': 0, '81-100': 0 };
  let ersSum = 0;
  for (const r of rows) {
    const s = r.ers != null ? r.ers : 0;
    ersSum += s;
    if (s <= 20) ersBuckets['0-20']++;
    else if (s <= 40) ersBuckets['21-40']++;
    else if (s <= 60) ersBuckets['41-60']++;
    else if (s <= 80) ersBuckets['61-80']++;
    else ersBuckets['81-100']++;
  }

  // Readiness tiers (derived from ERS + approval state). Thresholds reflect the
  // realistic ERS distribution of the synthetic population (avg ~71, strong cases
  // reach the low-70s once grounded timeline + all required evidence are present).
  const readinessTiers = { contestReady: 0, needsEvidence: 0, blocked: 0 };
  for (const r of rows) {
    const s = r.ers != null ? r.ers : 0;
    if (s >= 72 && r.responseStatus === 'DRAFT_APPROVED') readinessTiers.contestReady++;
    else if (s >= 60) readinessTiers.needsEvidence++;
    else readinessTiers.blocked++;
  }

  // Contradiction stats (from the actual pipeline output)
  let contradictionsDetected = 0;
  let disputesWithContradiction = 0;
  for (const r of rows) {
    const cs = listContradictions(r.id);
    if (cs.length) { contradictionsDetected += cs.length; disputesWithContradiction++; }
  }

  // Customer-favourable: count disputes whose expected outcome is a refund/accept,
  // discovered via the recommendation in the latest draft (if any).
  let customerFavorableDetected = 0;
  for (const r of rows) {
    const draft = db.prepare('SELECT draft, metrics FROM response_drafts WHERE disputeId=? ORDER BY draftVersion DESC LIMIT 1').get(r.id);
    if (draft && /(refund|accept|wrong item|customer is correct|merchant at fault)/i.test(draft.draft || '')) {
      customerFavorableDetected++;
    }
  }

  // Detection accuracy vs ground truth. The loaded demo rows are in generator
  // order (loadDemoDataset iterates generateSyntheticDisputes sequentially), so
  // row[i] aligns with dataset[i]'s groundTruth. We re-generate with the same
  // seed to obtain the labels.
  const seed = 20260601;
  const dataset = generateSyntheticDisputes(total, seed);
  const detection = { total, contradictionRecall: 0, customerFavourableRecall: 0, sufficientEvidencePrecision: 0 };
  let contradictionsTruth = 0, contradictionsFound = 0;
  let cfTruth = 0, cfFound = 0;
  let seTruthPos = 0, sePredPos = 0, seCorrect = 0;
  for (let i = 0; i < total; i++) {
    const gt = dataset[i].groundTruth;
    const row = rows[i];
    // Contradiction detection: pipeline found any contradiction for this dispute?
    const cs = listContradictions(row.id);
    const found = cs.length > 0;
    if (gt.hasContradiction) {
      contradictionsTruth++;
      if (found) contradictionsFound++;
    }
    // Customer-favourable detection via draft recommendation text.
    const draft = db.prepare('SELECT draft FROM response_drafts WHERE disputeId=? ORDER BY draftVersion DESC LIMIT 1').get(row.id);
    const cfDetected = draft && /(refund|accept|wrong item|customer is correct|merchant at fault)/i.test(draft.draft || '');
    if (gt.customerFavorable) {
      cfTruth++;
      if (cfDetected) cfFound++;
    }
    // Sufficient-evidence: ground truth vs ERS>=60 heuristic.
    const ers = row.ers != null ? row.ers : 0;
    const predSufficient = ers >= 60;
    if (gt.sufficientEvidence) {
      seTruthPos++;
      if (predSufficient) { sePredPos++; seCorrect++; }
    } else if (predSufficient) {
      sePredPos++; // false positive
    }
  }
  detection.contradictionRecall = contradictionsTruth ? contradictionsFound / contradictionsTruth : 1;
  detection.customerFavourableRecall = cfTruth ? cfFound / cfTruth : 1;
  detection.sufficientEvidencePrecision = sePredPos ? seCorrect / sePredPos : 1;
  detection.contradictionsTruth = contradictionsTruth;
  detection.contradictionsFound = contradictionsFound;
  detection.customerFavourableTruth = cfTruth;
  detection.customerFavourableFound = cfFound;

  return {
    synthetic: true,
    generatedAt: new Date().toISOString(),
    total,
    ers: { average: Math.round(ersSum / total), buckets: ersBuckets },
    readinessTiers,
    contradictions: { disputesWithContradiction, totalContradictions: contradictionsDetected },
    customerFavorable: { detected: customerFavorableDetected },
    detection,
  };
}

/**
 * Build a human-readable evaluation report (markdown). Honest about synthetic data.
 */
export function buildEvaluationReport(evalResult) {
  if (!evalResult || evalResult.total === 0) {
    return '# DisputeIQ — Evaluation Report\n\nNo demo disputes loaded. Run the demo seed first.\n';
  }
  const d = evalResult.detection || {};
  const lines = [];
  lines.push('# DisputeIQ — Synthetic Evaluation Report');
  lines.push('');
  lines.push(`> **Evaluation dataset is SYNTHETIC.** These ${evalResult.total} disputes are generated`);
  lines.push('> for controlled evaluation of DisputeIQ\'s analysis pipeline. They are not real Razorpay');
  lines.push('> disputes and must never be presented as such.');
  lines.push('');
  lines.push(`Generated: ${evalResult.generatedAt}`);
  lines.push('');
  lines.push('## Population overview');
  lines.push(`- Disputes evaluated: **${evalResult.total}**`);
  lines.push(`- Average Evidence Readiness Score (ERS): **${evalResult.ers.average}**`);
  lines.push(`- Disputes with ≥1 detected contradiction: **${evalResult.contradictions.disputesWithContradiction}** (${evalResult.contradictions.totalContradictions} total contradictions)`);
  lines.push(`- Customer-favourable cases detected by drafting: **${evalResult.customerFavorable.detected}**`);
  lines.push('');
  lines.push('## ERS distribution');
  for (const [bucket, n] of Object.entries(evalResult.ers.buckets)) {
    const pct = ((n / evalResult.total) * 100).toFixed(1);
    lines.push(`- ${bucket}: ${n} (${pct}%)`);
  }
  lines.push('');
  lines.push('## Readiness tiers (contest-ready vs needs-evidence)');
  lines.push(`- Contest-ready (ERS≥72 & approved): **${evalResult.readinessTiers.contestReady}**`);
  lines.push(`- Needs more evidence (ERS 60–79): **${evalResult.readinessTiers.needsEvidence}**`);
  lines.push(`- Blocked (ERS<60): **${evalResult.readinessTiers.blocked}**`);
  lines.push('');
  if (d.total) {
    lines.push('## Detection accuracy vs ground truth');
    lines.push(`- Contradiction recall: **${(d.contradictionRecall * 100).toFixed(1)}%** (${d.contradictionsFound}/${d.contradictionsTruth} ground-truth contradictions)`);
    lines.push(`- Customer-favourable recall: **${(d.customerFavourableRecall * 100).toFixed(1)}%** (${d.customerFavourableFound}/${d.customerFavourableTruth})`);
    lines.push(`- Sufficient-evidence precision: **${(d.sufficientEvidencePrecision * 100).toFixed(1)}%**`);
  }
  lines.push('');
  lines.push('## How to read this');
  lines.push('DisputeIQ ingests each dispute\'s evidence, classifies it (8-type taxonomy), extracts a');
  lines.push('grounded factual timeline, detects contradictions, scores evidence readiness (ERS), and');
  lines.push('drafts a source-grounded response. The numbers above characterise the system\'s behaviour');
  lines.push('over a controlled synthetic population — a reproducible proxy for "an AI risk manager');
  lines.push('processing a merchant\'s dispute queue."');
  return lines.join('\n');
}
