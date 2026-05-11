import { useEffect, useRef } from 'react';
import mermaid from 'mermaid';

const DIAGRAM = `flowchart LR
    A[Inbound Invoice<br/>Directory Watcher] --> Q[Work Queue]
    Q --> O[Agent Orchestrator]
    O <-->|tool-call loop| L[Local LLM<br/>gemma4:e4b / gemma2]

    O --> AP[/Apollo<br/>lead enrichment/]
    O -.new counterparty.-> IN[/Instantly<br/>cold email/]
    O -.new counterparty.-> DR[/Dripify<br/>LinkedIn outreach/]
    O --> DB[(CompanyDB<br/>credit + history)]
    O --> RG{Risk &<br/>Confidence Gate}

    RG -->|risk > 70<br/>OR conf < 0.7| HQ[Human Review Queue]

    RG -->|clear to fund| C7[/CIN7<br/>product + PO/]
    C7 --> XR[/Xero<br/>invoice/]
    XR --> GC[/GoCardless<br/>DD mandate/]
    GC --> WS[/Wise<br/>supplier transfer/]
    WS --> HS[/HubSpot<br/>deal upsert/]
    HS --> OL[Auto-Approved<br/>Ops Log]

    O -.events.-> TR[(Trace Store /<br/>Audit Log)]
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
          Per-invoice agent loop covering the full OceanX workflow — lead enrichment through supplier payment.
          The LLM picks the next tool at each step; the orchestrator executes it, retries on transient errors,
          and emits every decision to the trace store for full observability. Dashed lines are conditional paths.
        </p>
        <div ref={ref} className="overflow-auto" />
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <Card title="What's real today">
          <ul className="text-sm space-y-2 text-gray-700 list-disc pl-5">
            <li>Local Ollama tool-use loop — gemma4:e4b primary, gemma2 fallback</li>
            <li>8 mock integrations with real-shape JSON: Apollo, Instantly, Dripify, CIN7, Xero, GoCardless, Wise, HubSpot</li>
            <li>Full end-to-end workflow: lead enrichment → underwriting → inventory → invoice → collection → supplier payment → CRM</li>
            <li>Conditional outreach: Instantly + Dripify only fire for new counterparties (no prior history)</li>
            <li>Retry/backoff on transient errors — Chaos mode injects 30% Xero failure rate</li>
            <li>Externalized risk policy (<code>policy.json</code>) — change routing rules without touching agent code</li>
            <li>Append-only trace store with one-click CSV audit export</li>
            <li>Regression eval suite: 3-pass scoring across 7 invoices, verdict + risk-band + flag-recall metrics</li>
          </ul>
        </Card>
        <Card title="How this scales" tone="green">
          <ul className="text-sm space-y-2 text-gray-700 list-disc pl-5">
            <li>In-memory queue → BullMQ/Redis with N orchestrator workers; agent code unchanged</li>
            <li>Trace store → append-only log to S3/Postgres for SOC2/audit compliance</li>
            <li>Ollama → Anthropic tool-use in one file; tool definitions are already JSON-schema-shaped for drop-in MCP compatibility</li>
            <li>8 mocks → each becomes its own MCP server (CIN7, Xero, GoCardless, Wise, HubSpot, Apollo, Instantly, Dripify)</li>
            <li>Single agent → multi-agent mesh: lead-gen agent → underwriting agent → ops agent → collections agent, all emitting into the same trace store</li>
            <li>HITL overrides captured to localStorage today → inject last N overrides as few-shot examples for a live learning loop without retraining</li>
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
