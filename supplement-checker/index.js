/**
 * /api/supplement-checker
 * Analyze supplement stacks for dangerous interactions, overdose risks,
 * timing recommendations, efficacy evidence levels, and cost-effectiveness.
 */
'use strict';

const express = require('express');
const { getPlan } = require('../shared/planFilter');
const { errorResponse } = require('../shared/utils');

const app = express();
app.use(express.json({ strict: false, type: () => true }));
app.use(express.urlencoded({ extended: true }));

// ── Supplement database ─────────────────────────────────────────────────────
const SUPPLEMENTS = {
  'vitamin d': {
    aliases: ['vitamin d3','cholecalciferol','d3'],
    category: 'vitamin', upper_limit_iu: 4000, typical_dose: '1000-2000 IU',
    evidence: 'strong', benefits: ['bone health','immune function','mood','testosterone'],
    timing: 'with fat-containing meal', fat_soluble: true,
    drug_interactions: ['thiazide diuretics','calcium channel blockers'],
    overdose_risk: 'hypercalcemia above 4000 IU/day',
  },
  'magnesium': {
    aliases: ['magnesium glycinate','magnesium citrate','magnesium oxide','mag'],
    category: 'mineral', upper_limit_mg: 350, typical_dose: '200-400mg',
    evidence: 'strong', benefits: ['sleep','muscle recovery','stress','blood pressure'],
    timing: 'evening / before bed', fat_soluble: false,
    drug_interactions: ['antibiotics (tetracycline)','bisphosphonates','diuretics'],
    overdose_risk: 'diarrhea above 350mg supplemental; severe toxicity rare',
  },
  'omega 3': {
    aliases: ['fish oil','epa','dha','omega-3','krill oil'],
    category: 'fatty acid', upper_limit_g: 5, typical_dose: '1-3g EPA+DHA',
    evidence: 'strong', benefits: ['heart health','inflammation','brain health','triglycerides'],
    timing: 'with meals', fat_soluble: true,
    drug_interactions: ['blood thinners (warfarin)','aspirin','antiplatelet drugs'],
    overdose_risk: 'bleeding risk above 5g/day',
  },
  'vitamin c': {
    aliases: ['ascorbic acid','l-ascorbic acid','ascorbate'],
    category: 'vitamin', upper_limit_mg: 2000, typical_dose: '500-1000mg',
    evidence: 'strong', benefits: ['immune function','antioxidant','collagen synthesis','iron absorption'],
    timing: 'with meals (reduces GI distress)', fat_soluble: false,
    drug_interactions: ['chemotherapy drugs','warfarin','statins'],
    overdose_risk: 'GI distress, kidney stones above 2000mg/day',
  },
  'zinc': {
    aliases: ['zinc gluconate','zinc picolinate','zinc oxide'],
    category: 'mineral', upper_limit_mg: 40, typical_dose: '15-30mg',
    evidence: 'strong', benefits: ['immune function','testosterone','wound healing','taste/smell'],
    timing: 'with food (reduces nausea)', fat_soluble: false,
    drug_interactions: ['antibiotics (quinolones, tetracyclines)','penicillamine'],
    overdose_risk: 'copper depletion above 40mg/day; nausea at high doses',
  },
  'vitamin b12': {
    aliases: ['cyanocobalamin','methylcobalamin','b12','cobalamin'],
    category: 'vitamin', upper_limit_mcg: null, typical_dose: '250-1000mcg',
    evidence: 'strong', benefits: ['energy','nerve function','red blood cells','mood'],
    timing: 'morning (may cause alertness)', fat_soluble: false,
    drug_interactions: ['metformin','proton pump inhibitors','H2 blockers'],
    overdose_risk: 'no established upper limit; generally safe at high doses',
  },
  'iron': {
    aliases: ['ferrous sulfate','ferrous gluconate','ferric'],
    category: 'mineral', upper_limit_mg: 45, typical_dose: '18-45mg',
    evidence: 'strong', benefits: ['red blood cells','oxygen transport','energy','cognitive function'],
    timing: 'empty stomach or with vitamin C', fat_soluble: false,
    drug_interactions: ['antacids','calcium','coffee','tea (tannins)','quinolone antibiotics'],
    overdose_risk: 'GI damage above 45mg; potentially fatal in children',
  },
  'creatine': {
    aliases: ['creatine monohydrate','creatine hcl'],
    category: 'performance', upper_limit_g: null, typical_dose: '3-5g/day',
    evidence: 'very strong', benefits: ['muscle strength','power output','cognitive function','recovery'],
    timing: 'post-workout or any consistent time', fat_soluble: false,
    drug_interactions: ['NSAIDs','nephrotoxic drugs','caffeine (may reduce efficacy)'],
    overdose_risk: 'GI distress at high doses; kidney stress in pre-existing conditions',
  },
  'ashwagandha': {
    aliases: ['withania somnifera','ksm-66','sensoril'],
    category: 'adaptogen', upper_limit_mg: 600, typical_dose: '300-600mg',
    evidence: 'moderate', benefits: ['stress reduction','cortisol','testosterone','sleep quality'],
    timing: 'evening with food', fat_soluble: false,
    drug_interactions: ['thyroid medications','immunosuppressants','sedatives','CNS depressants'],
    overdose_risk: 'liver toxicity reported at high doses; avoid in autoimmune conditions',
  },
  'caffeine': {
    aliases: ['coffee','caffeine anhydrous','guarana'],
    category: 'stimulant', upper_limit_mg: 400, typical_dose: '100-200mg',
    evidence: 'very strong', benefits: ['alertness','performance','focus','fat oxidation'],
    timing: 'morning or pre-workout (avoid after 2pm for sleep)', fat_soluble: false,
    drug_interactions: ['MAOIs','ephedrine','adenosine antagonists','blood pressure meds'],
    overdose_risk: 'anxiety, palpitations, insomnia above 400mg/day',
  },
  'melatonin': {
    aliases: ['melatonin','sleep supplement'],
    category: 'hormone', upper_limit_mg: 10, typical_dose: '0.5-5mg',
    evidence: 'strong', benefits: ['sleep onset','jet lag','circadian rhythm'],
    timing: '30-60 min before bed', fat_soluble: false,
    drug_interactions: ['blood thinners','diabetes medications','CNS depressants','immunosuppressants'],
    overdose_risk: 'drowsiness, hormonal effects; less is more (0.5mg often as effective as 5mg)',
  },
  'vitamin k2': {
    aliases: ['menaquinone','mk-7','mk-4','k2'],
    category: 'vitamin', upper_limit_mcg: null, typical_dose: '100-200mcg',
    evidence: 'moderate-strong', benefits: ['bone density','cardiovascular health','calcium utilization'],
    timing: 'with fat-containing meal (pairs with D3)', fat_soluble: true,
    drug_interactions: ['warfarin (SERIOUS - reduces effectiveness)','blood thinners'],
    overdose_risk: 'no established upper limit for MK-7; warfarin interaction is serious',
  },
  'collagen': {
    aliases: ['collagen peptides','hydrolyzed collagen','type i collagen','type ii collagen'],
    category: 'protein', upper_limit_g: null, typical_dose: '10-20g',
    evidence: 'moderate', benefits: ['skin elasticity','joint health','gut lining','hair/nails'],
    timing: 'with vitamin C for optimal synthesis', fat_soluble: false,
    drug_interactions: ['minimal known interactions'],
    overdose_risk: 'generally safe; high doses may cause GI upset',
  },
  'probiotics': {
    aliases: ['lactobacillus','bifidobacterium','probiotic','live cultures'],
    category: 'microbiome', upper_limit_cfu: null, typical_dose: '1-50 billion CFU',
    evidence: 'moderate-strong', benefits: ['gut health','immune function','IBS','mental health'],
    timing: 'with or before meals', fat_soluble: false,
    drug_interactions: ['antibiotics (take 2h apart)','immunosuppressants'],
    overdose_risk: 'GI discomfort initially; generally safe at standard doses',
  },
  'turmeric': {
    aliases: ['curcumin','turmeric extract','curcuma longa'],
    category: 'botanical', upper_limit_mg: 8000, typical_dose: '500-2000mg curcumin',
    evidence: 'moderate', benefits: ['anti-inflammatory','antioxidant','joint health','brain health'],
    timing: 'with black pepper (piperine) and fat for absorption', fat_soluble: true,
    drug_interactions: ['blood thinners','diabetes medications','stomach acid reducers','chemotherapy'],
    overdose_risk: 'GI upset, iron absorption interference at very high doses',
  },
};

// ── Known dangerous interaction pairs ──────────────────────────────────────
const INTERACTIONS = [
  { sups: ['vitamin d','calcium'], severity: 'warning', message: 'High-dose D3 + Calcium can cause hypercalcemia. Monitor calcium levels.' },
  { sups: ['vitamin k2','warfarin'], severity: 'dangerous', message: 'K2 reduces warfarin effectiveness. CONSULT PHYSICIAN before combining.' },
  { sups: ['iron','calcium'], severity: 'warning', message: 'Calcium inhibits iron absorption. Take at least 2 hours apart.' },
  { sups: ['iron','zinc'], severity: 'warning', message: 'High-dose iron competes with zinc absorption. Separate doses.' },
  { sups: ['magnesium','calcium'], severity: 'info', message: 'Compete for absorption at high doses. Taking separately can improve uptake.' },
  { sups: ['melatonin','ashwagandha'], severity: 'warning', message: 'Both have sedative effects. May increase drowsiness. Avoid daytime use.' },
  { sups: ['caffeine','melatonin'], severity: 'warning', message: 'Caffeine counteracts melatonin. Avoid caffeine within 6-8 hours of melatonin dose.' },
  { sups: ['omega 3','vitamin e'], severity: 'info', message: 'Both have blood-thinning properties. High doses combined increase bleeding risk.' },
  { sups: ['vitamin c','iron'], severity: 'positive', message: 'Vitamin C significantly enhances non-heme iron absorption. Beneficial combination.' },
  { sups: ['vitamin d','vitamin k2'], severity: 'positive', message: 'Synergistic: K2 directs calcium (mobilized by D3) to bones, not arteries. Recommended pair.' },
  { sups: ['creatine','caffeine'], severity: 'info', message: 'Some evidence suggests caffeine may blunt creatine loading. Effect is debated.' },
  { sups: ['turmeric','black pepper'], severity: 'positive', message: 'Piperine in black pepper increases curcumin bioavailability by up to 2000%.' },
];

// ── Normalize supplement name ────────────────────────────────────────────────
function normalizeSupplement(name) {
  const n = name.toLowerCase().trim();
  for (const [key, info] of Object.entries(SUPPLEMENTS)) {
    if (n === key || (info.aliases && info.aliases.some(a => n.includes(a) || a.includes(n)))) {
      return key;
    }
  }
  return null;
}

// ── Check interactions between a set of supplements ─────────────────────────
function checkInteractions(normalizedSupps) {
  const found = [];
  for (const interaction of INTERACTIONS) {
    if (interaction.sups.every(s => normalizedSupps.some(n => n.includes(s) || s.includes(n)))) {
      found.push(interaction);
    }
  }
  return found;
}

// ── Main route ───────────────────────────────────────────────────────────────
app.post('/api/supplement-checker', (req, res) => {
  const plan = getPlan(req);
  const { supplements, goal, age, weight_kg } = { ...req.query, ...req.body };

  if (!supplements) {
    return errorResponse(res, 400, '"supplements" is required — array or comma-separated string');
  }

  const rawList = Array.isArray(supplements)
    ? supplements.map(String)
    : String(supplements).split(',').map(s => s.trim());

  const analyzed = [];
  const notFound = [];
  const normalized = [];

  for (const raw of rawList.slice(0, plan === 'free' ? 3 : 15)) {
    const key = normalizeSupplement(raw);
    if (!key) { notFound.push(raw); continue; }
    normalized.push(key);
    const info = SUPPLEMENTS[key];

    const entry = {
      supplement: key,
      query: raw,
      found: true,
      category: info.category,
      typical_dose: info.typical_dose,
      evidence_level: info.evidence,
    };

    if (plan !== 'free') {
      entry.benefits = info.benefits;
      entry.best_timing = info.timing;
      entry.fat_soluble = info.fat_soluble;
      entry.overdose_risk = info.overdose_risk;
      if (info.upper_limit_mg) entry.upper_limit = info.upper_limit_mg + 'mg';
      else if (info.upper_limit_iu) entry.upper_limit = info.upper_limit_iu + 'IU';
      else if (info.upper_limit_g) entry.upper_limit = info.upper_limit_g + 'g';
      else entry.upper_limit = 'Not established';
    }

    if (plan === 'ultra' || plan === 'mega') {
      entry.drug_interactions = info.drug_interactions;
    }

    analyzed.push(entry);
  }

  const interactions = checkInteractions(normalized);
  const dangerous    = interactions.filter(i => i.severity === 'dangerous');
  const warnings     = interactions.filter(i => i.severity === 'warning');
  const positive     = interactions.filter(i => i.severity === 'positive');

  const response = {
    success: true,
    analyzed_at: new Date().toISOString(),
    supplements_analyzed: analyzed.length,
    supplements_not_found: notFound,
    overall_safety: dangerous.length > 0 ? 'DANGEROUS' : warnings.length > 0 ? 'CAUTION' : 'GENERALLY SAFE',
    dangerous_interactions: dangerous.length,
    warning_interactions: warnings.length,
    beneficial_combinations: positive.length,
    plan,
  };

  if (plan === 'free') {
    response.supplements = analyzed.map(a => ({ supplement: a.supplement, category: a.category, evidence_level: a.evidence_level }));
    response.interactions_summary = interactions.map(i => ({ severity: i.severity, involved: i.sups }));
    return res.json(response);
  }

  response.supplements = analyzed;
  response.interactions = interactions;

  if (plan === 'ultra' || plan === 'mega') {
    response.timing_schedule = buildTimingSchedule(analyzed);
    response.stack_rating = {
      overall: dangerous.length > 0 ? 20 : 100 - warnings.length * 15 + positive.length * 10,
      notes: dangerous.length > 0 ? 'Stack contains dangerous interactions — modify before use' : 'Stack appears well-structured',
    };
    if (goal) {
      response.goal_alignment = analyzeGoalAlignment(normalized, goal);
    }
  }

  res.json(response);
});

function buildTimingSchedule(supplements) {
  const schedule = { morning: [], afternoon: [], evening: [], with_meal: [], without_food: [] };
  supplements.forEach(s => {
    const info = SUPPLEMENTS[s.supplement];
    if (!info) return;
    if (info.timing.includes('morning')) schedule.morning.push(s.supplement);
    else if (info.timing.includes('evening') || info.timing.includes('bed')) schedule.evening.push(s.supplement);
    else if (info.timing.includes('pre-workout')) schedule.afternoon.push(s.supplement);
    if (info.timing.includes('meal') || info.fat_soluble) schedule.with_meal.push(s.supplement);
    if (info.timing.includes('empty')) schedule.without_food.push(s.supplement);
  });
  return schedule;
}

function analyzeGoalAlignment(normalized, goal) {
  const goalMap = {
    'muscle': ['creatine','vitamin d','zinc','magnesium','vitamin b12','protein'],
    'sleep': ['melatonin','magnesium','ashwagandha','vitamin d'],
    'immune': ['vitamin c','vitamin d','zinc','probiotics'],
    'energy': ['vitamin b12','iron','magnesium','vitamin d','creatine'],
    'joint': ['omega 3','collagen','turmeric','vitamin c'],
    'weight loss': ['caffeine','omega 3','vitamin d','probiotics'],
  };

  const relevant = goalMap[goal.toLowerCase()] || [];
  const aligned  = normalized.filter(s => relevant.some(r => s.includes(r) || r.includes(s)));
  const missing  = relevant.filter(r => !normalized.some(n => n.includes(r) || r.includes(n))).slice(0, 3);

  return {
    goal,
    aligned_supplements: aligned,
    suggested_additions: missing,
    goal_coverage: Math.round(aligned.length / Math.max(1, relevant.length) * 100) + '%',
  };
}

if (require.main === module) {
  const PORT = process.env.PORT || 3025;
  app.listen(PORT, () => console.log(`supplement-checker running on port ${PORT}`));
}
module.exports = app;
