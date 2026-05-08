import { useSyncExternalStore } from 'react';
import { subscribe, getSnapshot, getAggregates, exportAuditCsv } from '../agent/traceStore.js';
import TraceStep from './TraceStep.jsx';

export default function TraceTab() {
  const runs = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const agg = getAggregates();

  const downloadCsv = () => {
    const csv = exportAuditCsv();
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `oceanx-audit-${Date.now()}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        <Stat label="Runs" value={agg.runs} />
        <Stat label="Approved" value={agg.approved} tone="green" />
        <Stat label="Escalated" value={agg.escalated} tone="red" />
        <Stat label="Tool calls" value={agg.toolCalls} />
        <Stat label="LLM ms" value={agg.llmMs.toLocaleString()} />
        <Stat label="Retries" value={agg.retries} tone={agg.retries > 0 ? 'amber' : undefined} />
      </div>

      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold text-gray-900">Live Agent Trace</h2>
        <button
          onClick={downloadCsv}
          disabled={runs.length === 0}
          className="text-sm bg-gray-100 hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed text-gray-700 px-4 py-2 rounded-lg font-medium transition-colors"
        >
          Download audit.csv
        </button>
      </div>

      {runs.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-500">
          No agent runs yet. Upload an inbound directory on the Pipeline tab to start.
        </div>
      ) : (
        <div className="space-y-4">
          {runs
            .slice()
            .reverse()
            .map((run) => (
              <RunCard key={run.id} run={run} />
            ))}
        </div>
      )}
    </div>
  );
}

function RunCard({ run }) {
  const dur = run.endedAt ? `${run.endedAt - run.startedAt} ms` : 'running…';
  const statusCls = {
    running: 'bg-blue-50 text-blue-700 border-blue-200',
    approved: 'bg-green-50 text-green-700 border-green-200',
    escalated: 'bg-red-50 text-red-700 border-red-200',
    failed: 'bg-gray-100 text-gray-700 border-gray-300',
  }[run.finalStatus] || 'bg-gray-100 text-gray-700';

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/60">
        <div>
          <div className="font-mono text-sm font-semibold text-gray-900">{run.filename}</div>
          <div className="text-xs text-gray-500 mt-0.5">
            {run.steps.length} steps · {dur} · run {run.id.slice(-6)}
          </div>
        </div>
        <span className={`text-xs font-bold px-3 py-1 rounded-full border ${statusCls}`}>
          {run.finalStatus.toUpperCase()}
        </span>
      </div>
      <div className="p-4 space-y-1">
        {run.steps.map((s, i) => (
          <TraceStep key={i} step={s} idx={i} />
        ))}
      </div>
    </div>
  );
}

function Stat({ label, value, tone }) {
  const toneCls = {
    green: 'text-green-700',
    red: 'text-red-700',
    amber: 'text-amber-700',
  }[tone] || 'text-gray-900';
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-3">
      <div className="text-[10px] font-bold uppercase tracking-wider text-gray-500">{label}</div>
      <div className={`text-2xl font-bold ${toneCls} mt-1`}>{value}</div>
    </div>
  );
}
