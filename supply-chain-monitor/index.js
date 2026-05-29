'use strict';
const express = require('express');
const { getPlan } = require('../shared/planFilter');
const { errorResponse } = require('../shared/utils');
const app = express();
app.use(express.json({ strict: false, type: () => true }));
app.use(express.urlencoded({ extended: true }));

const RISK_EVENTS = [
  { type:'port_congestion',     region:'Asia-Pacific', severity:'high',   description:'Major port delays at Shanghai — 4-8 day backlogs reported', affected_routes:['CN→US','CN→EU'] },
  { type:'geopolitical',        region:'Eastern Europe',severity:'critical',description:'Trade route disruptions affecting Eastern Europe logistics', affected_routes:['RU→EU','UA→EU'] },
  { type:'weather',             region:'Gulf of Mexico',severity:'medium', description:'Hurricane season impacting Gulf Coast port operations', affected_routes:['US Gulf→LatAm'] },
  { type:'labor_strike',        region:'West Coast US', severity:'high',   description:'Dockworker negotiations affecting Los Angeles/Long Beach ports', affected_routes:['Asia→US West'] },
  { type:'capacity_shortage',   region:'Global',        severity:'medium', description:'Container shortage causing rate spikes on major trade lanes', affected_routes:['All major lanes'] },
  { type:'raw_material',        region:'Southeast Asia',severity:'medium', description:'Semiconductor supply tightening — lead times extending 8-12 weeks', affected_routes:['TW→US','KR→US'] },
  { type:'regulatory',          region:'European Union',severity:'low',    description:'New EU carbon border tax affecting import costs', affected_routes:['Non-EU→EU'] },
  { type:'infrastructure',      region:'Panama Canal',  severity:'high',   description:'Panama Canal water levels restricting vessel transit capacity', affected_routes:['Asia→US East'] },
];

const COUNTRY_RISK = {
  'CN':{ score:62, factors:['geopolitical tension','regulatory unpredictability','IP risk'], label:'Medium-High' },
  'US':{ score:20, factors:['labor costs','regulatory compliance'], label:'Low' },
  'DE':{ score:18, factors:['energy costs'], label:'Low' },
  'IN':{ score:45, factors:['infrastructure gaps','customs delays'], label:'Medium' },
  'MX':{ score:38, factors:['security concerns','border delays'], label:'Medium-Low' },
  'VN':{ score:35, factors:['infrastructure','skilled labor shortages'], label:'Medium-Low' },
  'BR':{ score:52, factors:['currency volatility','bureaucracy','corruption index'], label:'Medium' },
  'NG':{ score:78, factors:['political instability','currency risk','infrastructure'], label:'High' },
  'RU':{ score:95, factors:['sanctions','geopolitical isolation','payment restrictions'], label:'Very High' },
  'TW':{ score:55, factors:['geopolitical tension with China'], label:'Medium' },
  'JP':{ score:22, factors:['natural disaster risk','aging workforce'], label:'Low' },
  'KR':{ score:28, factors:['geopolitical proximity to DPRK'], label:'Low-Medium' },
  'TH':{ score:40, factors:['political uncertainty','flooding risk'], label:'Medium' },
  'ID':{ score:43, factors:['infrastructure','regulatory complexity'], label:'Medium' },
};

const INDUSTRIES = {
  'electronics':   { risk:'high',   bottlenecks:['rare earth minerals','chip fabs','display panels'], lead_time:'12-24 weeks' },
  'automotive':    { risk:'high',   bottlenecks:['semiconductors','battery cells','steel'], lead_time:'8-16 weeks' },
  'pharmaceuticals':{ risk:'medium',bottlenecks:['API ingredients','glass vials','cold chain'], lead_time:'6-12 weeks' },
  'apparel':       { risk:'medium', bottlenecks:['cotton','synthetic fibers','dyes'], lead_time:'8-14 weeks' },
  'food':          { risk:'medium', bottlenecks:['fertilizer','shipping containers','cold storage'], lead_time:'2-6 weeks' },
  'construction':  { risk:'medium', bottlenecks:['lumber','steel','concrete'], lead_time:'4-8 weeks' },
  'chemicals':     { risk:'high',   bottlenecks:['feedstocks','transport regulations','storage'], lead_time:'6-10 weeks' },
  'logistics':     { risk:'low',    bottlenecks:['fuel costs','driver shortage','port capacity'], lead_time:'1-3 weeks' },
};

app.post('/api/supply-chain-monitor', (req, res) => {
  const plan = getPlan(req);
  const { industry, countries, product_category, alert_severity } = { ...req.query, ...req.body };
  if (!industry && !countries && !product_category) return errorResponse(res,400,'Provide industry, countries, or product_category');

  const countryList = countries ? (Array.isArray(countries)?countries:String(countries).split(',').map(s=>s.trim().toUpperCase())) : [];
  const minSeverity = alert_severity || 'low';
  const severityOrder = { critical:4, high:3, medium:2, low:1 };
  const minLevel = severityOrder[minSeverity] || 1;

  const activeAlerts = RISK_EVENTS.filter(e => severityOrder[e.severity] >= minLevel);
  const industryData = industry ? INDUSTRIES[industry.toLowerCase()] : null;
  const countryRisks = countryList.map(c => ({ country:c, ...(COUNTRY_RISK[c] || { score:50, factors:['limited data'], label:'Unknown' }) }));

  const overallRisk = countryRisks.length
    ? Math.round(countryRisks.reduce((a,c)=>a+c.score,0)/countryRisks.length)
    : activeAlerts.filter(a=>a.severity==='critical').length*20 + activeAlerts.filter(a=>a.severity==='high').length*10;

  const response = {
    success:true, generated_at:new Date().toISOString(),
    overall_risk_score: Math.min(100,overallRisk),
    risk_level: overallRisk>=70?'HIGH':overallRisk>=40?'MEDIUM':'LOW',
    active_alerts: activeAlerts.length,
    critical_alerts: activeAlerts.filter(a=>a.severity==='critical').length,
    alerts: plan==='free' ? activeAlerts.slice(0,2).map(a=>({type:a.type,severity:a.severity,region:a.region})) : activeAlerts,
    plan,
  };

  if (plan!=='free') {
    response.country_risk_analysis = countryRisks;
    if (industryData) response.industry_analysis = { industry, ...industryData };
    response.risk_summary = { geopolitical: activeAlerts.filter(a=>a.type==='geopolitical').length, logistics: activeAlerts.filter(a=>['port_congestion','capacity_shortage','infrastructure'].includes(a.type)).length, weather: activeAlerts.filter(a=>a.type==='weather').length };
  }
  if (plan==='ultra'||plan==='mega') {
    response.recommendations = [
      overallRisk>=70 ? { priority:'HIGH', action:'Diversify supplier base — reduce single-country dependency immediately' } : null,
      industryData?.risk==='high' ? { priority:'HIGH', action:`Build ${industryData.lead_time} safety stock buffer for critical components` } : null,
      { priority:'MEDIUM', action:'Review contracts for force majeure clauses covering current active disruptions' },
      { priority:'LOW',    action:'Enable real-time freight tracking for all active shipments' },
    ].filter(Boolean);
    response.forecast = { next_30_days:overallRisk>=70?'Deteriorating':'Stable', trend: overallRisk>=60?'worsening':'improving' };
  }

  res.json(response);
});

if (require.main===module) { const PORT=process.env.PORT||3031; app.listen(PORT,()=>console.log(`supply-chain-monitor on ${PORT}`)); }
module.exports = app;
