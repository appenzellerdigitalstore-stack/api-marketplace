'use strict';
const express = require('express');
const { getPlan } = require('../shared/planFilter');
const { errorResponse } = require('../shared/utils');
const app = express();
app.use(express.json({ strict: false, type: () => true }));
app.use(express.urlencoded({ extended: true }));

// Base rates per kg/mile for each mode
const CARRIERS = {
  air: [
    { name:'FedEx International Priority', transit_days:1,  base_rate_per_kg:8.50, fuel_surcharge:0.20, min_charge:75,  reliability:98 },
    { name:'UPS Worldwide Express',         transit_days:1,  base_rate_per_kg:8.20, fuel_surcharge:0.22, min_charge:70,  reliability:97 },
    { name:'DHL Express Worldwide',         transit_days:2,  base_rate_per_kg:7.80, fuel_surcharge:0.21, min_charge:65,  reliability:97 },
    { name:'Emirates SkyCargo',             transit_days:3,  base_rate_per_kg:5.20, fuel_surcharge:0.18, min_charge:50,  reliability:94 },
    { name:'Lufthansa Cargo',               transit_days:3,  base_rate_per_kg:5.50, fuel_surcharge:0.19, min_charge:55,  reliability:95 },
  ],
  ocean: [
    { name:'Maersk Line',         transit_days:25, base_rate_per_kg:0.08, fuel_surcharge:0.15, min_charge:800,  reliability:90, per_container:2200 },
    { name:'MSC (Mediterranean)', transit_days:28, base_rate_per_kg:0.07, fuel_surcharge:0.14, min_charge:750,  reliability:88, per_container:2100 },
    { name:'CMA CGM',             transit_days:26, base_rate_per_kg:0.08, fuel_surcharge:0.15, min_charge:820,  reliability:89, per_container:2150 },
    { name:'COSCO Shipping',      transit_days:30, base_rate_per_kg:0.065,fuel_surcharge:0.13, min_charge:700,  reliability:87, per_container:1900 },
    { name:'Hapag-Lloyd',         transit_days:24, base_rate_per_kg:0.09, fuel_surcharge:0.16, min_charge:900,  reliability:91, per_container:2350 },
  ],
  ground: [
    { name:'FedEx Ground',         transit_days:3,  base_rate_per_kg:0.45, fuel_surcharge:0.12, min_charge:8,   reliability:96 },
    { name:'UPS Ground',           transit_days:4,  base_rate_per_kg:0.42, fuel_surcharge:0.11, min_charge:7,   reliability:95 },
    { name:'USPS Priority Mail',   transit_days:3,  base_rate_per_kg:0.55, fuel_surcharge:0.05, min_charge:5,   reliability:93 },
    { name:'DHL Parcel',           transit_days:5,  base_rate_per_kg:0.38, fuel_surcharge:0.10, min_charge:6,   reliability:92 },
    { name:'FreightQuote (LTL)',   transit_days:5,  base_rate_per_kg:0.30, fuel_surcharge:0.15, min_charge:150, reliability:89 },
  ],
  express: [
    { name:'FedEx First Overnight', transit_days:1,  base_rate_per_kg:12.0, fuel_surcharge:0.22, min_charge:120, reliability:99 },
    { name:'UPS Next Day Air',      transit_days:1,  base_rate_per_kg:11.5, fuel_surcharge:0.22, min_charge:115, reliability:99 },
    { name:'DHL Express 9:00',      transit_days:1,  base_rate_per_kg:13.0, fuel_surcharge:0.23, min_charge:130, reliability:99 },
  ],
};

// Approximate distance lookup between major city pairs (km)
const DISTANCES = {
  'US-EU':7000,'US-UK':6800,'US-DE':8000,'US-FR':7500,'US-CN':11000,'US-JP':10800,
  'US-AU':14000,'US-IN':13500,'US-MX':3000,'US-CA':2500,'US-BR':9500,'EU-CN':9500,
  'EU-IN':7000,'EU-AU':16000,'UK-CN':9000,'UK-AU':16800,'DE-CN':9000,'DEFAULT':8000,
};

function getDistance(origin, dest) {
  const key1 = `${origin}-${dest}`;
  const key2 = `${dest}-${origin}`;
  return DISTANCES[key1] || DISTANCES[key2] || DISTANCES['DEFAULT'];
}

function calcRate(carrier, weight_kg, distance_km, mode) {
  const distanceFactor = mode==='air'?1:mode==='ocean'?1:Math.max(1,distance_km/1000);
  let base = Math.max(carrier.min_charge, carrier.base_rate_per_kg * weight_kg * (mode==='ground'?distanceFactor:1));
  if (mode==='ocean'&&weight_kg>500) base = carrier.per_container || base;
  const fuel = base * carrier.fuel_surcharge;
  const total = +(base + fuel).toFixed(2);
  return { base_charge:+base.toFixed(2), fuel_surcharge:+fuel.toFixed(2), total_usd:total };
}

app.post('/api/freight-estimator', (req, res) => {
  const plan = getPlan(req);
  const { origin_country, destination_country, weight_kg, dimensions_cm, freight_class, mode, cargo_type, value_usd } = { ...req.query, ...req.body };

  if (!origin_country||!destination_country) return errorResponse(res,400,'origin_country and destination_country are required');
  if (!weight_kg) return errorResponse(res,400,'weight_kg is required');

  const weight   = parseFloat(weight_kg) || 1;
  const origin   = origin_country.toUpperCase();
  const dest     = destination_country.toUpperCase();
  const distance = getDistance(origin,dest);
  const isInternational = origin!==dest;
  const modeFilter = mode ? [mode] : (isInternational ? ['air','ocean'] : ['ground','express']);

  // Dimensional weight
  let dimWeight = weight;
  if (dimensions_cm) {
    const [l,w,h] = (Array.isArray(dimensions_cm)?dimensions_cm:String(dimensions_cm).split('x').map(Number));
    dimWeight = (l*w*h)/5000;
  }
  const chargeableWeight = Math.max(weight, dimWeight);

  const quotes = [];
  for (const m of modeFilter) {
    const pool = CARRIERS[m] || [];
    const limit = plan==='free'?2:plan==='pro'?3:5;
    for (const carrier of pool.slice(0,limit)) {
      const charges = calcRate(carrier, chargeableWeight, distance, m);
      const quote = {
        carrier: carrier.name,
        mode:m,
        transit_days: carrier.transit_days + (isInternational&&m==='air'?1:isInternational&&m==='ocean'?5:0),
        ...charges,
        reliability_pct: carrier.reliability,
      };
      if (plan!=='free') {
        quote.chargeable_weight_kg = +chargeableWeight.toFixed(2);
        quote.distance_km = distance;
        if (value_usd) quote.insurance_estimate = +(parseFloat(value_usd)*0.005).toFixed(2);
      }
      quotes.push(quote);
    }
  }

  quotes.sort((a,b)=>a.total_usd-b.total_usd);
  const cheapest  = quotes[0];
  const fastest   = quotes.slice().sort((a,b)=>a.transit_days-b.transit_days)[0];

  const response = {
    success:true, estimated_at:new Date().toISOString(),
    shipment: { origin, destination:dest, weight_kg:weight, chargeable_weight_kg:+chargeableWeight.toFixed(2) },
    cheapest_option: cheapest ? { carrier:cheapest.carrier, mode:cheapest.mode, total_usd:cheapest.total_usd, transit_days:cheapest.transit_days } : null,
    fastest_option:  fastest  ? { carrier:fastest.carrier,  mode:fastest.mode,  total_usd:fastest.total_usd,  transit_days:fastest.transit_days }  : null,
    quotes: plan==='free' ? quotes.slice(0,2).map(q=>({carrier:q.carrier,mode:q.mode,total_usd:q.total_usd,transit_days:q.transit_days})) : quotes,
    plan,
  };

  if (plan==='ultra'||plan==='mega') {
    response.customs_estimate = isInternational ? {
      note:'Duties not included — use /api/tariff-lookup for accurate duty calculation',
      de_minimis_threshold: dest==='US'?'$800':dest==='EU'||dest==='DE'||dest==='FR'?'€150':dest==='AU'?'AUD $1000':'Verify locally',
    } : null;
    response.carbon_estimate_kg_co2 = {
      air:   +(chargeableWeight*(distance/1000)*0.500).toFixed(1),
      ocean: +(chargeableWeight*(distance/1000)*0.012).toFixed(1),
      ground:+(chargeableWeight*(distance/1000)*0.150).toFixed(1),
    };
    response.recommendation = cheapest && fastest && cheapest.carrier!==fastest.carrier
      ? `Cost-optimized: ${cheapest.carrier} (${cheapest.transit_days}d, $${cheapest.total_usd}). Speed-optimized: ${fastest.carrier} (${fastest.transit_days}d, $${fastest.total_usd}).`
      : `Best overall: ${cheapest?.carrier}`;
  }

  res.json(response);
});

if (require.main===module) { const PORT=process.env.PORT||3035; app.listen(PORT,()=>console.log(`freight-estimator on ${PORT}`)); }
module.exports = app;
