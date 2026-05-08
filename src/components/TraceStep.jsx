import { useState } from 'react';

const STATUS_STYLES = {
  pending: 'bg-blue-50 text-blue-700 border-blue-200',
  success: 'bg-green-50 text-green-700 border-green-200',
  retry: 'bg-amber-50 text-amber-700 border-amber-200',
  failed: 'bg-red-50 text-red-700 border-red-200',
  escalated: 'bg-purple-50 text-purple-700 border-purple-200',
};

const KIND_BADGE = {
  llm: { label: 'LLM', cls: 'bg-indigo-100 text-indigo-700' },
  tool: { label: 'TOOL', cls: 'bg-slate-100 text-slate-700' },
};

export default function TraceStep({ step, idx }) {
  const [open, setOpen] = useState(false);
  const status = step.status || 'pending';
  const kind = KIND_BADGE[step.kind] || { label: step.kind || '?', cls: 'bg-gray-100 text-gray-700' };
  const styles = STATUS_STYLES[status] || STATUS_STYLES.pending;

  return (
    <div className="border-l-2 border-gray-200 pl-4 ml-2 relative">
      <div className="absolute -left-[7px] top-2 w-3 h-3 rounded-full bg-white border-2 border-gray-300" />
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full text-left flex items-start gap-3 py-2 hover:bg-gray-50 px-2 rounded transition-colors"
      >
        <span className="text-xs font-mono text-gray-400 mt-1 w-6">{String(idx).padStart(2, '0')}</span>
        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${kind.cls}`}>{kind.label}</span>
        <span className="font-mono text-sm font-semibold text-gray-900 flex-1">{step.name}</span>
        {step.label && (
          <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded ${runtimeBadgeCls(step.label)}`}>
            {step.label}
          </span>
        )}
        {step.attempt > 1 && (
          <span className="text-xs font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded">
            try #{step.attempt}
          </span>
        )}
        {typeof step.latencyMs === 'number' && (
          <span className="text-xs font-mono text-gray-500">{step.latencyMs} ms</span>
        )}
        <span className={`text-xs font-bold px-2 py-0.5 rounded border ${styles}`}>
          {status.toUpperCase()}
        </span>
      </button>
      {step.thought && (
        <div className="text-xs italic text-gray-600 ml-12 mb-1 border-l-2 border-indigo-200 pl-2">
          “{step.thought}”
        </div>
      )}
      {open && (
        <div className="ml-12 mb-3 mt-2 space-y-2">
          {step.prompt && (
            <Block label="Prompt" body={step.prompt} />
          )}
          {step.response && (
            <Block label="Response" body={step.response} />
          )}
          {step.args && Object.keys(step.args).length > 0 && (
            <Block label="Args" body={JSON.stringify(step.args, null, 2)} />
          )}
          {step.result && (
            <Block label="Result" body={JSON.stringify(step.result, null, 2)} />
          )}
          {step.error && (
            <Block label="Error" body={step.error} tone="error" />
          )}
          {step.fallbackFrom && (
            <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
              Tried first: <code>{step.fallbackFrom}</code> — recovered via <code>{step.label || step.model}</code>.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function runtimeBadgeCls(label) {
  // Color-code by silicon: NPU green (lowest power), iGPU blue, CPU gray.
  if (label.startsWith('NPU/')) return 'bg-emerald-100 text-emerald-800 border border-emerald-200';
  if (label.startsWith('iGPU/')) return 'bg-sky-100 text-sky-800 border border-sky-200';
  if (label.startsWith('CPU/')) return 'bg-slate-100 text-slate-700 border border-slate-200';
  return 'bg-gray-100 text-gray-700 border border-gray-200';
}

function Block({ label, body, tone }) {
  const bodyCls =
    tone === 'error'
      ? 'bg-red-950 text-red-200'
      : 'bg-gray-900 text-gray-100';
  return (
    <div>
      <div className="text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1">{label}</div>
      <pre className={`${bodyCls} text-xs p-3 rounded font-mono overflow-auto max-h-64`}>{body}</pre>
    </div>
  );
}
