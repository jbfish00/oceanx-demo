// Hand-rolled tool-use loop. The LLM picks the next tool; we run it; we feed
// the result back. Includes retry/backoff and Ollama model fallback.

import policy from './policy.json';
import { TOOL_CATALOG, TOOL_IMPLS } from './tools.js';
import { buildDecisionPrompt } from './prompts.js';
import {
  startRun,
  appendStep,
  updateStep,
  finishRun,
  getSnapshot,
} from './traceStore.js';

const PRIMARY_MODEL = 'gemma4:e4b';
const FALLBACK_MODEL = 'gemma2';
const OLLAMA_URL = 'http://localhost:11434/api/generate';

// ---------- LLM client with model fallback ----------
async function callOllama(prompt, model) {
  const response = await fetch(OLLAMA_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, prompt, stream: false, format: 'json' }),
  });
  if (!response.ok) throw new Error(`Ollama HTTP ${response.status}`);
  const data = await response.json();
  let raw = data.response || '';
  raw = raw.replace(/```json/gi, '').replace(/```/g, '').trim();
  return raw;
}

function makeLlmClient({ runId, kind }) {
  // Returns an llm(prompt) fn that emits trace events on each call.
  return async (prompt) => {
    const startedAt = Date.now();
    const stepIdx = appendLlmStep(runId, kind, prompt);
    let modelUsed = PRIMARY_MODEL;
    let attempt = 1;
    try {
      const out = await callOllama(prompt, PRIMARY_MODEL);
      updateStep(runId, stepIdx, {
        status: 'success',
        latencyMs: Date.now() - startedAt,
        model: modelUsed,
        attempt,
        response: out,
      });
      return out;
    } catch {
      attempt = 2;
      modelUsed = FALLBACK_MODEL;
      try {
        const out = await callOllama(prompt, FALLBACK_MODEL);
        updateStep(runId, stepIdx, {
          status: 'success',
          latencyMs: Date.now() - startedAt,
          model: modelUsed,
          attempt,
          fallbackFrom: PRIMARY_MODEL,
          response: out,
        });
        return out;
      } catch (err2) {
        updateStep(runId, stepIdx, {
          status: 'failed',
          latencyMs: Date.now() - startedAt,
          model: modelUsed,
          attempt,
          error: String(err2.message || err2),
        });
        throw err2;
      }
    }
  };
}

function appendLlmStep(runId, kind, prompt) {
  appendStep(runId, {
    kind: 'llm',
    name: kind,
    status: 'pending',
    prompt: truncate(prompt, 4000),
  });
  return getLastIdx(runId);
}

function getLastIdx(runId) {
  const runs = getSnapshot();
  const r = runs.find((x) => x.id === runId);
  return r ? r.steps.length - 1 : 0;
}

function truncate(s, n) {
  if (!s) return '';
  return s.length > n ? s.slice(0, n) + ` …(+${s.length - n} chars)` : s;
}

// ---------- Decision step (the agent picks the next tool) ----------
async function decideNextTool(runId, state, lastError) {
  const prompt = buildDecisionPrompt({
    state: stateForPrompt(state),
    tools: TOOL_CATALOG,
    policy,
    lastError,
  });
  const llm = makeLlmClient({ runId, kind: 'decide' });
  const raw = await llm(prompt);
  return safeParseDecision(raw);
}

function stateForPrompt(state) {
  // Trim large fields and don't leak the full ocr text repeatedly.
  return {
    ocrTextPreview: state.ocrText ? state.ocrText.slice(0, 220) : null,
    invoice: state.invoice,
    history: state.history,
    risk: state.risk,
    xeroInvoiceId: state.xeroInvoice?.response?.Id,
    gocardlessPaymentId: state.gocardlessPayment?.response?.id,
    hubspotDealId: state.hubspotDeal?.response?.id,
    escalation: state.escalation ? { reason: state.escalation.reason } : null,
    pathStepsTaken: state._pathStepsTaken || [],
  };
}

function safeParseDecision(raw) {
  try {
    const cleaned = raw.replace(/```json/gi, '').replace(/```/g, '').trim();
    const a = cleaned.indexOf('{');
    const b = cleaned.lastIndexOf('}');
    if (a === -1 || b === -1) return null;
    const obj = JSON.parse(cleaned.slice(a, b + 1));
    if (typeof obj.tool !== 'string') return null;
    if (typeof obj.args !== 'object' || obj.args === null) obj.args = {};
    if (typeof obj.thought !== 'string') obj.thought = '';
    return obj;
  } catch {
    return null;
  }
}

// ---------- Tool execution with retry/backoff ----------
async function runTool(runId, decision, state, llm) {
  const impl = TOOL_IMPLS[decision.tool];
  if (!impl) {
    appendStep(runId, {
      kind: 'tool',
      name: decision.tool,
      status: 'failed',
      attempt: 1,
      error: `Unknown tool: ${decision.tool}`,
      thought: decision.thought,
    });
    throw new Error(`Unknown tool: ${decision.tool}`);
  }

  const { maxAttempts, backoffMs } = policy.routing.toolRetry;
  let lastErr = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const startedAt = Date.now();
    appendStep(runId, {
      kind: 'tool',
      name: decision.tool,
      status: attempt === 1 ? 'pending' : 'retry',
      attempt,
      thought: decision.thought,
      args: decision.args,
    });
    const stepIdx = getLastIdx(runId);
    try {
      const patch = await impl({ args: decision.args, state, llm, policy });
      updateStep(runId, stepIdx, {
        status: 'success',
        latencyMs: Date.now() - startedAt,
        result: patch,
      });
      return patch;
    } catch (err) {
      lastErr = err;
      updateStep(runId, stepIdx, {
        status: 'failed',
        latencyMs: Date.now() - startedAt,
        error: String(err.message || err),
        retryable: !!err.retryable,
      });
      if (attempt < maxAttempts && (err.retryable || err.code === 'XERO_503')) {
        await sleep(backoffMs[attempt - 1] ?? 1000);
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- Main entry: run agent for one file ----------
export async function runAgent({ filename, ocrText }) {
  const runId = startRun(filename);
  let state = { ocrText, _pathStepsTaken: [] };
  let lastError = null;

  // The LLM client used by tools (extractInvoice / scoreRisk). Distinct from
  // the decision-loop LLM so trace rows are clearly labelled.
  const toolLlm = makeLlmClient({ runId, kind: 'tool-llm' });

  try {
    for (let step = 0; step < policy.routing.stepCap; step++) {
      const decision = await decideNextTool(runId, state, lastError);
      if (!decision) {
        finishRun(runId, 'failed', { error: 'agent returned unparseable decision' });
        return { runId, status: 'failed', state };
      }

      if (decision.tool === 'done') {
        appendStep(runId, {
          kind: 'tool',
          name: 'done',
          status: 'success',
          thought: decision.thought,
          attempt: 1,
          latencyMs: 0,
        });
        break;
      }

      try {
        const patch = await runTool(runId, decision, state, toolLlm);
        state = { ...state, ...patch, _pathStepsTaken: [...state._pathStepsTaken, decision.tool] };
        lastError = null;

        if (state.escalation) {
          // Once escalated, force terminate.
          finishRun(runId, 'escalated', { escalation: state.escalation, state });
          return { runId, status: 'escalated', state };
        }
      } catch (err) {
        lastError = { tool: decision.tool, message: String(err.message || err) };
        // Hand the error back to the LLM on the next decision turn so it can
        // choose to escalate or try a different path.
        if (state._pathStepsTaken.length === 0) {
          // Hard escalate if we can't even extract.
          state.escalation = { reason: `Pipeline failed at first step: ${lastError.message}` };
          finishRun(runId, 'escalated', { escalation: state.escalation, state });
          return { runId, status: 'escalated', state };
        }
      }
    }

    if (state.hubspotDeal && state.gocardlessPayment && state.xeroInvoice) {
      finishRun(runId, 'approved', { state });
      return { runId, status: 'approved', state };
    }
    if (state.escalation) {
      finishRun(runId, 'escalated', { escalation: state.escalation, state });
      return { runId, status: 'escalated', state };
    }
    finishRun(runId, 'failed', { reason: 'step cap reached without terminal state', state });
    return { runId, status: 'failed', state };
  } catch (fatal) {
    finishRun(runId, 'failed', { error: String(fatal.message || fatal) });
    return { runId, status: 'failed', state, error: fatal };
  }
}
