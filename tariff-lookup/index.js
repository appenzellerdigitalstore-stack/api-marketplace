'use strict';
const express = require('express');
const { getPlan } = require('../shared/planFilter');
const { errorResponse } = require('../shared/utils');
const app = express();
app.use(express.json({ strict: false, type: () => true }));
app.use(express.urlencoded({ extended: true }));

// HTS code database (sample entries covering major categories)
const HTS_DB = {
  '8471.30': { description:'Portable automatic data processing machines (laptops)',      unit:'No.',  chapter:'84', section:'Machinery' },
  '8517.12': { description:'Telephones for cellular networks (smartphones)',              unit:'No.',  chapter:'85', section:'Electrical' },
  '8528.72': { description:'Television receivers, color (monitors/TVs)',                 unit:'No.',  chapter:'85', section:'Electrical' },
  '6110.20': { description:'Jerseys, pullovers of cotton (apparel)',                     unit:'doz',  chapter:'61', section:'Textiles' },
  '6204.62': { description:"Women's trousers of cotton",                                 unit:'doz',  chapter:'62', section:'Textiles' },
  '0901.11': { description:'Coffee, not roasted, not decaffeinated',                    unit:'kg',   chapter:'09', section:'Food' },
  '1806.32': { description:'Chocolate in blocks, slabs or bars',                        unit:'kg',   chapter:'18', section:'Food' },
  '8703.23': { description:'Motor vehicles, spark-ignition >1500cc-3000cc',             unit:'No.',  chapter:'87', section:'Vehicles' },
  '2709.00': { description:'Petroleum oils, crude',                                     unit:'bbl',  chapter:'27', section:'Chemicals' },
  '3004.90': { description:'Medicaments (pharmaceutical preparations)',                  unit:'kg',   chapter:'30', section:'Pharma' },
  '9403.20': { description:'Other metal furniture',                                     unit:'No.',  chapter:'94', section:'Furniture' },
  '4202.12': { description:'Trunks, suit-cases, handbags of leather/plastic',           unit:'No.',  chapter:'42', section:'Leather' },
  '8541.10': { description:'Diodes (semiconductor devices)',                             unit:'No.',  chapter:'85', section:'Electrical' },
  '2204.21': { description:'Wine of fresh grapes in containers ≤2L',                   unit:'L',    chapter:'22', section:'Beverages' },
  '0302.13': { description:'Pacific salmon, fresh or chilled',                          unit:'kg',   chapter:'03', section:'Food' },
  '8544.42': { description:'Electric conductors (cables/wires) for voltage ≤1000V',    unit:'kg',   chapter:'85', section:'Electrical' },
  '2710.12': { description:'Light oils and preparations (gasoline)',                    unit:'L',    chapter:'27', section:'Chemicals' },
  '9021.10': { description:'Orthopedic or fracture appliances',                        unit:'No.',  chapter:'90', section:'Medical' },
  '7207.12': { description:'Semi-finished products of iron or non-alloy steel',        unit:'MT',   chapter:'72', section:'Steel' },
  '8802.40': { description:'Aeroplanes and other powered aircraft >15,000kg',          unit:'No.',  chapter:'88', section:'Aircraft' },
};

// Duty rates by origin country for key HTS chapters
const DUTY_RATES = {
  // [hts_chapter]: { destination: { origin: rate_pct } }
  '84': { US:{ CN:25.0, EU:0.0, MX:0.0, JP:0.0, KR:0.0, IN:0.0,  DEFAULT:2.0  },
          EU:{ CN:3.7,  US:3.7, JP:0.0, IN:0.0, DEFAULT:3.7 } },
  '85': { US:{ CN:25.0, EU:0.0, MX:0.0, JP:0.0, KR:0.0, IN:0.0,  DEFAULT:2.7  },
          EU:{ CN:4.5,  US:4.5, JP:0.0, DEFAULT:4.5 } },
  '61': { US:{ CN:20.0, BD:15.9,VN:17.5,IN:11.9,MX:0.0,          DEFAULT:12.0 },
          EU:{ CN:12.0, BD:12.0,VN:12.0,DEFAULT:12.0 } },
  '62': { US:{ CN:20.0, BD:15.9,VN:17.5,IN:11.9,MX:0.0,          DEFAULT:16.0 },
          EU:{ CN:12.0, BD:12.0,DEFAULT:12.0 } },
  '87': { US:{ CN:27.5, EU:2.5, MX:0.0, JP:2.5, KR:0.0,          DEFAULT:2.5  },
          EU:{ CN:10.0, US:10.0,JP:0.0, DEFAULT:6.5 } },
  '27': { US:{ DEFAULT:5.25 }, EU:{ DEFAULT:3.5 } },
  '30': { US:{ CN:25.0,DEFAULT:0.0 }, EU:{ DEFAULT:0.0 } },
  '09': { US:{ DEFAULT:0.0 }, EU:{ DEFAULT:9.0 } },
  '72': { US:{ CN:25.0,EU:25.0,DEFAULT:0.0 }, EU:{ CN:25.0,DEFAULT:3.0 } },
  'DEFAULT': { US:{ CN:7.5,DEFAULT:3.5 }, EU:{ DEFAULT:4.0 } },
};

function getDutyRate(chapter, destination, origin) {
  const destRates = DUTY_RATES[chapter] || DUTY_RATES['DEFAULT'];
  const originRates = destRates[destination] || destRates['US'] || {};
  return originRates[origin] ?? originRates['DEFAULT'] ?? 3.5;
}

function getTradeAgreements(origin, destination) {
  const agreements = {
    'US-MX':{ name:'USMCA',  benefit:'0% duty for qualifying goods',  active:true },
    'US-CA':{ name:'USMCA',  benefit:'0% duty for qualifying goods',  active:true },
    'US-KR':{ name:'KORUS',  benefit:'Reduced/zero duties most goods',active:true },
    'US-JP':{ name:'US-Japan Trade Agreement', benefit:'Partial tariff reduction',active:true },
    'US-AU':{ name:'AUSFTA', benefit:'Zero duty most manufactured goods',active:true },
    'EU-JP':{ name:'EPA',    benefit:'Near-zero duties',               active:true },
    'EU-KR':{ name:'EU-Korea FTA', benefit:'Phased duty elimination',  active:true },
    'EU-CA':{ name:'CETA',   benefit:'97% tariff-free trade',          active:true },
    'US-CN':{ name:'Section 301 Tariffs', benefit:'ADDITIONAL 25% on many goods',active:true,type:'penalty' },
    'EU-CN':{ name:'EU-China Investment Agreement', benefit:'Suspended — limited benefit',active:false },
  };
  const key1 = `${destination}-${origin}`;
  const key2 = `${origin}-${destination}`;
  return [agreements[key1],agreements[key2]].filter(Boolean);
}

app.post('/api/tariff-lookup', (req, res) => {
  const plan = getPlan(req);
  const { hts_code, product_description, origin_country, destination_country, value_usd } = { ...req.query, ...req.body };

  if (!hts_code && !product_description) return errorResponse(res,400,'Provide hts_code or product_description');
  if (!origin_country || !destination_country) return errorResponse(res,400,'origin_country and destination_country are required');

  const origin = origin_country.toUpperCase();
  const dest   = destination_country.toUpperCase();

  // Find HTS entry
  let htsEntry = null, htsKey = hts_code;
  if (hts_code) {
    const normalized = String(hts_code).replace(/\./g,'').slice(0,6);
    const formatted  = normalized.slice(0,4)+'.'+normalized.slice(4,6);
    htsEntry = HTS_DB[formatted] || HTS_DB[hts_code];
    htsKey   = formatted;
  } else {
    // Keyword match
    const keyword = product_description.toLowerCase();
    for (const [code, entry] of Object.entries(HTS_DB)) {
      if (entry.description.toLowerCase().includes(keyword.split(' ')[0])) {
        htsEntry = entry; htsKey = code; break;
      }
    }
  }

  const chapter  = htsKey ? htsKey.replace('.','').slice(0,2) : '84';
  const dutyRate = getDutyRate(chapter, dest, origin);
  const agreements = plan!=='free' ? getTradeAgreements(origin,dest) : [];
  const valueNum   = parseFloat(value_usd) || 0;
  const dutyAmount = valueNum ? +(valueNum * dutyRate / 100).toFixed(2) : null;

  const response = {
    success:true, looked_up_at:new Date().toISOString(),
    hts_code:htsKey, origin:origin, destination:dest,
    duty_rate_pct: dutyRate,
    duty_rate_label: dutyRate===0?'Free':dutyRate+'%',
    estimated_duty_usd: dutyAmount,
    plan,
  };

  if (plan==='free') return res.json(response);

  response.hts_details    = htsEntry || { description:product_description||'Not found', chapter, section:'General' };
  response.trade_agreements = agreements;
  response.additional_fees = {
    merchandise_processing_fee: dest==='US' ? Math.max(27.23,Math.min(528.33,valueNum*0.003464)) : null,
    harbor_maintenance_fee:     dest==='US' ? +(valueNum*0.00125).toFixed(2) : null,
    vat:                        dest==='DE'?19:dest==='FR'?20:dest==='GB'?20:dest==='AU'?10:dest==='CA'?5:null,
  };

  if (plan==='ultra'||plan==='mega') {
    response.landed_cost_estimate = valueNum ? {
      product_value:valueNum,
      estimated_duty:dutyAmount,
      mpf: dest==='US'?+(valueNum*0.003464).toFixed(2):0,
      freight_estimate: +(valueNum*0.08).toFixed(2),
      insurance:+(valueNum*0.005).toFixed(2),
      total_landed:+(valueNum+(dutyAmount||0)+valueNum*0.085).toFixed(2),
    } : null;
    response.compliance_notes = [
      origin==='CN'&&dest==='US' ? 'Section 301 tariffs apply — verify current rate for specific HTS' : null,
      origin==='RU'||origin==='BY' ? 'Sanctions restrictions may apply — verify OFAC compliance' : null,
      'Verify de minimis thresholds: $800 (US), €150 (EU)',
      'Country of origin rules may require substantial transformation documentation',
    ].filter(Boolean);
  }

  res.json(response);
});

if (require.main===module) { const PORT=process.env.PORT||3033; app.listen(PORT,()=>console.log(`tariff-lookup on ${PORT}`)); }
module.exports = app;
