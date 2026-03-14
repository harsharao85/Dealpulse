/**
 * generate-interactions.js
 * Generates synthetic meeting notes and call transcripts for the sales pipeline.
 * Focuses on active deals (Prospecting, Engaging) + a sample of Won/Lost for context.
 * Output: db/data/interactions.json
 */

const fs = require('fs');
const path = require('path');
const Papa = require('papaparse');

const DATA_DIR = path.join(__dirname, '..', 'db', 'data');
const OUT_FILE = path.join(DATA_DIR, 'interactions.json');

// Max Won/Lost to include (to keep dataset manageable)
const MAX_WON_SAMPLE = 30;
const MAX_LOST_SAMPLE = 30;

// ── Helper utilities ────────────────────────────────────────────────────────

function readCsv(filename) {
  const raw = fs.readFileSync(path.join(DATA_DIR, filename), 'utf8');
  const result = Papa.parse(raw, { header: true, skipEmptyLines: true });
  return result.data;
}

function randomFrom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().split('T')[0];
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ── Interaction templates by sentiment ─────────────────────────────────────

const POSITIVE_MEETING_NOTES = [
  (opp) => `Meeting with ${opp.account} — Champion confirmed budget approval. ${opp.sales_agent} demonstrated ${opp.product} live; stakeholders were highly engaged. Procurement timeline aligns with our close target. Action: send updated SOW by end of week.`,
  (opp) => `QBR with ${opp.account}. VP of Operations praised pilot results and requested expansion proposal for two additional divisions. ${opp.sales_agent} to schedule executive alignment call. Strong signals for upsell on ${opp.product}.`,
  (opp) => `Discovery call exceeded expectations. ${opp.account} confirmed ${opp.product} is the preferred solution after competitive evaluation. Legal review initiated. Expect redlined contract within 10 business days.`,
  (opp) => `Executive sponsor at ${opp.account} confirmed internal approval. ${opp.sales_agent} presented ROI model — finance team satisfied with 14-month payback period on ${opp.product}. Contract signature expected before month-end.`,
  (opp) => `Proof of concept review with ${opp.account} technical team. All success criteria met. Champion (Director of IT) will present to steering committee on Thursday. ${opp.sales_agent} confirmed: no competing proposals remain active.`,
];

const POSITIVE_CALL_TRANSCRIPTS = [
  (opp) => `[Call Transcript — ${opp.sales_agent} + ${opp.account}]
Rep: "Thanks for the time today. How did the pilot data land with your leadership?"
Client: "Really well, actually. They were impressed with the throughput numbers on ${opp.product}. I think we're ready to move forward."
Rep: "That's great to hear. Should we loop in procurement this week to align on timelines?"
Client: "Yes, let's do Thursday. I'll send a calendar invite."
Rep: "Perfect. I'll have the final pricing doc ready by Wednesday."`,

  (opp) => `[Call Transcript — ${opp.sales_agent} + ${opp.account}]
Client: "We finished the internal evaluation. ${opp.product} came out on top across all criteria."
Rep: "That's excellent news. What does the next step look like on your end?"
Client: "Legal just needs to do a quick review — shouldn't be more than a week. Then we're good to sign."
Rep: "Understood. I'll coordinate with your legal team directly to expedite."`,

  (opp) => `[Call Transcript — ${opp.sales_agent} + ${opp.account}]
Rep: "Did the CFO have any questions on the business case?"
Client: "A few minor ones on implementation cost, but nothing we couldn't handle. She's signed off."
Rep: "Fantastic. So we're looking at close by end of quarter?"
Client: "Correct. Get us the final contract and we'll turn it around fast."`,
];

const NEUTRAL_MEETING_NOTES = [
  (opp) => `Initial discovery with ${opp.account}. ${opp.sales_agent} presented ${opp.product} capabilities. Stakeholders asked clarifying questions about integration with their existing ERP. Follow-up demo scheduled for next week. No major objections raised yet.`,
  (opp) => `Check-in call with ${opp.account}. Project is progressing but internal procurement review is taking longer than expected. ${opp.sales_agent} to send additional compliance documentation. Deal still tracking to original close date but monitoring closely.`,
  (opp) => `Second meeting with ${opp.account}. Technical requirements workshop completed. Some open questions around data migration scope. ${opp.sales_agent} will coordinate with pre-sales engineering for a detailed assessment. Stakeholder alignment remains solid.`,
  (opp) => `Product demo for ${opp.account}. Attendees included IT Director and two business analysts. ${opp.product} features well received overall. Client requested a custom ROI model specific to their industry. ${opp.sales_agent} to deliver by next Friday.`,
  (opp) => `Mid-cycle review call with ${opp.account}. Budget discussions ongoing — CFO wants a phased rollout option. ${opp.sales_agent} proposed a pilot-first approach. Client seemed open. Decision timeline pushed by 3 weeks to accommodate internal review process.`,
];

const NEUTRAL_CALL_TRANSCRIPTS = [
  (opp) => `[Call Transcript — ${opp.sales_agent} + ${opp.account}]
Rep: "How is the internal review going?"
Client: "Still in progress. A few more stakeholders need to weigh in. Probably another two weeks."
Rep: "Understood. Any concerns I can help address in the meantime?"
Client: "Not really — just the normal internal process. We'll be in touch."`,

  (opp) => `[Call Transcript — ${opp.sales_agent} + ${opp.account}]
Client: "We liked the demo. ${opp.product} looks promising, but we want to compare it against one more vendor."
Rep: "Of course. What criteria matter most for your final decision?"
Client: "Mostly support SLAs and total cost of ownership."
Rep: "I'll prepare a detailed comparison on both. Can we reconnect next week?"
Client: "Sure, Friday works."`,

  (opp) => `[Call Transcript — ${opp.sales_agent} + ${opp.account}]
Rep: "Just checking in — any update from the committee?"
Client: "They met last Tuesday but didn't reach a final decision. Meeting again next month."
Rep: "Got it. Is there anything we can do to help move things along?"
Client: "Not really, it's just their process. We'll keep you posted."`,
];

const NEGATIVE_MEETING_NOTES = [
  (opp) => `At-risk review for ${opp.account}. ${opp.sales_agent} has not had meaningful contact in over 30 days. Last communication was an unanswered email. Champion appears to have changed roles internally. No response to three follow-up attempts. Escalation to manager recommended.`,
  (opp) => `Difficult check-in with ${opp.account}. Client indicated budget has been frozen due to an internal reorganization. ${opp.product} purchase has been deprioritized. ${opp.sales_agent} is trying to identify alternative budget holders but prospects are unclear. Deal at significant risk.`,
  (opp) => `Concerning signals from ${opp.account}. Key contact has gone dark after a positive earlier stage. Competitor may have entered with aggressive pricing on a comparable product. ${opp.sales_agent} has not attempted a value-differentiation pitch. Immediate manager intervention needed.`,
  (opp) => `Deal review — ${opp.account}. Client expressed dissatisfaction with the pace of our technical support during the POC phase. ${opp.product} evaluation was paused. Relationship is strained. ${opp.sales_agent} needs to arrange a recovery call with executive sponsors immediately.`,
  (opp) => `Last-touch analysis for ${opp.account}. Deal has been in current stage for 45+ days with no stage progression. ${opp.sales_agent} reports "waiting on client" but no documented ask or next step is on record. Close date has passed with no update. This deal needs to be re-qualified or closed out.`,
];

const NEGATIVE_CALL_TRANSCRIPTS = [
  (opp) => `[Call Transcript — ${opp.sales_agent} + ${opp.account}]
Rep: "I wanted to follow up on where things stand."
Client: "Honestly, we've had a lot going on internally. I can't commit to a timeline right now."
Rep: "Is there anything specific blocking you?"
Client: "Budget is the main thing. We may need to revisit this next fiscal year."
Rep: "I understand. Should I check back in Q2?"
Client: "That's probably best. Sorry I don't have better news."`,

  (opp) => `[Call Transcript — ${opp.sales_agent} + ${opp.account}]
Client: "We've been evaluating a competitor's offer and it's actually quite competitive."
Rep: "What aspects are they leading on?"
Client: "Primarily price and the fact that they already integrate with our existing system."
Rep: "We can look at our pricing structure and our integration team can—"
Client: "Look, it's not just price. We need to think this through more carefully. I'll be in touch."`,

  (opp) => `[Call Transcript — ${opp.sales_agent} + ${opp.account}]
Rep: "Hi, just following up on the proposal I sent two weeks ago."
Client: "Oh yes, sorry — things have been hectic. I haven't had a chance to review it."
Rep: "No worries. Is there a better time to reconnect?"
Client: "Maybe in a few weeks. I'll reach out when things settle down."
[Note: Third consecutive week of no committed next step from client.]`,
];

// ── Determine sentiment category for a deal ─────────────────────────────────

function getDealSentiment(deal) {
  const stage = deal.deal_stage;
  const hasCloseDate = deal.close_date && deal.close_date.trim() !== '';

  if (stage === 'Won') return 'positive';
  if (stage === 'Lost') return 'negative';
  if (!hasCloseDate) return 'negative';

  // Prospecting: mostly neutral-to-positive early signals
  if (stage === 'Prospecting') {
    return Math.random() < 0.6 ? 'neutral' : 'positive';
  }

  // Engaging: mix — check if close date is past or far out
  if (stage === 'Engaging') {
    const closeDate = new Date(deal.close_date);
    const today = new Date('2026-03-14');
    const daysToClose = (closeDate - today) / (1000 * 60 * 60 * 24);
    if (daysToClose < 0) return 'negative';   // overdue
    if (daysToClose < 30) return 'positive';   // imminent close
    return Math.random() < 0.5 ? 'neutral' : 'negative';
  }

  return 'neutral';
}

// ── Build interactions for one deal ─────────────────────────────────────────

function buildInteractions(deal, agentInfo) {
  const sentiment = getDealSentiment(deal);
  const count = randomInt(2, 3);
  const interactions = [];

  let meetingPool, callPool;
  if (sentiment === 'positive') {
    meetingPool = POSITIVE_MEETING_NOTES;
    callPool = POSITIVE_CALL_TRANSCRIPTS;
  } else if (sentiment === 'negative') {
    meetingPool = NEGATIVE_MEETING_NOTES;
    callPool = NEGATIVE_CALL_TRANSCRIPTS;
  } else {
    meetingPool = NEUTRAL_MEETING_NOTES;
    callPool = NEUTRAL_CALL_TRANSCRIPTS;
  }

  const types = shuffle(['meeting_note', 'call_transcript', 'meeting_note', 'call_transcript']).slice(0, count);

  types.forEach((type, idx) => {
    const daysBack = randomInt(idx * 7 + 2, idx * 7 + 14);
    const template = type === 'meeting_note'
      ? randomFrom(meetingPool)
      : randomFrom(callPool);

    const participants = [deal.sales_agent];
    if (agentInfo && agentInfo.manager) participants.push(agentInfo.manager);
    participants.push(`${deal.account} Contact`);

    interactions.push({
      opportunity_id: deal.opportunity_id,
      type,
      date: daysAgo(daysBack),
      content: template(deal),
      participants,
      sentiment_hint: sentiment, // used by service for validation; not sent to client
    });
  });

  return interactions;
}

// ── Main ────────────────────────────────────────────────────────────────────

function main() {
  console.log('Loading CSV data...');
  const pipeline = readCsv('sales_pipeline.csv');
  const teams = readCsv('sales_teams.csv');

  // Build agent → manager lookup
  const agentMap = {};
  teams.forEach(t => { agentMap[t.sales_agent] = t; });

  // Select which deals to generate interactions for
  const prospecting = pipeline.filter(d => d.deal_stage === 'Prospecting');
  const engaging = pipeline.filter(d => d.deal_stage === 'Engaging');
  const won = shuffle(pipeline.filter(d => d.deal_stage === 'Won')).slice(0, MAX_WON_SAMPLE);
  const lost = shuffle(pipeline.filter(d => d.deal_stage === 'Lost')).slice(0, MAX_LOST_SAMPLE);

  const selected = [...prospecting, ...engaging, ...won, ...lost];
  console.log(`Generating interactions for ${selected.length} deals:`);
  console.log(`  Prospecting: ${prospecting.length}`);
  console.log(`  Engaging: ${engaging.length}`);
  console.log(`  Won (sample): ${won.length}`);
  console.log(`  Lost (sample): ${lost.length}`);

  const allInteractions = [];
  selected.forEach(deal => {
    const agentInfo = agentMap[deal.sales_agent] || null;
    const interactions = buildInteractions(deal, agentInfo);
    allInteractions.push(...interactions);
  });

  fs.writeFileSync(OUT_FILE, JSON.stringify(allInteractions, null, 2));
  console.log(`\nWrote ${allInteractions.length} interactions → ${OUT_FILE}`);
}

main();
