# DealPulse — AI Deal Health Monitor for SAP Sales Cloud

> **Lead-to-Cash companion to SkillPilot (Hire-to-Retire).**
> Same SAP BTP stack. Second process pillar.

---

## Business Problem

Sales reps miss at-risk deals until it's too late.

By the time a manager reviews a stalled opportunity in SAP Sales Cloud, the deal has already gone cold — the champion changed roles, the budget was frozen, or a competitor moved in. Traditional CRM dashboards show deal *stage* but not deal *health*. A rep can have 20 active opportunities all showing "Engaging" while half of them haven't had a meaningful interaction in six weeks.

**DealPulse fixes this by surfacing risk before it becomes loss.**

---

## What the AI Does

| Signal | Mechanism |
|--------|-----------|
| **Sentiment Analysis** | Claude reads the last 3 meeting notes / call transcripts per deal and returns `positive / neutral / negative` with a confidence score |
| **Risk Scoring** | Deterministic model combining sentiment, days since last interaction, deal stage, and close date proximity → 0–100 risk score |
| **Coaching Recommendations** | Claude generates a single, specific action paragraph for the sales rep based on the deal's full context |

---

## Architecture

```
SAP Sales Cloud (CRM events)
        │
        ▼
 CAP Node.js Service (BTP Cloud Foundry)
        │
        ├── GET /api/pipeline    ← risk-sorted deal list
        ├── GET /api/deal/:id    ← full AI analysis + coaching
        ├── GET /api/summary     ← pipeline stats
        └── GET /api/health      ← liveness check
        │
        ▼
 Anthropic API (dev) → SAP AI Core Generative AI Hub (prod)
```

**Tech Stack:**
- **Runtime:** Node.js 18+ on SAP BTP Cloud Foundry
- **Framework:** Express (standalone service alongside CAP)
- **AI (dev):** Anthropic Claude Haiku via `@anthropic-ai/sdk`
- **AI (prod):** SAP AI Core Generative AI Hub (`@sap-ai-sdk/foundation-models`)
- **Data:** CSV files → in-memory store (prototype); SAP HANA Cloud (production)
- **Auth (prod):** XSUAA service binding

---

## Project Structure

```
dealpulse/
├── db/
│   └── data/
│       ├── sales_pipeline.csv      # 8,800 opportunities
│       ├── accounts.csv            # 85 accounts
│       ├── products.csv            # product catalog
│       ├── sales_teams.csv         # agent → manager → region
│       └── interactions.json       # generated meeting notes + call transcripts
├── scripts/
│   └── generate-interactions.js   # synthetic interaction generator
├── srv/
│   └── dealpulse-service.js       # main Express service
├── .env.example
├── manifest.yml                   # BTP Cloud Foundry deployment
└── readme.md
```

---

## Quick Start

### 1. Clone and install

```bash
git clone <repo>
cd dealpulse
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
# Edit .env and add your ANTHROPIC_API_KEY
```

### 3. Generate interactions (if not already present)

```bash
npm run generate:interactions
# Generates ~5,400 synthetic meeting notes + call transcripts
# into db/data/interactions.json
```

### 4. Start the service

```bash
npm start
# or, for auto-reload during development:
npm run dev
```

Service runs at `http://localhost:3001`.

---

## API Reference

### `GET /api/health`
Service liveness check.

```json
{
  "status": "ok",
  "service": "DealPulse",
  "deals_loaded": 2149,
  "cache_size": 12
}
```

---

### `GET /api/pipeline`
All deals with deterministic risk scores, sorted by risk (highest first). Fast — no Claude calls.

```json
{
  "count": 2149,
  "deals": [
    {
      "opportunity_id": "A1B2C3D4",
      "sales_agent": "Moses Frase",
      "account": "Acme Corporation",
      "deal_stage": "Engaging",
      "close_date": "2026-02-15",
      "close_value": 12500,
      "risk_score": 87,
      "sentiment_label": "negative",
      "last_interaction_date": "2026-01-10"
    }
  ]
}
```

Append `?full=true` to run full Claude analysis on every deal (slower — use for demos).

---

### `GET /api/deal/:id`
Full deal detail with AI sentiment analysis, risk score, and coaching recommendation.
Results are cached after the first call.

```json
{
  "opportunity_id": "A1B2C3D4",
  "sales_agent": "Moses Frase",
  "account": "Acme Corporation",
  "account_sector": "technology",
  "deal_stage": "Engaging",
  "close_date": "2026-02-15",
  "close_value": 12500,
  "risk_score": 87,
  "sentiment_score": {
    "label": "negative",
    "confidence": 0.82,
    "summary": "Client has gone silent and mentioned a competing offer."
  },
  "coaching_recommendation": "Reach out immediately to re-engage the economic buyer ...",
  "interactions": [
    {
      "type": "call_transcript",
      "date": "2026-01-10",
      "content": "..."
    }
  ]
}
```

---

### `GET /api/summary`
Pipeline-level stats. Includes top high-risk deals from the AI analysis cache.

```json
{
  "total_deals": 2149,
  "total_pipeline_value": 4821000,
  "revenue_at_risk": 1340000,
  "avg_risk_score": 52,
  "deals_by_stage": { "Engaging": 1589, "Prospecting": 500, "Won": 30, "Lost": 30 },
  "top_high_risk_deals": [...]
}
```

---

## Deploying to SAP BTP (Cloud Foundry)

```bash
# Login to BTP
cf login -a https://api.cf.us10-001.hana.ondemand.com

# Set your API key as a user-provided service (keeps it out of manifest.yml)
cf cups dealpulse-ai-key -p '{"ANTHROPIC_API_KEY":"your-key-here"}'

# Push the app
cf push

# Bind the credential service
cf bind-service dealpulse dealpulse-ai-key
cf restage dealpulse
```

Live URL: `https://dealpulse-hr.cfapps.us10-001.hana.ondemand.com`

---

## Production AI Swap: Claude → SAP AI Core

In production, replace the Anthropic client with the SAP AI Core SDK:

```js
// Replace in srv/dealpulse-service.js:

// DEV (current)
const Anthropic = require('@anthropic-ai/sdk');
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// PROD (SAP AI Core)
const { AzureOpenAiChatClient } = require('@sap-ai-sdk/foundation-models');
const client = new AzureOpenAiChatClient({ modelName: 'gpt-4o' });
// or use Anthropic Claude via AI Core:
// const client = new AnthropicClient({ modelName: 'claude-3-haiku' });
```

Credentials come from the `VCAP_SERVICES` environment variable injected by BTP.

---

## Relationship to SkillPilot

| Dimension | SkillPilot | DealPulse |
|-----------|------------|-----------|
| **SAP Process** | Hire-to-Retire | Lead-to-Cash |
| **SAP Module** | SuccessFactors / LMS | SAP Sales Cloud |
| **BTP Stack** | CAP + HANA + AI Core | CAP + Express + AI Core |
| **AI Use Case** | Skill gap analysis + learning paths | Deal health + coaching |
| **User** | HR / L&D teams | Sales managers / reps |

Together they demonstrate AI-augmented operations across two of SAP's core process pillars on a shared BTP platform — the same pitch relevant to Accenture LearnVantage's enterprise SAP practice.

---

## Roadmap (UI Phase)

- React + SAP UI5 Web Components dashboard
- Fiori-aligned design tokens
- Deal health heatmap by rep / region
- Manager coaching queue (sorted by revenue at risk)
- SAP Sales Cloud side-panel embed (BTP Extension Suite)
