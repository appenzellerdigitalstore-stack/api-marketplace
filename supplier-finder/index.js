'use strict';
const express = require('express');
const { getPlan } = require('../shared/planFilter');
const { errorResponse } = require('../shared/utils');
const app = express();
app.use(express.json({ strict: false, type: () => true }));
app.use(express.urlencoded({ extended: true }));

const SUPPLIER_DB = {
  'electronics': {
    'CN': [{ name:'Foxconn Technology Group',moq:'10,000 units',lead_time:'8 weeks',certifications:['ISO 9001','ISO 14001'],rating:4.1,sample_available:true },
            { name:'BYD Electronics',         moq:'5,000 units', lead_time:'10 weeks',certifications:['IATF 16949','ISO 9001'],rating:4.3,sample_available:true }],
    'TW': [{ name:'Pegatron Corporation',     moq:'20,000 units',lead_time:'6 weeks', certifications:['ISO 9001'],rating:4.0,sample_available:false }],
    'KR': [{ name:'Samsung Electro-Mechanics',moq:'50,000 units',lead_time:'12 weeks',certifications:['ISO 9001','IATF 16949'],rating:4.5,sample_available:true }],
    'VN': [{ name:'Hanwha Q Cells Vietnam',   moq:'1,000 units', lead_time:'6 weeks', certifications:['ISO 9001'],rating:3.9,sample_available:true }],
  },
  'apparel': {
    'CN': [{ name:'Shenzhou International',moq:'500 pcs',  lead_time:'45 days',certifications:['OEKO-TEX','GOTS'],rating:4.2,sample_available:true },
            { name:'Crystal International', moq:'1,000 pcs',lead_time:'60 days',certifications:['BSCI','ISO 9001'],rating:4.4,sample_available:true }],
    'BD': [{ name:'DBL Group',             moq:'300 pcs',  lead_time:'60 days',certifications:['GOTS','WRAP'],rating:4.0,sample_available:true },
            { name:'Ha-Meem Group',         moq:'500 pcs',  lead_time:'50 days',certifications:['BSCI','OEKO-TEX'],rating:3.8,sample_available:true }],
    'IN': [{ name:'Arvind Limited',        moq:'200 pcs',  lead_time:'40 days',certifications:['GOTS','BCI','ISO 9001'],rating:4.3,sample_available:true }],
    'VN': [{ name:'Vinatex Group',         moq:'500 pcs',  lead_time:'55 days',certifications:['WRAP','OEKO-TEX'],rating:4.1,sample_available:true }],
  },
  'food': {
    'US': [{ name:'Cargill Inc',moq:'1 MT',lead_time:'2 weeks',certifications:['SQF','HACCP','Organic'],rating:4.5,sample_available:true },
            { name:'ADM (Archer Daniels Midland)',moq:'5 MT',lead_time:'3 weeks',certifications:['HACCP','Non-GMO Project'],rating:4.3,sample_available:true }],
    'BR': [{ name:'JBS S.A.',  moq:'10 MT',lead_time:'4 weeks',certifications:['HACCP','ISO 22000'],rating:3.9,sample_available:false }],
    'TH': [{ name:'Thai Union Group',moq:'2 MT',lead_time:'3 weeks',certifications:['ASC','MSC','HACCP'],rating:4.2,sample_available:true }],
  },
  'pharmaceuticals': {
    'IN': [{ name:'Sun Pharmaceutical',moq:'10 kg',lead_time:'8 weeks',certifications:['US FDA','WHO-GMP','ISO 9001'],rating:4.4,sample_available:true },
            { name:'Dr. Reddys Laboratories',moq:'5 kg',lead_time:'10 weeks',certifications:['US FDA','EU GMP'],rating:4.5,sample_available:true }],
    'CN': [{ name:'Zhejiang Huahai Pharmaceutical',moq:'20 kg',lead_time:'12 weeks',certifications:['US FDA','EU GMP'],rating:3.8,sample_available:true }],
    'DE': [{ name:'Merck KGaA',moq:'1 kg',lead_time:'6 weeks',certifications:['EU GMP','ISO 9001'],rating:4.8,sample_available:true }],
  },
  'chemicals': {
    'DE': [{ name:'BASF SE',moq:'1 MT',lead_time:'4 weeks',certifications:['ISO 9001','REACH','Responsible Care'],rating:4.7,sample_available:true }],
    'CN': [{ name:'Sinopec Group',moq:'10 MT',lead_time:'6 weeks',certifications:['ISO 9001','ISO 14001'],rating:4.0,sample_available:false }],
    'US': [{ name:'Dow Chemical',moq:'500 kg',lead_time:'2 weeks',certifications:['ISO 9001','Responsible Care'],rating:4.6,sample_available:true }],
  },
};

function findSuppliers(category, countries, moq_max, certifications, exclude_countries) {
  const cat = SUPPLIER_DB[category?.toLowerCase()];
  if (!cat) return [];
  const results = [];
  const countryFilter = countries?.length ? countries.map(c=>c.toUpperCase()) : Object.keys(cat);
  const excludeSet = new Set((exclude_countries||[]).map(c=>c.toUpperCase()));

  for (const country of countryFilter) {
    if (excludeSet.has(country)) continue;
    const suppliers = cat[country] || [];
    for (const s of suppliers) {
      if (certifications?.length && !certifications.some(c=>s.certifications.some(sc=>sc.toLowerCase().includes(c.toLowerCase())))) continue;
      results.push({ ...s, country, risk_score: { CN:62,TW:55,KR:28,VN:35,BD:48,IN:45,US:20,DE:18,BR:52,TH:40 }[country]||50 });
    }
  }
  return results.sort((a,b)=>b.rating-a.rating);
}

app.post('/api/supplier-finder', (req, res) => {
  const plan = getPlan(req);
  const { product_category, countries, exclude_countries, certifications, moq_max, sample_required } = { ...req.query, ...req.body };
  if (!product_category) return errorResponse(res,400,'"product_category" is required (electronics, apparel, food, pharmaceuticals, chemicals)');

  const countryList = countries ? (Array.isArray(countries)?countries:String(countries).split(',').map(s=>s.trim())) : [];
  const certList    = certifications ? (Array.isArray(certifications)?certifications:String(certifications).split(',').map(s=>s.trim())) : [];
  const excludeList = exclude_countries ? (Array.isArray(exclude_countries)?exclude_countries:String(exclude_countries).split(',').map(s=>s.trim())) : [];

  let suppliers = findSuppliers(product_category, countryList, moq_max, certList, excludeList);
  if (sample_required==='true'||sample_required===true) suppliers = suppliers.filter(s=>s.sample_available);

  const limit = plan==='free'?2:plan==='pro'?10:50;
  const shown = suppliers.slice(0,limit);

  const response = {
    success:true, searched_at:new Date().toISOString(),
    product_category, total_found:suppliers.length,
    suppliers: plan==='free' ? shown.map(s=>({ name:s.name, country:s.country, rating:s.rating, sample_available:s.sample_available })) : shown,
    plan,
  };

  if (plan!=='free') {
    response.available_categories = Object.keys(SUPPLIER_DB);
    response.risk_summary = {
      low_risk_suppliers:  shown.filter(s=>s.risk_score<30).length,
      medium_risk_suppliers:shown.filter(s=>s.risk_score>=30&&s.risk_score<60).length,
      high_risk_suppliers: shown.filter(s=>s.risk_score>=60).length,
    };
  }
  if (plan==='ultra'||plan==='mega') {
    response.diversification_score = shown.length>0 ? Math.round(new Set(shown.map(s=>s.country)).size / shown.length * 100) : 0;
    response.recommended = shown.filter(s=>s.rating>=4.3&&s.risk_score<50).slice(0,3);
  }

  res.json(response);
});

if (require.main===module) { const PORT=process.env.PORT||3032; app.listen(PORT,()=>console.log(`supplier-finder on ${PORT}`)); }
module.exports = app;
