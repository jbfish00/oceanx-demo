import { useEffect, useRef } from 'react';
import mermaid from 'mermaid';

const DIAGRAM = `flowchart LR
    A[Inbound Invoices<br/>Directory Watcher] --> Q[Work Queue]
    Q --> O[Agent Orchestrator]
    O <-->|tool-call loop| L[Local LLM<br/>Ollama gemma4:e4b<br/>fallback gemma2]
    O --> T1[(Company DB<br/>credit + history)]
    O --> T2[/Xero API<br/>create invoice/]
    O --> T3[/GoCardless<br/>mandate + debit/]
    O --> T4[/HubSpot<br/>deal upsert/]
    O --> R{Risk &<br/>Confidence<br/>Gate}
    R -->|risk > 70 OR<br/>conf < 0.7| H[Human Review Queue]
    R -->|clear| OP[Auto-Approved<br/>Operations Log]
    O -.events.-> TR[Trace Store /<br/>Audit Log]
    TR --> UI[Live Trace UI]
    TR --> CSV[Audit CSV Export]
`;

mermaid.initialize({ startOnLoad: false, theme: 'default', securityLevel: 'loose' });

export default function ArchitectureTab() {
  const ref = useRef(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { svg } = await mermaid.render('oceanx-arch', DIAGRAM);
        if (!cancelled && ref.current) ref.current.innerHTML = svg;
      } catch (e) {
        if (!cancelled && ref.current) {
          ref.current.innerHTML = `<pre class="text-red-600">${String(e.message || e)}</pre>`;
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-xl font-bold text-gray-900 mb-2">System Architecture</h2>
        <p className="text-sm text-gray-600 mb-6">
          Per-file agent loop with autonomous tool selection. The LLM decides which tool to call at each step;
          the orchestrator runs it, retries on transient errors, and emits trace events for observability.
        </p>
        <div ref={ref} className="overflow-auto" />
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <Card title="What's real today">
          <ul className="text-sm space-y-2 text-gray-700 list-disc pl-5">
            <li>Local Ollama tool-use loop (gemma4:e4b primary, gemma2 fallback)</li>
            <li>4 mock integrations with realistic JSON shapes (Xero, GoCardless, HubSpot, CompanyDB)</li>
            <li>Retry/backoff on transient errors (Chaos mode toggles 30% Xero failure)</li>
            <li>Externalized risk policy (<code>policy.json</code>) — hot-reloadable</li>
            <li>Append-only trace store with CSV audit export</li>
            <li>Confidence-aware routing: low confidence → human queue even at low risk</li>
          </ul>
        </Card>
        <Card title="How this scales" tone="green">
          <ul className="text-sm space-y-2 text-gray-700 list-disc pl-5">
            <li>In-memory queue → BullMQ/Redis with N orchestrator workers</li>
            <li>Trace store → append-only log to S3/Postgres for SOC2/audit compliance</li>
            <li>Hand-rolled tool loop on Ollama → drop-in swap to Anthropic tool-use; tool definitions are already JSON-schema-shaped</li>
            <li>4 mock integrations → each becomes its own MCP server; orchestrator unchanged</li>
            <li>Single agent → multi-agent (lead-gen → underwriting → ops → collections), all sharing this trace store</li>
          </ul>
        </Card>
      </div>
    </div>
  );
}

function Card({ title, children, tone }) {
  const border = tone === 'green' ? 'border-green-200' : 'border-gray-200';
  const bg = tone === 'green' ? 'bg-green-50/40' : 'bg-white';
  return (
    <div className={`rounded-xl border ${border} ${bg} p-5`}>
      <h3 className="font-bold text-gray-900 mb-3">{title}</h3>
      {children}
    </div>
  );
}
