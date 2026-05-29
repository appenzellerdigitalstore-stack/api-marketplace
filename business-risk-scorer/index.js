'use strict';
const express = require('express');
const { getPlan } = require('../shared/planFilter');
const { errorResponse, fetchPage, normalizeUrl } = require('../shared/utils');
const app = express();
app.use(express.json({ strict: false, type: () => true }));
app.use(express.urlencoded({ extended: true }));

const INDUSTRY_RISK = {
  'technology':    { base:25, volatility:'medium', outlook:'positive' },
  'retail':        { base:45, volatility:'high',   outlook:'challenging' },
  'restaurant':    { base:60, volatility:'high',   outlook:'challenging' },
  'construction':  { base:50, volatility:'high',   outlook:'neutral' },
  'healthcare':    { base:20, volatility:'low',     outlook:'stable' },
  'finance':       { base:30, volatility:'medium', outlook:'stable' },
  'manufacturing': { base:35, volatility:'medium', outlook:'neutral' },
  'real estate':   { base:40, volatility:'medium', outlook:'mixed' },
  'logistics':     { base:38, volatility:'medium', outlook:'positive' },
  'legal':         { base:15, volatility:'low',     outlook:'stable' },
  'education':     { base:20, volatility:'low',     outlook:'stable' },
  'hospitality':   { base:55, volatility:'high',   outlook:'mixed' },
  'energy':        { base:45, volatility:'high',   outlook:'mixed' },
  'media':         { base:50, volatility:'high',   outlook:'challenging' },
};

function seed(s){ return Math.abs(s.split('').reduce((a,c)=>(a*31+c.charCodeAt(0))&0xFFFFFFFF,0)); }

async function analyzeWebPresence(domain) {
  if (!domain) return { score:0, signals:[] };
  const signals = [];
  let score = 0;
  try {
    const url = normalizeUrl('https://'+domain.replace(/^https?:\/\//,''));
    const { response } = await fetchPage(url);
    if (response.status===200) { score+=20; signals.push({ factor:'website_live', positive:true }); }
    const html = response.data || '';
    if (html.includes('ssl')||html.includes('https')) { score+=5; signals.push({ factor:'ssl_present', positive:true }); }
    if (html.match(/\d{3}[-.\s]\d{3}[-.\s]\d{4}/)) { score+=5; signals.push({ factor:'phone_listed', positive:true }); }
    if (html.toLowerCase().includes('about')) { score+=5; signals.push({ factor:'about_page', positive:true }); }
    if (html.toLowerCase().includes('terms')) { score+=5; signals.push({ factor:'legal_pages', positive:true }); }
    if (html.toLowerCase().includes('linkedin.com')) { score+=5; signals.push({ factor:'linkedin_linked', positive:true }); }
  } catch { signals.push({ factor:'website_unreachable', positive:false }); }
  return { score:Math.min(50,score), signals };
}

function scoreFinancials({ revenue, years_in_business, employees, industry }) {
  const signals = [];
  let score = 50; // neutral start

  if (years_in_business!==undefined) {
    const yib = parseInt(years_in_business);
    if (yib<1)      { score+=30; signals.push({ factor:'startup_lt_1yr',    risk_added:30, detail:'Less than 1 year in business — highest failure risk' }); }
    else if (yib<3) { score+=15; signals.push({ factor:'early_stage_1_3yr', risk_added:15, detail:'1-3 years — early stage, elevated risk' }); }
    else if (yib>10){ score-=15; signals.push({ factor:'established_10yr',  risk_added:-15,detail:'10+ years — established business, lower risk' }); }
  }
  if (employees!==undefined) {
    const emp = parseInt(employees);
    if (emp<5)        { score+=10; signals.push({ factor:'micro_business',  risk_added:10, detail:'Fewer than 5 employees — concentration risk' }); }
    else if (emp>100) { score-=10; signals.push({ factor:'mid_size_plus',   risk_added:-10,detail:'100+ employees — organizational stability' }); }
  }
  if (revenue!==undefined) {
    const rev = parseFloat(String(revenue).replace(/[^0-9.]/g,''));
    if (rev<50000)   { score+=20; signals.push({ factor:'low_revenue',    risk_added:20, detail:'Revenue <$50K — very early stage' }); }
    else if (rev>1e6){ score-=10; signals.push({ factor:'7fig_revenue',   risk_added:-10,detail:'$1M+ revenue — meaningful operating scale' }); }
  }

  const industryData = INDUSTRY_RISK[industry?.toLowerCase()] || { base:40 };
  score = Math.round(score * 0.6 + industryData.base * 0.4);
  return { financial_risk_score:Math.min(100,Math.max(0,score)), signals };
}

app.post('/api/business-risk-scorer', async (req, res) => {
  const plan = getPlan(req);
  const { company_name, domain, industry, years_in_business, employees, revenue, country } = { ...req.query, ...req.body };
  if (!company_name && !domain) return errorResponse(res,400,'Provide company_name or domain');

  const dom = domain || (company_name ? company_name.toLowerCase().replace(/\s+/g,'')+'.com' : null);
  const s   = seed(company_name||domain||'');

  const financials   = scoreFinancials({ revenue, years_in_business, employees, industry });
  const webPresence  = plan!=='free' ? await analyzeWebPresence(dom) : { score:0, signals:[] };
  const industryData = INDUSTRY_RISK[industry?.toLowerCase()] || { base:40, volatility:'medium', outlook:'unknown' };

  const compositeScore = Math.min(100, Math.round(
    financials.financial_risk_score * 0.5 +
    (100 - webPresence.score) * 0.2 +
    industryData.base * 0.3
  ));
  const riskLevel = compositeScore>=70?'HIGH':compositeScore>=45?'MEDIUM':compositeScore>=25?'LOW':'VERY LOW';

  const response = {
    success:true, analyzed_at:new Date().toISOString(),
    company: company_name||dom,
    overall_risk_score: compositeScore,
    risk_level: riskLevel,
    creditworthiness: compositeScore>=70?'Poor':compositeScore>=45?'Fair':compositeScore>=25?'Good':'Excellent',
    recommended_payment_terms: compositeScore>=70?'Prepayment or COD':compositeScore>=45?'Net 15 with deposit':compositeScore>=25?'Net 30':'Net 60',
    plan,
  };

  if (plan==='free') return res.json(response);

  response.risk_breakdown = {
    financial_risk: financials.financial_risk_score,
    web_presence_score: webPresence.score*2,
    industry_risk: industryData.base,
  };
  response.industry_outlook = { industry:industry||'Unknown', ...industryData };
  response.signals = [...financials.signals, ...webPresence.signals];

  if (plan==='ultra'||plan==='mega') {
    response.recommendations = [
      compositeScore>=70 ? { action:'Require prepayment or personal guarantee',  priority:'HIGH' } : null,
      compositeScore>=45 ? { action:'Request 3 trade references before extending credit', priority:'MEDIUM' } : null,
      { action:'Monitor quarterly — re-score every 90 days', priority:'LOW' },
    ].filter(Boolean);
    response.similar_risk_profile = `Similar to ${compositeScore>=70?'early-stage startup or distressed business':compositeScore>=45?'growing SMB with moderate risk':compositeScore>=25?'stable SMB':'established enterprise'}`;
  }

  res.json(response);
});

if (require.main===module) { const PORT=process.env.PORT||3034; app.listen(PORT,()=>console.log(`business-risk-scorer on ${PORT}`)); }
module.exports = app;
