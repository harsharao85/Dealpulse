#Context video: https://customer-hzpubzwln1i257gg.cloudflarestream.com/55b893bcda8beb1dc9693f0b364ab5c3/watch

# DealPulse — AI Deal Health Monitor for SAP Sales Cloud

> **The Lead-to-Cash companion to SkillPilot.** Same BTP architecture pattern,
> second process pillar — demonstrating that one Domain Lead motion repeats
> across the entire SAP process landscape.

**Live on SAP BTP Cloud Foundry:**
`https://dealpulse-hr.cfapps.us10-001.hana.ondemand.com/api/health`

---

## The Business Problem

Sales managers don't find out a deal is at risk until it's already lost.
Meeting notes sit in CRM. Call transcripts go unread. By the time a rep
says "waiting on client," three weeks of momentum have already evaporated.

Meanwhile, SAP Sales Cloud customers on BTP EA or subscription models are
sitting on committed capacity with no AI activation story for their next QBR.
The question every Customer Success team faces six months before renewal:
**what's the fastest path from unused credits to demonstrable transformation?**

DealPulse is the answer for the Lead-to-Cash process area.

---

## What DealPulse Does

An AI-powered deal health monitor that reads meeting notes and call transcripts
from SAP Sales Cloud, runs sentiment analysis on every customer interaction,
scores each deal for risk, and gives sales reps specific coaching on what to
do next — before the deal is lost.
```
Sales Manager: "Show me which deals are about to go cold."

DealPulse: Risk score 83 — Cancity (MG Advanced)
           Sentiment: Negative · 92% confidence
           "Deal momentum has stalled with three consecutive weeks of no
           committed next steps, internal champion role change, and 30+
           days of no meaningful contact requiring manager escalation."

           Coaching: "Stop waiting passively. Your champion can't sponsor
           you anymore — identify who replaced them and schedule a
           15-minute call within 48 hours. Budget freezes are temporary;
           deprioritization is a priority problem."
```

---

## Why This Use Case for BTP Consumption

One DealPulse deployment drives consumption across multiple BTP services:

| BTP Service | Role in DealPulse |
|---|---|
| SAP AI Core (Generative AI Hub) | Sentiment analysis + coaching via Claude Sonnet |
| SAP HANA Cloud | Deal records, interaction history, risk score cache |
| Cloud Foundry Runtime | Application hosting |
| SAP AI Launchpad | Model monitoring and governance |

At enterprise scale (500 sales reps × 10 deals each = 5,000 deals analyzed
per cycle), this activates committed BTP capacity at meaningful volume —
turning a renewal risk into a transformation case study.

---

## Where It Sits in Lead-to-Cash
```
Lead → Qualify → [ ENGAGE ] → [ CLOSE ] → Invoice → Cash
                      ▲              ▲
               DealPulse lives here
               reading meeting notes + call transcripts
               from SAP Sales Cloud via released OData APIs
               never touching the core (Clean Core principle)
```

---

## FRE Maturity Ladder

| Level | Capability | DealPulse Stage |
|---|---|---|
| L1 | Manual CRM data entry, no AI | Baseline (pre-DealPulse) |
| L2 | AI sentiment + risk scoring per deal | **Current build** |
| L3 | Predictive close probability + pipeline forecasting | Next iteration |
| L4 | AI agents that auto-draft follow-up emails | Agentic layer |
| L5 | Cross-system: Sales Cloud + S/4HANA AR + Ariba contracts | Full L2C intelligence |

---

## Technical Architecture
```
┌─────────────────────────────────────────────────────────┐
│              Dashboard UI (Fiori-inspired)               │
│   Pipeline View · Deal Detail Panel · Summary View       │
└───────────────────────┬─────────────────────────────────┘
                        │ REST API calls
                        ▼
┌─────────────────────────────────────────────────────────┐
│              DealPulse Service (CAP Node.js)             │
│                                                          │
│  Two-speed architecture:                                 │
│  FAST PATH: Deterministic risk scoring (instant)         │
│    Deal stage + days stalled + sentiment hint            │
│    → risk_score 0-100, no API call needed                │
│                                                          │
│  AI PATH: On-demand per deal (Claude API)                │
│    Interaction text → sentiment analysis                 │
│    → risk score refinement                               │
│    → coaching recommendation                             │
│    → cached after first call                             │
└───────────────────────┬─────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────┐
│    Claude Sonnet (claude-sonnet-4-20250514)              │
│                                                          │
│  Dev:  Anthropic API (direct)                            │
│  Prod: SAP Generative AI Hub via AI Core                 │
│        + XSUAA token exchange                            │
│        + SAP AI ethics guardrails                        │
└─────────────────────────────────────────────────────────┘
```

**Data Layer** (mirrors SAP Sales Cloud OData API structure):
- 8,800 real B2B deal records (Maven Analytics CRM dataset)
- 85 accounts with sector, revenue, employee data
- 7 products across GTX and MG series
- 35 sales agents across Central, East, West regions
- 5,398 synthetic meeting notes and call transcripts

---

## Live Demo
```bash
# Health check
curl https://dealpulse-hr.cfapps.us10-001.hana.ondemand.com/api/health

# Pipeline summary
curl https://dealpulse-hr.cfapps.us10-001.hana.ondemand.com/api/summary

# Full AI analysis for a specific deal
curl https://dealpulse-hr.cfapps.us10-001.hana.ondemand.com/api/deal/OLVI7L8M

# Full pipeline with risk scores
curl https://dealpulse-hr.cfapps.us10-001.hana.ondemand.com/api/pipeline
```

---

## Local Setup
```bash
git clone https://github.com/harsharao85/Dealpulse.git
cd Dealpulse
npm install
cp .env.example .env
# Add your ANTHROPIC_API_KEY to .env
npm start

# Run the UI
npx serve ui
# Open http://localhost:4000
```

---

## Production Path (SAP BTP)

1. **Swap AI layer**: Replace Anthropic API with SAP AI Core service binding + XSUAA
2. **Swap data source**: Replace mock CSVs with live SAP Sales Cloud OData APIs
3. **Swap cache**: Replace in-memory cache with HANA Cloud persistence
4. **Add auth**: Enable XSUAA for enterprise SSO
5. **Add webhooks**: Trigger re-analysis when new interactions are logged in Sales Cloud

Architecture is identical. Only the service bindings change.

---

## The Two-Project Story

DealPulse and SkillPilot share identical BTP architecture patterns across
two different SAP process pillars:

| | SkillPilot | DealPulse |
|---|---|---|
| Process | Hire-to-Retire | Lead-to-Cash |
| SAP System | SuccessFactors Learning | SAP Sales Cloud |
| AI Capability | RAG conversational search | Sentiment + risk scoring |
| Business Problem | Migration change management | At-risk deal detection |
| BTP Stack | CAP + CF + AI Core + HANA | CAP + CF + AI Core + HANA |
| FRE Level | L2 | L2 |

Same platform. Same architecture. Different process pillars. This is the
repeatable pattern a Domain Lead brings to every customer conversation.

---

## About This Build

Built by **Harsha Rao** alongside SkillPilot as a proof-of-concept for the
SAP BTP Customer Success Domain Lead role. The goal: demonstrate that the
BTP AI architecture pattern is not a one-off — it repeats across the SAP
process landscape and scales to any customer conversation.

**Stack**: CAP Node.js · SAP BTP Cloud Foundry · Claude Sonnet · 8,800 real CRM records
**Deployed**: SAP BTP Trial (US East, AWS) · `cfapps.us10-001.hana.ondemand.com`
**Companion project**: [SkillPilot](https://github.com/harsharao85/BTP_SkillPilot_Successfactors) — Hire-to-Retire
