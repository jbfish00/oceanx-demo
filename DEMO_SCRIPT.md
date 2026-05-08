# OceanX Demo Script — 5 minutes

Target: hit all 5 rubric criteria (clarity, practical usefulness, automation depth, tool usage, scalability) in under 5 minutes, with one chaos-mode demo to show error handling.

---

## 0. Pre-flight (do NOT screen-share yet)

- [ ] `ollama serve` running, `ollama list` shows both `gemma4:e4b` and `gemma2`
- [ ] `npm run dev` running, dev URL open in a clean browser window
- [ ] `inbound_invoices/` folder ready with all 7 sample files
- [ ] Chaos mode is OFF
- [ ] Pipeline tab is selected

---

## 1. Frame the problem (30 s)

> "OceanX's thesis is that humans should focus on relationships and capital decisions; agents should run everything else. Today's invoice intake is the bottleneck — somebody manually OCRs each PDF, looks up the counterparty, decides whether to fund, then hand-keys it into Xero, GoCardless, and HubSpot. I built a multi-step agent that owns that whole chain. Humans only see what the agent escalates."

## 2. Run the happy path (90 s)

1. Click **Upload Directory & Run Agents** → pick `inbound_invoices/`
2. While the spinner runs, narrate:
   > "Each file is going through an LLM-driven tool loop. The agent decides at each step which tool to call next — extract, lookup history, score risk, then either escalate or push through Xero, GoCardless, and HubSpot."
3. When complete, point at the two queues:
   - **3 auto-approved** (Oceanic, Standard, Horizon) — show the green Xero/GoCardless/HubSpot tags
   - **4 escalated** (GlobalTech, Valkin, Nexus, Meridian) — note that confidence and risk both factor into routing
4. Click **View Xero payload** on Horizon → JSON modal opens with real-shape Xero `POST /invoices` body
5. Click **View GoCardless** on Horizon → mandate + scheduled payment

## 3. Switch to Live Trace (60 s)

1. Click the **Live Trace** tab
2. Point at the header strip: runs, tool calls, total LLM ms, retries, escalated count
3. Open the Meridian (Chapter 11) run → expand a step or two:
   > "You can see the agent's thought, the prompt sent, the raw JSON response, and the latency — every decision is auditable."
4. Click **Download audit.csv** → show the file in the OS download bar
   > "One row per agent step — drop straight into Splunk, Datadog, or compliance archive."

## 4. Demonstrate resilience — Chaos mode (45 s)

1. Hit **Reset Pipeline**, then toggle **Chaos mode: ON** (button turns amber)
2. Re-upload the same directory, watch one of the previously-clean invoices
3. Switch to **Live Trace** → look for an amber `try #2` or `try #3` row on a `generateXeroInvoice` step
   > "Xero is flapping at a 30% failure rate. The agent retries with exponential backoff and recovers. If it fails three times the work item escalates instead of leaving a half-written record."

## 5. Architecture + scaling story (45 s)

1. Click the **Architecture** tab
2. Walk the Mermaid diagram briefly
3. Hit the "How this scales" panel:
   > "Today this is one React process. To scale, swap the in-memory queue for BullMQ/Redis and run N orchestrator workers — the agent code is unchanged. The tool definitions are already JSON-schema-shaped, so swapping Ollama for Anthropic tool-use is a one-file change. Each mock becomes its own MCP server. And this same trace store is what an underwriting agent, a lead-gen agent, and a collections agent would all emit into — that's how you get to a multi-agent system."

## 6. Q&A

Anticipated questions + crisp answers:

**Q: Why a local LLM and not Claude / GPT?**
> "Trade finance data is sensitive — running on-prem gives OceanX privacy by default. The architecture lets you swap to Anthropic tool-use in one file when latency or quality matters more than locality."

**Q: How do you stop the agent from hallucinating?**
> "Three guardrails. First, the tool-use loop forces structured JSON — anything malformed bounces. Second, all the heavy decisions (risk score, routing) are policy-as-code in `policy.json` — the LLM proposes, the policy disposes. Third, low confidence (<0.7) escalates to a human even if the score is low."

**Q: What about the human-in-the-loop signal?**
> "When a reviewer manually approves an escalated item, that override is captured to localStorage. The natural next step is to inject the last N overrides into the system prompt as few-shot examples — a tight learning loop without retraining."

**Q: How would you extend this to lead-gen / contract-gen / collections?**
> "Each becomes a sibling agent emitting into the same trace store. The orchestrator pattern doesn't change; the tool catalog does. The CompanyDB lookup tool, in particular, is shared across underwriting and collections."

---

## Backup if Ollama goes sideways on stage

- The orchestrator already has a `gemma2` fallback baked in — if `gemma4:e4b` errors, you'll see a small "fallback" badge in the trace and the demo continues
- If both fail: open the Architecture tab and walk the diagram + the "How this scales" panel — that alone covers 3 of the 5 rubric criteria
