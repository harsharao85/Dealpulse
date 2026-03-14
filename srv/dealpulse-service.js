/**
 * DealPulse — AI Deal Health Monitor for SAP Sales Cloud
 * srv/dealpulse-service.js
 *
 * Runs as a standalone Express server (Node.js).
 * In production on SAP BTP, replace Anthropic client with
 * SAP AI Core Generative AI Hub (XSUAA-bound service binding).
 */

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const Papa = require('papaparse');
const Anthropic = require('@anthropic-ai/sdk');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3001;
const DATA_DIR = path.join(__dirname, '..', 'db', 'data');

// ── Anthropic client ─────────────────────────────────────────────────────────
// Production BTP swap: replace with @sap-ai-sdk/foundation-models or
// direct call to AI Core Generative AI Hub via VCAP_SERVICES binding.
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ── In-memory store (loaded once at startup) ─────────────────────────────────
let PIPELINE = [];       // raw rows from sales_pipeline.csv
let ACCOUNTS = {};       // keyed by account name
let PRODUCTS = {};       // keyed by product name
let TEAMS = {};          // keyed by sales_agent name
let INTERACTIONS = {};   // keyed by opportunity_id → array of interactions
let DEAL_CACHE = {};     // computed deal health, keyed by opportunity_id

// ── CSV loader ───────────────────────────────────────────────────────────────
function readCsv(filename) {
  const raw = fs.readFileSync(path.join(DATA_DIR, filename), 'utf8');
  return Papa.parse(raw, { header: true, skipEmptyLines: true }).data;
}

// ── Risk score calculation (deterministic, no AI needed) ─────────────────────
function computeRiskScore(deal, interactions, sentimentResult) {
  let score = 0;

  // Sentiment weight (0–40 pts)
  const sentimentWeights = { negative: 40, neutral: 20, positive: 5 };
  score += sentimentWeights[sentimentResult.label] ?? 20;

  // Confidence amplifier: high confidence in negative = worse
  if (sentimentResult.label === 'negative' && sentimentResult.confidence > 0.75) {
    score += 10;
  }

  // Days since last interaction (0–25 pts)
  if (interactions.length === 0) {
    score += 25;
  } else {
    const dates = interactions.map(i => new Date(i.date)).filter(d => !isNaN(d));
    if (dates.length > 0) {
      const latest = new Date(Math.max(...dates));
      const today = new Date('2026-03-14');
      const daysSince = Math.floor((today - latest) / (1000 * 60 * 60 * 24));
      if (daysSince > 30) score += 25;
      else if (daysSince > 14) score += 15;
      else if (daysSince > 7) score += 8;
      else score += 2;
    }
  }

  // Deal stage risk (0–15 pts)
  const stageRisk = {
    Prospecting: 10,
    Engaging: 5,
    Won: 0,
    Lost: 15,
  };
  score += stageRisk[deal.deal_stage] ?? 10;

  // Close date proximity / overdue (0–20 pts)
  if (deal.close_date && deal.close_date.trim()) {
    const closeDate = new Date(deal.close_date);
    const today = new Date('2026-03-14');
    const daysToClose = Math.floor((closeDate - today) / (1000 * 60 * 60 * 24));
    if (daysToClose < 0) score += 20;         // overdue
    else if (daysToClose < 14) score += 12;   // closing soon — high pressure
    else if (daysToClose < 30) score += 6;
    else score += 0;
  } else {
    score += 20; // no close date = high risk
  }

  return Math.min(100, Math.max(0, score));
}

// ── Claude: sentiment analysis ────────────────────────────────────────────────
async function analyzeSentiment(interactions) {
  if (interactions.length === 0) {
    return { label: 'neutral', confidence: 0.5, summary: 'No interactions recorded.' };
  }

  const excerpts = interactions
    .slice(-3) // last 3 interactions for recency bias
    .map(i => `[${i.type} — ${i.date}]\n${i.content}`)
    .join('\n\n---\n\n');

  const message = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 200,
    messages: [{
      role: 'user',
      content: `Analyze the sentiment of these sales interaction notes and respond with ONLY valid JSON.

INTERACTIONS:
${excerpts}

Respond with this exact JSON structure (no markdown, no explanation):
{"label":"positive","confidence":0.85,"summary":"One sentence summary of the deal momentum."}

label must be one of: positive, neutral, negative
confidence must be 0.0 to 1.0`,
    }],
  });

  try {
    const text = message.content[0].text.trim();
    // Strip any accidental markdown fences
    const clean = text.replace(/```json\n?|\n?```/g, '').trim();
    return JSON.parse(clean);
  } catch {
    return { label: 'neutral', confidence: 0.5, summary: 'Unable to parse sentiment analysis.' };
  }
}

// ── Claude: coaching recommendation ──────────────────────────────────────────
async function generateCoaching(deal, interactions, sentiment, riskScore) {
  const lastInteraction = interactions.length > 0
    ? interactions.sort((a, b) => new Date(b.date) - new Date(a.date))[0]
    : null;

  const context = `
Deal: ${deal.account} — ${deal.product}
Sales Rep: ${deal.sales_agent}
Stage: ${deal.deal_stage}
Close Date: ${deal.close_date || 'Not set'}
Value: $${Number(deal.close_value || 0).toLocaleString()}
Risk Score: ${riskScore}/100
Sentiment: ${sentiment.label} (confidence: ${Math.round(sentiment.confidence * 100)}%)
Last Interaction: ${lastInteraction ? `${lastInteraction.date} (${lastInteraction.type})` : 'None on record'}

Recent Interaction Summary:
${interactions.slice(-2).map(i => i.content.slice(0, 200)).join('\n')}
`.trim();

  const message = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 250,
    messages: [{
      role: 'user',
      content: `You are a sales performance coach at an enterprise software company. Based on the deal context below, write ONE concise paragraph (3–5 sentences) of specific, actionable coaching advice for the sales rep. Focus on the single most impactful next action. Be direct and concrete — avoid generic advice.

DEAL CONTEXT:
${context}`,
    }],
  });

  return message.content[0].text.trim();
}

// ── Compute full deal health (with Claude calls) ──────────────────────────────
async function computeDealHealth(deal) {
  const oid = deal.opportunity_id;
  if (DEAL_CACHE[oid]) return DEAL_CACHE[oid];

  const interactions = INTERACTIONS[oid] || [];
  const account = ACCOUNTS[deal.account] || {};
  const product = PRODUCTS[deal.product] || {};
  const teamInfo = TEAMS[deal.sales_agent] || {};

  // Parallel: sentiment analysis (don't block on coaching yet)
  const sentiment = await analyzeSentiment(interactions);
  const riskScore = computeRiskScore(deal, interactions, sentiment);
  const coaching = await generateCoaching(deal, interactions, sentiment, riskScore);

  const result = {
    opportunity_id: oid,
    sales_agent: deal.sales_agent,
    manager: teamInfo.manager || null,
    regional_office: teamInfo.regional_office || null,
    product: deal.product,
    product_series: product.series || null,
    sales_price: product.sales_price ? Number(product.sales_price) : null,
    account: deal.account,
    account_sector: account.sector || null,
    account_revenue: account.revenue ? Number(account.revenue) : null,
    account_employees: account.employees ? Number(account.employees) : null,
    deal_stage: deal.deal_stage,
    engage_date: deal.engage_date || null,
    close_date: deal.close_date || null,
    close_value: deal.close_value ? Number(deal.close_value) : 0,
    sentiment_score: sentiment,
    risk_score: riskScore,
    coaching_recommendation: coaching,
    interaction_count: interactions.length,
    last_interaction_date: interactions.length > 0
      ? interactions.sort((a, b) => new Date(b.date) - new Date(a.date))[0].date
      : null,
  };

  DEAL_CACHE[oid] = result;
  return result;
}

// ── Startup data loader ───────────────────────────────────────────────────────
function loadData() {
  console.log('Loading CSV data...');
  PIPELINE = readCsv('sales_pipeline.csv');

  readCsv('accounts.csv').forEach(a => { ACCOUNTS[a.account] = a; });
  readCsv('products.csv').forEach(p => { PRODUCTS[p.product] = p; });
  readCsv('sales_teams.csv').forEach(t => { TEAMS[t.sales_agent] = t; });

  const rawInteractions = JSON.parse(
    fs.readFileSync(path.join(DATA_DIR, 'interactions.json'), 'utf8')
  );
  rawInteractions.forEach(i => {
    if (!INTERACTIONS[i.opportunity_id]) INTERACTIONS[i.opportunity_id] = [];
    INTERACTIONS[i.opportunity_id].push(i);
  });

  // Only expose deals that have interactions (the computed subset)
  const idsWithInteractions = new Set(Object.keys(INTERACTIONS));
  PIPELINE = PIPELINE.filter(d => idsWithInteractions.has(d.opportunity_id));

  console.log(`Loaded ${PIPELINE.length} deals with interactions.`);
  console.log(`Accounts: ${Object.keys(ACCOUNTS).length}`);
  console.log(`Products: ${Object.keys(PRODUCTS).length}`);
  console.log(`Sales agents: ${Object.keys(TEAMS).length}`);
  console.log(`Interactions: ${rawInteractions.length}`);
}

// ── Routes ────────────────────────────────────────────────────────────────────

// GET /api/health — service liveness check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'DealPulse',
    version: '1.0.0',
    deals_loaded: PIPELINE.length,
    cache_size: Object.keys(DEAL_CACHE).length,
    timestamp: new Date().toISOString(),
  });
});

// GET /api/pipeline — all deals, sorted by risk score (highest first)
// Computes risk score deterministically without Claude for speed.
// Append ?full=true to force Claude analysis on all (slow — for demo use).
app.get('/api/pipeline', async (req, res) => {
  try {
    const full = req.query.full === 'true';

    if (full) {
      // Full AI analysis — batch with concurrency limit
      const CONCURRENCY = 5;
      const results = [];
      for (let i = 0; i < PIPELINE.length; i += CONCURRENCY) {
        const batch = PIPELINE.slice(i, i + CONCURRENCY);
        const batchResults = await Promise.all(batch.map(computeDealHealth));
        results.push(...batchResults);
      }
      results.sort((a, b) => b.risk_score - a.risk_score);
      return res.json({ count: results.length, deals: results });
    }

    // Fast path: deterministic risk only (no Claude calls)
    const deals = PIPELINE.map(deal => {
      const interactions = INTERACTIONS[deal.opportunity_id] || [];
      const teamInfo = TEAMS[deal.sales_agent] || {};
      const account = ACCOUNTS[deal.account] || {};
      const product = PRODUCTS[deal.product] || {};

      // Heuristic sentiment from sentiment_hint in interactions
      const hints = interactions.map(i => i.sentiment_hint).filter(Boolean);
      const hintCounts = { positive: 0, neutral: 0, negative: 0 };
      hints.forEach(h => { if (hintCounts[h] !== undefined) hintCounts[h]++; });
      const dominantLabel = Object.entries(hintCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'neutral';
      const syntheticSentiment = { label: dominantLabel, confidence: 0.7 };

      const riskScore = computeRiskScore(deal, interactions, syntheticSentiment);
      const sortedInteractions = interactions.sort((a, b) => new Date(b.date) - new Date(a.date));

      return {
        opportunity_id: deal.opportunity_id,
        sales_agent: deal.sales_agent,
        manager: teamInfo.manager || null,
        regional_office: teamInfo.regional_office || null,
        product: deal.product,
        product_series: product.series || null,
        account: deal.account,
        account_sector: account.sector || null,
        deal_stage: deal.deal_stage,
        close_date: deal.close_date || null,
        close_value: deal.close_value ? Number(deal.close_value) : 0,
        risk_score: riskScore,
        sentiment_label: dominantLabel,
        interaction_count: interactions.length,
        last_interaction_date: sortedInteractions[0]?.date || null,
      };
    });

    deals.sort((a, b) => b.risk_score - a.risk_score);
    res.json({ count: deals.length, deals });
  } catch (err) {
    console.error('Pipeline error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/deal/:id — full deal detail with AI analysis
app.get('/api/deal/:id', async (req, res) => {
  try {
    const deal = PIPELINE.find(d => d.opportunity_id === req.params.id);
    if (!deal) return res.status(404).json({ error: 'Deal not found' });

    const health = await computeDealHealth(deal);
    const interactions = (INTERACTIONS[req.params.id] || [])
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .map(({ sentiment_hint, ...rest }) => rest); // strip internal hint from response

    res.json({ ...health, interactions });
  } catch (err) {
    console.error('Deal detail error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/summary — pipeline summary stats
app.get('/api/summary', (req, res) => {
  try {
    const stageCounts = {};
    const stageRevenue = {};
    let totalRevenue = 0;
    let totalRisk = 0;
    let riskCount = 0;

    PIPELINE.forEach(deal => {
      const stage = deal.deal_stage;
      const value = Number(deal.close_value) || 0;

      stageCounts[stage] = (stageCounts[stage] || 0) + 1;
      stageRevenue[stage] = (stageRevenue[stage] || 0) + value;
      totalRevenue += value;

      // Use cached risk scores if available
      const cached = DEAL_CACHE[deal.opportunity_id];
      if (cached) {
        totalRisk += cached.risk_score;
        riskCount++;
      }
    });

    // Revenue at risk = sum of close_value for Engaging + Prospecting
    const revenueAtRisk = (stageRevenue['Engaging'] || 0) + (stageRevenue['Prospecting'] || 0);

    // High-risk deals (risk_score >= 70) from cache
    const highRiskDeals = Object.values(DEAL_CACHE)
      .filter(d => d.risk_score >= 70)
      .sort((a, b) => b.risk_score - a.risk_score)
      .slice(0, 10)
      .map(d => ({
        opportunity_id: d.opportunity_id,
        account: d.account,
        sales_agent: d.sales_agent,
        close_value: d.close_value,
        risk_score: d.risk_score,
        deal_stage: d.deal_stage,
      }));

    res.json({
      total_deals: PIPELINE.length,
      total_pipeline_value: Math.round(totalRevenue),
      revenue_at_risk: Math.round(revenueAtRisk),
      avg_risk_score: riskCount > 0 ? Math.round(totalRisk / riskCount) : null,
      deals_analyzed_by_ai: riskCount,
      deals_by_stage: stageCounts,
      revenue_by_stage: Object.fromEntries(
        Object.entries(stageRevenue).map(([k, v]) => [k, Math.round(v)])
      ),
      top_high_risk_deals: highRiskDeals,
    });
  } catch (err) {
    console.error('Summary error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── Start ─────────────────────────────────────────────────────────────────────
loadData();
app.listen(PORT, () => {
  console.log(`\nDealPulse service running → http://localhost:${PORT}`);
  console.log('Endpoints:');
  console.log(`  GET /api/health`);
  console.log(`  GET /api/pipeline          (fast, deterministic risk)`);
  console.log(`  GET /api/pipeline?full=true (AI-powered, slower)`);
  console.log(`  GET /api/deal/:id           (full AI analysis + coaching)`);
  console.log(`  GET /api/summary            (pipeline summary stats)`);
});
