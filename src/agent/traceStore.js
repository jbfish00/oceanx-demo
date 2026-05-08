// Append-only trace store. Each agent run is a "run" with ordered "steps".
// Subscribers re-render whenever an event is appended. Compatible with
// useSyncExternalStore for React 18+.

let runs = [];
const listeners = new Set();

function emit() {
  for (const l of listeners) l();
}

export function subscribe(cb) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function getSnapshot() {
  return runs;
}

export function startRun(filename) {
  const run = {
    id: `run_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    filename,
    startedAt: Date.now(),
    endedAt: null,
    finalStatus: 'running', // running | approved | escalated | failed
    steps: [],
    summary: null,
  };
  runs = [...runs, run];
  emit();
  return run.id;
}

export function appendStep(runId, step) {
  runs = runs.map((r) =>
    r.id === runId ? { ...r, steps: [...r.steps, { ...step, t: Date.now() }] } : r
  );
  emit();
}

export function updateStep(runId, stepIdx, patch) {
  runs = runs.map((r) => {
    if (r.id !== runId) return r;
    const steps = r.steps.map((s, i) => (i === stepIdx ? { ...s, ...patch } : s));
    return { ...r, steps };
  });
  emit();
}

export function finishRun(runId, finalStatus, summary) {
  runs = runs.map((r) =>
    r.id === runId
      ? { ...r, endedAt: Date.now(), finalStatus, summary }
      : r
  );
  emit();
}

export function resetRuns() {
  runs = [];
  emit();
}

// ---------- Aggregates for the header strip ----------
export function getAggregates() {
  let toolCalls = 0;
  let llmMs = 0;
  let toolMs = 0;
  let retries = 0;
  let escalated = 0;
  let approved = 0;
  for (const r of runs) {
    for (const s of r.steps) {
      if (s.kind === 'tool') toolCalls += 1;
      if (s.kind === 'llm') llmMs += s.latencyMs || 0;
      if (s.kind === 'tool') toolMs += s.latencyMs || 0;
      if (s.attempt && s.attempt > 1) retries += 1;
    }
    if (r.finalStatus === 'escalated') escalated += 1;
    if (r.finalStatus === 'approved') approved += 1;
  }
  return {
    runs: runs.length,
    toolCalls,
    llmMs,
    toolMs,
    retries,
    escalated,
    approved,
  };
}

// ---------- CSV audit export ----------
export function exportAuditCsv() {
  const headers = ['runId', 'filename', 'stepIdx', 'kind', 'name', 'status', 'attempt', 'latencyMs', 'thought', 'detail'];
  const rows = [headers.join(',')];
  for (const r of runs) {
    r.steps.forEach((s, i) => {
      const row = [
        r.id,
        csv(r.filename),
        i,
        s.kind || '',
        csv(s.name || ''),
        s.status || '',
        s.attempt || 1,
        s.latencyMs || 0,
        csv(s.thought || ''),
        csv(JSON.stringify(s.detail || s.result || s.error || '')),
      ];
      rows.push(row.join(','));
    });
  }
  return rows.join('\n');
}

function csv(v) {
  const s = String(v ?? '');
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}
