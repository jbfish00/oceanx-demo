import { useState, useSyncExternalStore } from 'react';
import './App.css';
import { runAgent } from './agent/orchestrator.js';
import { resetRuns, subscribe, getSnapshot } from './agent/traceStore.js';
import { setChaosMode, getChaosMode } from './mocks/integrations.js';
import TraceTab from './components/TraceTab.jsx';
import ArchitectureTab from './components/ArchitectureTab.jsx';
import PayloadModal from './components/PayloadModal.jsx';
import { resolveOcrByFilename } from './lib/mockOcrMap.js';
import { extractPdfText } from './lib/pdfText.js';

const FEEDBACK_KEY = 'oceanx_hitl_overrides_v1';

async function extractTextFromFile(file) {
  const ext = file.name.split('.').pop().toLowerCase();

  // Native text reader for plain-text formats — unchanged from v1.
  if (['csv', 'json', 'md', 'html', 'txt', 'tex'].includes(ext)) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = (e) => resolve(e.target.result);
      r.onerror = (e) => reject(e);
      r.readAsText(file);
    });
  }

  // Real PDF parsing first; fall back to the canonical mock map only if pdf.js
  // can't extract text (image-only scans) or throws.
  if (ext === 'pdf') {
    try {
      const text = await extractPdfText(file);
      if (text && text.length > 20) return text;
    } catch {
      // Fall through to mock map.
    }
    return resolveOcrByFilename(file.name) ?? 'Unknown Document Data';
  }

  // Image-only inputs — we don't run real OCR, fall straight to the mock map.
  return resolveOcrByFilename(file.name) ?? 'Unknown Document Data';
}

export default function App() {
  const [tab, setTab] = useState('pipeline'); // pipeline | trace | architecture
  const [batchStatus, setBatchStatus] = useState('idle');
  const [processedCount, setProcessedCount] = useState(0);
  const [totalFiles, setTotalFiles] = useState(0);
  const [chaos, setChaos] = useState(getChaosMode());
  const [modal, setModal] = useState(null); // { title, payload }
  const runs = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  const approvedRuns = runs.filter((r) => r.finalStatus === 'approved');
  const escalatedRuns = runs.filter((r) => r.finalStatus === 'escalated' || r.finalStatus === 'failed');

  const toggleChaos = () => {
    const next = !chaos;
    setChaos(next);
    setChaosMode(next);
  };

  const handleDirectoryUpload = async (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;
    resetRuns();
    setBatchStatus('processing');
    setTotalFiles(files.length);
    setProcessedCount(0);

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      setProcessedCount(i + 1);
      const ocrText = await extractTextFromFile(file);
      await runAgent({ filename: file.name, ocrText });
    }
    setBatchStatus('complete');
  };

  const recordOverride = (run, action) => {
    try {
      const prev = JSON.parse(localStorage.getItem(FEEDBACK_KEY) || '[]');
      prev.push({
        at: new Date().toISOString(),
        filename: run.filename,
        agentDecision: 'escalated',
        humanDecision: action, // 'approve' | 'reject'
        invoice: run.summary?.state?.invoice,
        risk: run.summary?.state?.risk,
      });
      localStorage.setItem(FEEDBACK_KEY, JSON.stringify(prev.slice(-50)));
    } catch {
      /* localStorage may be disabled */
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 font-sans text-gray-800 pb-20">
      <div className="bg-white border-b border-gray-200 px-8 py-4 mb-8">
        <div className="max-w-7xl mx-auto flex justify-between items-center flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-gray-900">OceanX AI OS</h1>
            <p className="text-sm text-gray-500">Autonomous Operations Platform — multi-step agent</p>
          </div>
          <div className="flex bg-gray-100 p-1 rounded-lg">
            <TabButton active={tab === 'pipeline'} onClick={() => setTab('pipeline')}>Pipeline</TabButton>
            <TabButton active={tab === 'trace'} onClick={() => setTab('trace')}>Live Trace</TabButton>
            <TabButton active={tab === 'architecture'} onClick={() => setTab('architecture')}>Architecture</TabButton>
          </div>
          <button
            onClick={toggleChaos}
            className={`text-xs font-bold px-3 py-2 rounded-lg border transition-colors ${
              chaos
                ? 'bg-amber-100 text-amber-800 border-amber-300 hover:bg-amber-200'
                : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
            }`}
            title="Inject 30% failure rate on Xero to demonstrate retry/backoff"
          >
            {chaos ? 'CHAOS MODE: ON' : 'Chaos mode: off'}
          </button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-8 space-y-6">
        {tab === 'pipeline' && (
          <PipelineView
            batchStatus={batchStatus}
            setBatchStatus={setBatchStatus}
            processedCount={processedCount}
            totalFiles={totalFiles}
            approvedRuns={approvedRuns}
            escalatedRuns={escalatedRuns}
            onUpload={handleDirectoryUpload}
            onViewPayload={(title, payload) => setModal({ title, payload })}
            onOverride={recordOverride}
          />
        )}
        {tab === 'trace' && <TraceTab />}
        {tab === 'architecture' && <ArchitectureTab />}
      </div>

      <PayloadModal title={modal?.title} payload={modal?.payload} onClose={() => setModal(null)} />
    </div>
  );
}

function TabButton({ active, children, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
        active ? 'bg-white shadow text-blue-600' : 'text-gray-600 hover:text-gray-900'
      }`}
    >
      {children}
    </button>
  );
}

function PipelineView({
  batchStatus,
  setBatchStatus,
  processedCount,
  totalFiles,
  approvedRuns,
  escalatedRuns,
  onUpload,
  onViewPayload,
  onOverride,
}) {
  return (
    <>
      <div className="bg-white p-8 rounded-xl shadow-sm border border-gray-200 flex justify-between items-center flex-wrap gap-4">
        <div>
          <h2 className="text-xl font-bold">Directory Watcher</h2>
          <p className="text-sm text-gray-500 mt-1">
            Select your local <code className="bg-gray-100 px-1 rounded">inbound_invoices</code> folder. Each file
            triggers a full pipeline: Apollo enrichment → CompanyDB lookup → risk scoring → CIN7 inventory
            → Xero invoice → GoCardless direct debit → Wise supplier transfer → HubSpot CRM.
            New counterparties also trigger Instantly + Dripify outreach.
          </p>
        </div>

        {batchStatus === 'idle' && (
          <div className="relative">
            <input
              type="file"
              webkitdirectory="true"
              directory="true"
              multiple
              onChange={onUpload}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            />
            <button className="bg-black hover:bg-gray-800 text-white px-6 py-3 rounded-lg font-medium transition-colors flex items-center gap-2">
              <span>📂</span> Upload Directory & Run Agents
            </button>
          </div>
        )}
        {batchStatus === 'processing' && (
          <div className="flex items-center gap-4 bg-blue-50 text-blue-700 px-6 py-3 rounded-lg border border-blue-200">
            <div className="animate-spin h-5 w-5 border-2 border-blue-700 border-t-transparent rounded-full"></div>
            <span className="font-medium">
              Orchestrating File {processedCount} of {totalFiles}…
            </span>
          </div>
        )}
        {batchStatus === 'complete' && (
          <button
            onClick={() => setBatchStatus('idle')}
            className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-6 py-3 rounded-lg font-medium transition-colors"
          >
            Reset Pipeline
          </button>
        )}
      </div>

      {batchStatus !== 'idle' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mt-8">
          <ReviewQueue runs={escalatedRuns} batchStatus={batchStatus} onViewPayload={onViewPayload} onOverride={onOverride} />
          <ApprovedQueue runs={approvedRuns} batchStatus={batchStatus} onViewPayload={onViewPayload} />
        </div>
      )}
    </>
  );
}

function ReviewQueue({ runs, batchStatus, onViewPayload, onOverride }) {
  return (
    <div className="bg-white rounded-xl shadow-lg border border-red-200 overflow-hidden">
      <div className="bg-red-50 p-5 border-b border-red-200 flex justify-between items-center">
        <h3 className="font-bold text-red-900 flex items-center gap-2 text-lg">
          <span>⚠️</span> Human Review Required
        </h3>
        <span className="bg-red-200 text-red-800 text-sm font-bold px-3 py-1 rounded-full">{runs.length}</span>
      </div>
      <div className="divide-y divide-gray-100">
        {runs.length === 0 && batchStatus === 'complete' ? (
          <div className="p-10 text-center text-gray-500">No high-risk items found.</div>
        ) : (
          runs.map((run) => {
            const inv = run.summary?.state?.invoice;
            const risk = run.summary?.state?.risk;
            const reason = run.summary?.escalation?.reason || risk?.reasoning || 'Escalated by policy';
            return (
              <div key={run.id} className="p-6 hover:bg-gray-50 transition-colors">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <span className="font-bold text-gray-900 block">{inv?.companyName || 'Unknown'}</span>
                    <span className="text-xs font-mono text-gray-500">{run.filename}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-red-600 font-bold text-sm bg-red-50 px-2 py-1 rounded border border-red-100 block">
                      Risk: {risk?.riskScore ?? 'ERR'}/100
                    </span>
                    {typeof risk?.confidence === 'number' && (
                      <span className="text-xs text-gray-500 mt-1 inline-block">
                        confidence {Math.round(risk.confidence * 100)}%
                      </span>
                    )}
                  </div>
                </div>
                <div className="text-sm text-gray-600 mb-4 border-l-4 border-red-400 pl-3 py-1 bg-red-50/30">
                  <span className="font-semibold text-gray-800 text-xs uppercase tracking-wider block mb-1">
                    AI Underwriting Note
                  </span>
                  "{reason}"
                </div>
                <div className="flex gap-2 flex-wrap mb-3">
                  {run.summary?.state?.apolloEnrichment?.response && (
                    <button
                      onClick={() =>
                        onViewPayload(`Apollo — ${inv?.companyName}`, run.summary?.state?.apolloEnrichment?.response)
                      }
                      className="text-xs bg-gray-100 text-gray-700 hover:bg-gray-200 px-3 py-1.5 rounded font-medium transition-colors"
                    >
                      View Apollo
                    </button>
                  )}
                  {run.summary?.state?.instantlyCampaign?.response && (
                    <button
                      onClick={() =>
                        onViewPayload(`Instantly — ${inv?.companyName}`, run.summary?.state?.instantlyCampaign?.response)
                      }
                      className="text-xs bg-gray-100 text-gray-700 hover:bg-gray-200 px-3 py-1.5 rounded font-medium transition-colors"
                    >
                      View Instantly
                    </button>
                  )}
                  {run.summary?.state?.dripifySequence?.response && (
                    <button
                      onClick={() =>
                        onViewPayload(`Dripify — ${inv?.companyName}`, run.summary?.state?.dripifySequence?.response)
                      }
                      className="text-xs bg-gray-100 text-gray-700 hover:bg-gray-200 px-3 py-1.5 rounded font-medium transition-colors"
                    >
                      View Dripify
                    </button>
                  )}
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={() =>
                      onViewPayload(`Escalation snapshot — ${run.filename}`, {
                        invoice: inv,
                        history: run.summary?.state?.history,
                        risk,
                      })
                    }
                    className="flex-1 bg-white border border-gray-300 text-sm py-2 rounded-lg hover:bg-gray-50 font-medium transition-colors"
                  >
                    View Snapshot
                  </button>
                  <button
                    onClick={() => onOverride(run, 'approve')}
                    className="flex-1 bg-red-600 text-white text-sm py-2 rounded-lg hover:bg-red-700 font-medium transition-colors shadow-sm"
                  >
                    Manually Approve
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function ApprovedQueue({ runs, batchStatus, onViewPayload }) {
  return (
    <div className="bg-white rounded-xl shadow-lg border border-green-200 overflow-hidden">
      <div className="bg-green-50 p-5 border-b border-green-200 flex justify-between items-center">
        <h3 className="font-bold text-green-900 flex items-center gap-2 text-lg">
          <span>✅</span> Auto-Approved (Operations)
        </h3>
        <span className="bg-green-200 text-green-800 text-sm font-bold px-3 py-1 rounded-full">{runs.length}</span>
      </div>
      <div className="divide-y divide-gray-100">
        {runs.length === 0 && batchStatus === 'complete' ? (
          <div className="p-10 text-center text-gray-500">No approved items.</div>
        ) : (
          runs.map((run) => {
            const inv = run.summary?.state?.invoice;
            const xero = run.summary?.state?.xeroInvoice?.response;
            const gc = run.summary?.state?.gocardlessPayment?.response;
            const hs = run.summary?.state?.hubspotDeal?.response;
            const ap = run.summary?.state?.apolloEnrichment?.response;
            const cin7p = run.summary?.state?.cin7Product?.response;
            const cin7po = run.summary?.state?.cin7PurchaseOrder?.response;
            const wt = run.summary?.state?.wiseTransfer?.response;
            return (
              <div key={run.id} className="p-6 hover:bg-gray-50 transition-colors">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="font-bold text-gray-900">{inv?.companyName || 'Unknown'}</div>
                    <div className="text-sm text-gray-600 mt-1">
                      Amount: {inv?.invoiceAmount} {inv?.currency || 'USD'}
                    </div>
                    <div className="text-xs font-mono text-gray-400 mt-1">{run.filename}</div>
                  </div>
                  <div className="text-right text-xs">
                    {ap && <Tag color="purple">Apollo · enriched</Tag>}
                    {cin7p && <Tag color="teal">CIN7 · {cin7p.SKU}</Tag>}
                    {xero && <Tag color="green">Xero · {xero.InvoiceNumber}</Tag>}
                    {gc && <Tag color="blue">GoCardless · {gc.charge_date}</Tag>}
                    {wt && <Tag color="indigo">Wise · {wt.transfer_id}</Tag>}
                    {hs && <Tag color="orange">HubSpot · {hs.id}</Tag>}
                  </div>
                </div>
                <div className="flex gap-2 flex-wrap">
                  {ap && (
                    <button
                      onClick={() => onViewPayload(`Apollo — ${inv?.companyName}`, ap)}
                      className="text-xs bg-gray-100 text-gray-700 hover:bg-gray-200 px-3 py-1.5 rounded font-medium transition-colors"
                    >
                      View Apollo
                    </button>
                  )}
                  {cin7p && (
                    <button
                      onClick={() =>
                        onViewPayload(`CIN7 Product — ${inv?.companyName}`, {
                          product: cin7p,
                          purchaseOrder: cin7po,
                        })
                      }
                      className="text-xs bg-gray-100 text-gray-700 hover:bg-gray-200 px-3 py-1.5 rounded font-medium transition-colors"
                    >
                      View CIN7
                    </button>
                  )}
                  <button
                    onClick={() =>
                      onViewPayload(`Xero — ${inv?.companyName}`, {
                        request: run.summary?.state?.xeroInvoice?.request,
                        response: xero,
                      })
                    }
                    className="text-xs bg-gray-100 text-gray-700 hover:bg-gray-200 px-3 py-1.5 rounded font-medium transition-colors"
                  >
                    View Xero payload
                  </button>
                  <button
                    onClick={() =>
                      onViewPayload(`GoCardless — ${inv?.companyName}`, {
                        mandate: run.summary?.state?.gocardlessMandate?.response,
                        payment: gc,
                      })
                    }
                    className="text-xs bg-gray-100 text-gray-700 hover:bg-gray-200 px-3 py-1.5 rounded font-medium transition-colors"
                  >
                    View GoCardless
                  </button>
                  {wt && (
                    <button
                      onClick={() =>
                        onViewPayload(`Wise Transfer — ${inv?.companyName}`, {
                          request: run.summary?.state?.wiseTransfer?.request,
                          response: wt,
                        })
                      }
                      className="text-xs bg-gray-100 text-gray-700 hover:bg-gray-200 px-3 py-1.5 rounded font-medium transition-colors"
                    >
                      View Wise
                    </button>
                  )}
                  <button
                    onClick={() =>
                      onViewPayload(`HubSpot — ${inv?.companyName}`, {
                        request: run.summary?.state?.hubspotDeal?.request,
                        response: hs,
                      })
                    }
                    className="text-xs bg-gray-100 text-gray-700 hover:bg-gray-200 px-3 py-1.5 rounded font-medium transition-colors"
                  >
                    View HubSpot
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function Tag({ color, children }) {
  const cls = {
    green: 'bg-green-50 text-green-700 border-green-200',
    blue: 'bg-blue-50 text-blue-700 border-blue-200',
    orange: 'bg-orange-50 text-orange-700 border-orange-200',
    purple: 'bg-purple-50 text-purple-700 border-purple-200',
    teal: 'bg-teal-50 text-teal-700 border-teal-200',
    indigo: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  }[color] || 'bg-gray-50 text-gray-700 border-gray-200';
  return (
    <div className={`inline-block ${cls} border px-2 py-0.5 rounded mb-1 ml-1 font-mono`}>
      {children}
    </div>
  );
}
