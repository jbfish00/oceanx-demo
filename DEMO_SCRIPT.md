# OceanX Demo Script — ~12 minutes on stage

Target: hit all 5 rubric criteria (clarity, practical usefulness, automation depth, tool usage, scalability), with one chaos-mode demo to show error handling. The on-stage run uses a curated 3-invoice subset (`DEMO_LIVE/`) chosen for verdict variety + reliability; the full 7-invoice regression suite (`DEMO_IMAGES/`) is the credibility backstop in Q&A.

**Why curated:** `gemma4:e4b` on CPU runs each invoice in ~3 min. Three invoices = ~9 min of agent runtime, narrated. The full 7 would mean ~25 minutes of staring at spinners — no.

---

## 0. Pre-flight (do NOT screen-share yet)

- [ ] `ollama serve` running, `ollama list` shows both `gemma4:e4b` and `gemma:2b`
- [ ] One warm-up run completed in this Ollama session so the 8B model is hot in RAM (single-file run on `INV-103_Oceanic.pdf` from `DEMO_IMAGES/` is enough)
- [ ] `npm run dev` running, dev URL open in a clean browser window
- [ ] `DEMO_LIVE/` folder is the on-stage input set — 3 invoices: `INV-107_Horizon.jpg` (clean approve, ~3 min), `INV-104_Valkin.pdf` (nuanced escalate, ~3 min), `INV-108_Meridian.pdf` (Chapter 11 escalate, ~3 min)
- [ ] `eval-report.md` open in a side tab — pull it up during Q&A if asked about quality
- [ ] One backup PDF saved in `~/Downloads/` for the "drop a random PDF on me" beat
- [ ] Chaos mode is OFF
- [ ] Pipeline tab is selected

---

## 1. Frame the problem (30 s)

> "OceanX's thesis is that humans should focus on relationships and capital decisions; agents should run everything else. Right now there's a person manually OCR-ing PDFs, looking up counterparties, scoring risk, and hand-keying data into eight separate systems — CIN7, Xero, GoCardless, Wise, HubSpot, Apollo, Instantly, Dripify. I built a multi-step agent that owns that entire chain. Humans only see what the agent escalates."

## 2. Run the curated batch (~9 min — narrate while it runs)

1. Click **Upload Directory & Run Agents** → pick `DEMO_LIVE/`
2. As the first file (Horizon) starts, frame:
   > "Three invoices, each triggering a real tool-use loop across all eight integrations. The LLM picks the next tool at every step — Apollo enrichment, CompanyDB credit lookup, risk scoring, then either escalates or runs the full ops chain: CIN7 inventory, Xero invoice, GoCardless direct debit, Wise supplier transfer, HubSpot CRM. Around ten LLM decisions per file on the approved path. Each takes about 3-4 minutes on CPU. While it runs I'll show you the decision-making."
3. **Switch to Live Trace immediately** while file 1 is processing (don't wait for completion). Point at the trace timeline as steps appear in real time:
   > "There's the agent picking `extractInvoice` — here's the LLM's thought, the prompt sent, the response, the latency. Now `enrichLeadApollo` — that's pulling company profile, contacts, revenue estimate from Apollo. Next is `lookupCompanyHistory` — CompanyDB returning prior payment behaviour and credit flags."
4. When all three complete, switch back to **Pipeline** tab. Expected outcomes:
   - **1 auto-approved**: Horizon — Apollo / CIN7 / Xero / GoCardless / Wise / HubSpot tags all green
   - **2 escalated**: Valkin (3 flags: liquidity watch, extended-terms request, volume spike) and Meridian (Chapter 11)
5. Click **View Apollo** on Horizon → enriched company profile with contacts and revenue estimate
6. Click **View CIN7** on Horizon → product record + purchase order payload
7. Click **View Xero payload** on Horizon → real-shape Xero `POST /invoices` body
8. Click **View Wise** on Horizon → supplier transfer payload with estimated delivery date
9. On Meridian, point at the AI Underwriting Note:
   > "The agent caught Chapter 11 from a single line in the OCR text and routed straight to human review — no CIN7, no Xero, no payment initiated. That's the routing gate from `policy.json` doing its job."

## 3. Audit trail (45 s)

1. Stay on the **Live Trace** tab if not already there
2. Point at the header strip: runs, tool calls, total LLM ms, retries, escalated count
3. Click **Download audit.csv** → show the file in the OS download bar
   > "One row per agent step — prompt, response, latency, tool result. Drop straight into Splunk, Datadog, or a SOC2 compliance archive."

## 4. Demonstrate resilience — Chaos mode (~3.5 min, narrate while running)

This run is one file (Horizon) so it's only one ~3-minute wait, not three.

1. Hit **Reset Pipeline**, then toggle **Chaos mode: ON** (button turns amber)
2. Click **Upload Directory & Run Agents** → pick a single-file folder containing only `INV-107_Horizon.jpg` (have this prepped as `~/Demo/HORIZON_ONLY/` before the call)
3. Switch to **Live Trace** while it runs. As Xero failures appear, narrate:
   > "Xero is flapping at a 30% failure rate. The agent's catching it, backing off — there's `try #2`, `try #3` — and the file still completes successfully. If it fails three times the work item escalates instead of leaving a half-written record."

## 5. Architecture + scaling story (45 s)

1. Click the **Architecture** tab
2. Walk the Mermaid diagram — point out the two paths (dashed = conditional outreach for new counterparties, solid = approved ops chain)
3. Hit the "How this scales" panel:
   > "Today this is one React process hitting eight mocked integrations. To scale: swap the in-memory queue for BullMQ/Redis, run N orchestrator workers — agent code unchanged. Every tool definition is already JSON-schema-shaped, so swapping Ollama for Anthropic tool-use is a one-file change. Each mock becomes its own MCP server. And this exact trace store is what a collections agent, a contract-gen agent, and a lead-gen agent would all emit into — that's how you build a multi-agent mesh without re-architecting anything."

## 6. Q&A

Anticipated questions + crisp answers:

**Q: Which tools does this cover?**
> "All eight from the brief — Apollo for enrichment, Instantly and Dripify for outreach, CIN7 for inventory and purchase orders, Xero for invoicing, GoCardless for direct debit collection, Wise for supplier payment, HubSpot for CRM. You can click into any payload in the Pipeline tab."

**Q: Why a local LLM and not Claude / GPT?**
> "Trade finance data is sensitive — running on-prem gives OceanX privacy by default. The runtime adapter in `runtimes.js` is a thin interface; swapping to Anthropic tool-use is a one-file change. I built it that way deliberately."

**Q: How do you know it's actually getting the right answer?**
> "I built a regression eval — three passes through the full 7-invoice ground truth set. Latest run: 100% median verdict accuracy, 100% risk-band agreement, 100% flag-detection recall. One borderline case (Nexus — late fees plus minor liquidity) flipped to approved on one pass out of 21; I added a targeted few-shot to the scoring prompt covering that exact two-signal scenario, re-ran the eval, and confirmed it doesn't regress the others. Here's the report." [Open eval-report.md tab]

**Q: How do you stop the agent from hallucinating?**
> "Three guardrails. First, the tool-use loop forces structured JSON — anything malformed bounces. Second, all the heavy decisions (risk score, routing) are policy-as-code in `policy.json` — the LLM proposes, the policy disposes. Third, low confidence (<0.7) escalates to a human even if the score is low."

**Q: What about the human-in-the-loop signal?**
> "When a reviewer manually approves an escalated item, that override is captured to localStorage. The natural next step is to inject the last N overrides into the system prompt as few-shot examples — a tight learning loop without retraining."

**Q: How would you extend this to collections or contract-gen?**
> "Each becomes a sibling agent emitting into the same trace store. The orchestrator pattern doesn't change; only the tool catalog does. CompanyDB and Apollo enrichment are already shared across the underwriting and outreach paths — collections just adds a payment-chase tool."

---

## Backup if anything goes sideways on stage

- **gemma4:e4b errors** → orchestrator transparently falls through to `gemma:2b`. Visible in the trace as a tier transition; demo continues without a blip
- **An invoice gets the wrong verdict on stage** (rare per eval data, but possible) → don't panic; it's a 1-in-21-runs failure rate the eval already documents. Acknowledge it and pivot: "this is exactly what the eval surfaces — let me show you." [open eval-report.md] "Same prompt, three passes. The fix is targeted few-shot examples, which we use for borderline cases."
- **Ollama dead entirely** → open the Architecture tab and walk the diagram + the "How this scales" panel; that alone covers 3 of the 5 rubric criteria
- **Worst case** → fall back to walking through `eval-report.md` aloud; the regression suite alone is a strong technical signal even without a live run

## Backup answers to expected Q&A

> "How do you know the agent is making good decisions?"
- "I have a regression suite — `npm run eval` — that scores verdict accuracy, risk-band agreement, and flag-detection recall against ground truth across the sample invoices, and I run it three times to account for LLM non-determinism. Latest report is open in this tab."

> "Why local Ollama and not Anthropic / OpenAI?"
- "Trade finance data is sensitive, so on-prem is the conservative default. The runtime layer in `runtimes.js` is a thin adapter — swapping to Anthropic tool-use or an MCP server is a single-file change. I built it that way deliberately."

> "What about non-canonical inputs — does this only work on your sample files?"
- "No — pdf.js extracts text from any PDF. Want to hand me one?" (Have a backup PDF ready in `~/Downloads/`)
