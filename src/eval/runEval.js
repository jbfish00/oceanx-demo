// Regression eval harness. Runs each ground-truth case through the same
// agent path the live demo uses, scores against expected verdicts, and
// writes a markdown report. Run multiple passes (--n 3) to account for
// LLM non-determinism — best-of-N + worst-of-N + median are reported.
//
// Usage:
//   npm run eval                # one pass
//   npm run eval -- --n 3       # three passes
//   npm run eval -- --n 3 --dir DEMO_IMAGES

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { runAgent } from '../agent/orchestrator.js';
import { getSnapshot } from '../agent/traceStore.js';
import { loadOcrFor } from './loadOcr.js';

const args = parseArgs(process.argv.slice(2));
const N = Math.max(1, Number(args.n) || 1);
const DIR = args.dir || 'DEMO_IMAGES';

const expectedPath = new URL('./expected.json', import.meta.url);
const cases = JSON.parse(readFileSync(expectedPath, 'utf-8')).cases;

console.log(`\nOceanX agent regression suite — ${cases.length} cases × ${N} pass${N > 1 ? 'es' : ''}\n`);

// passes[i] = array of per-case results for pass i
const passes = [];
for (let pass = 1; pass <= N; pass++) {
  const passResults = [];
  console.log(`── Pass ${pass}/${N} ──`);
  for (const c of cases) {
    const ocrText = (await loadOcrSafely(c.filename)).ocrText;
    const startedAt = Date.now();
    let result;
    try {
      result = await runAgent({ filename: c.filename, ocrText });
    } catch (err) {
      result = { status: 'failed', error: String(err.message || err), state: {} };
    }
    const totalMs = Date.now() - startedAt;
    const scored = scoreCase(c, result, totalMs);
    passResults.push(scored);
    console.log(formatCaseLine(scored));
  }
  passes.push(passResults);
  console.log();
}

const report = buildReport(cases, passes);
writeFileSync(join(process.cwd(), 'eval-report.md'), report);
console.log(report);
console.log(`\nReport written to eval-report.md`);

// ---------------- helpers ----------------

async function loadOcrSafely(filename) {
  try {
    return loadOcrFor(filename, DIR);
  } catch (err) {
    return { ocrText: '', fileOnDisk: false, error: String(err.message) };
  }
}

function scoreCase(c, result, totalMs) {
  const actualStatus = result.status;
  const actualBand = result.state?.risk?.riskBand || null;
  const reasoningText = (result.state?.risk?.reasoning || '').toUpperCase();
  const detectedFlags = (result.state?.history?.creditFlags || []).map((f) => String(f).toUpperCase());

  const verdictOk = actualStatus === c.expectedStatus;
  const bandOk = actualBand && actualBand.toUpperCase() === c.expectedRiskBand.toUpperCase();
  const bandAdjacent = !bandOk && actualBand && areAdjacentBands(actualBand, c.expectedRiskBand);

  // Flag recall: a flag counts as detected if it appears in creditFlags OR
  // its keyword appears in the reasoning text.
  const flagsHit = c.mustDetectFlags.filter((flag) => {
    const upper = flag.toUpperCase();
    if (detectedFlags.includes(upper)) return true;
    const keyword = upper.replace(/_/g, ' ');
    return reasoningText.includes(keyword) || reasoningText.includes(upper);
  });
  const flagRecall = c.mustDetectFlags.length === 0 ? 1 : flagsHit.length / c.mustDetectFlags.length;

  // LLM latency aggregate (sum of llm-kind step latencies in this run's trace)
  const llmMs = sumLlmLatency(result.runId);

  return {
    case: c,
    actualStatus,
    actualBand,
    verdictOk,
    bandOk,
    bandAdjacent,
    flagsHit,
    flagsMissed: c.mustDetectFlags.filter((f) => !flagsHit.includes(f)),
    flagRecall,
    llmMs,
    totalMs,
    error: result.error || null,
  };
}

function sumLlmLatency(runId) {
  if (!runId) return 0;
  const run = getSnapshot().find((r) => r.id === runId);
  if (!run) return 0;
  return run.steps
    .filter((s) => s.kind === 'llm' && typeof s.latencyMs === 'number')
    .reduce((acc, s) => acc + s.latencyMs, 0);
}

const BAND_ORDER = ['STANDARD', 'WATCH', 'ELEVATED', 'CRITICAL'];
function areAdjacentBands(a, b) {
  const ia = BAND_ORDER.indexOf(String(a).toUpperCase());
  const ib = BAND_ORDER.indexOf(String(b).toUpperCase());
  return ia !== -1 && ib !== -1 && Math.abs(ia - ib) === 1;
}

function formatCaseLine(s) {
  const verdict = s.verdictOk ? '✓' : '✗';
  const band = s.bandOk ? '✓' : s.bandAdjacent ? '~' : '✗';
  const flags = `${s.flagsHit.length}/${s.case.mustDetectFlags.length}`;
  return `  ${verdict} ${s.case.filename.padEnd(26)} status=${s.actualStatus.padEnd(10)} band=${(s.actualBand || '?').padEnd(10)}${band} flags=${flags} run=${s.totalMs}ms llm=${s.llmMs}ms`;
}

function buildReport(cases, passes) {
  // Per-case best/worst/median across passes.
  const lines = [];
  lines.push(`# OceanX Agent — Regression Report`);
  lines.push('');
  lines.push(`- Cases: **${cases.length}**`);
  lines.push(`- Passes: **${passes.length}**`);
  lines.push(`- Generated: ${new Date().toISOString()}`);
  lines.push('');

  // Aggregate verdict accuracy per pass
  const verdictAccPerPass = passes.map((p) => p.filter((s) => s.verdictOk).length / p.length);
  const bandAccPerPass = passes.map((p) => p.filter((s) => s.bandOk).length / p.length);
  const flagRecallPerPass = passes.map((p) => mean(p.map((s) => s.flagRecall)));
  const totalMsPerPass = passes.map((p) => mean(p.map((s) => s.totalMs)));
  const llmMsPerPass = passes.map((p) => mean(p.map((s) => s.llmMs)));

  lines.push(`## Aggregate (across ${passes.length} pass${passes.length > 1 ? 'es' : ''})`);
  lines.push('');
  lines.push('| Metric | Best | Worst | Median |');
  lines.push('|---|---|---|---|');
  lines.push(`| Verdict accuracy | ${pct(Math.max(...verdictAccPerPass))} | ${pct(Math.min(...verdictAccPerPass))} | ${pct(median(verdictAccPerPass))} |`);
  lines.push(`| Risk-band exact agreement | ${pct(Math.max(...bandAccPerPass))} | ${pct(Math.min(...bandAccPerPass))} | ${pct(median(bandAccPerPass))} |`);
  lines.push(`| Flag-detection recall | ${pct(Math.max(...flagRecallPerPass))} | ${pct(Math.min(...flagRecallPerPass))} | ${pct(median(flagRecallPerPass))} |`);
  lines.push(`| Median per-case run | ${Math.round(Math.min(...totalMsPerPass))} ms | ${Math.round(Math.max(...totalMsPerPass))} ms | ${Math.round(median(totalMsPerPass))} ms |`);
  lines.push(`| Median per-case LLM | ${Math.round(Math.min(...llmMsPerPass))} ms | ${Math.round(Math.max(...llmMsPerPass))} ms | ${Math.round(median(llmMsPerPass))} ms |`);
  lines.push('');

  // Per-case detail (last pass)
  const last = passes[passes.length - 1];
  lines.push(`## Per-case detail (final pass)`);
  lines.push('');
  lines.push('| File | Expected | Actual | Band | Flags Hit | Run ms |');
  lines.push('|---|---|---|---|---|---|');
  for (const s of last) {
    const verdict = s.verdictOk ? `${s.actualStatus} ✓` : `${s.actualStatus} ✗`;
    const band = s.bandOk ? `${s.actualBand} ✓` : s.bandAdjacent ? `${s.actualBand} ~` : `${s.actualBand || '?'} ✗`;
    const flags = `${s.flagsHit.length}/${s.case.mustDetectFlags.length}`;
    lines.push(`| ${s.case.filename} | ${s.case.expectedStatus} | ${verdict} | ${band} | ${flags} | ${s.totalMs} |`);
  }
  lines.push('');

  // Failures across any pass
  const failures = [];
  passes.forEach((p, i) => {
    p.forEach((s) => {
      if (!s.verdictOk) failures.push({ pass: i + 1, ...s });
    });
  });
  if (failures.length > 0) {
    lines.push(`## ⚠ Verdict failures`);
    lines.push('');
    for (const f of failures) {
      lines.push(`- Pass ${f.pass}: **${f.case.filename}** — expected \`${f.case.expectedStatus}\`, got \`${f.actualStatus}\`${f.error ? ` (error: ${f.error})` : ''}`);
    }
    lines.push('');
  }

  // Flag misses
  const flagMisses = [];
  passes.forEach((p, i) => {
    p.forEach((s) => {
      if (s.flagsMissed.length > 0) flagMisses.push({ pass: i + 1, ...s });
    });
  });
  if (flagMisses.length > 0) {
    lines.push(`## ⚠ Flag-detection misses`);
    lines.push('');
    for (const f of flagMisses) {
      lines.push(`- Pass ${f.pass}: **${f.case.filename}** missed flags: \`${f.flagsMissed.join('`, `')}\``);
    }
    lines.push('');
  }

  return lines.join('\n');
}

function pct(x) {
  return `${Math.round(x * 1000) / 10}%`;
}
function mean(xs) {
  if (xs.length === 0) return 0;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}
function median(xs) {
  if (xs.length === 0) return 0;
  const sorted = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) {
        out[key] = next;
        i++;
      } else {
        out[key] = true;
      }
    }
  }
  return out;
}
