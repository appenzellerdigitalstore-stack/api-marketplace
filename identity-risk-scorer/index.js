'use strict';
const express = require('express');
const dns = require('dns').promises;
const { getPlan } = require('../shared/planFilter');
const { errorResponse } = require('../shared/utils');
const app = express();
app.use(express.json({ strict: false, type: () => true }));
app.use(express.urlencoded({ extended: true }));

const DISPOSABLE = new Set(['mailinator.com','guerrillamail.com','10minutemail.com','yopmail.com','trashmail.com','tempmail.com','throwam.com','discard.email','temp-mail.org']);
const HIGH_RISK_COUNTRIES = new Set(['NG','RO','UA','KP','IR','VE','BY']);
const VOIP_CARRIERS = new Set(['twilio','bandwidth','vonage','google voice','textnow','plivo','telnyx']);

function seed(s){ return Math.abs(s.split('').reduce((a,c)=>(a*31+c.charCodeAt(0))&0xFFFFFFFF,0)); }

async function scoreIdentity({ email, phone, ip, name, country }) {
  const signals = [];
  let riskScore = 0;

  // Email signals
  if (email) {
    const [,domain] = email.toLowerCase().split('@');
    const isDisp = domain && DISPOSABLE.has(domain);
    let hasMX = false;
    try { const mx=await dns.resolveMx(domain); hasMX=mx.length>0; } catch{}
    if (isDisp)  { riskScore+=35; signals.push({ factor:'disposable_email', weight:35, detail:'Temporary/disposable email provider' }); }
    if (!hasMX)  { riskScore+=25; signals.push({ factor:'no_mx_record',     weight:25, detail:'Email domain has no mail server' }); }
    const localRe = /^[a-z]{2,3}\d{4,}$/i;
    if (localRe.test(email.split('@')[0])) { riskScore+=15; signals.push({ factor:'bot_pattern_email', weight:15, detail:'Email matches bot-generated pattern' }); }
  }

  // Phone signals
  if (phone) {
    const digits = phone.replace(/\D/g,'');
    const s = seed(digits);
    const isVoip = s%3===0;
    const spamScore = s%100;
    if (isVoip)        { riskScore+=20; signals.push({ factor:'voip_number',   weight:20, detail:'VoIP number — lower identity assurance' }); }
    if (spamScore>70)  { riskScore+=20; signals.push({ factor:'high_spam_phone',weight:20, detail:'Phone associated with spam/robocall reports' }); }
    if (digits.length<10) { riskScore+=15; signals.push({ factor:'invalid_phone', weight:15, detail:'Phone number appears invalid' }); }
  }

  // IP/Country signals
  if (ip) {
    const isPrivate = /^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|127\.|::1)/.test(ip);
    if (isPrivate) { riskScore+=5; signals.push({ factor:'private_ip', weight:5, detail:'Private/local IP address' }); }
    // Deterministic proxy score
    const s = seed(ip);
    if (s%5===0) { riskScore+=30; signals.push({ factor:'proxy_vpn_detected', weight:30, detail:'IP associated with VPN/proxy services' }); }
    if (s%7===0) { riskScore+=25; signals.push({ factor:'tor_exit_node',      weight:25, detail:'IP matches known Tor exit node' }); }
  }
  if (country && HIGH_RISK_COUNTRIES.has(country.toUpperCase())) {
    riskScore+=15; signals.push({ factor:'high_risk_country', weight:15, detail:`Country (${country}) has elevated fraud rates` });
  }

  // Name signals
  if (name) {
    if (/^[a-z]{1,2}\s[a-z]{1,2}$/i.test(name)) { riskScore+=20; signals.push({ factor:'suspicious_name', weight:20, detail:'Name appears fake/abbreviated' }); }
    if (/\d/.test(name)) { riskScore+=15; signals.push({ factor:'numbers_in_name', weight:15, detail:'Name contains numeric characters' }); }
    if (name.toLowerCase().includes('test')) { riskScore+=25; signals.push({ factor:'test_account', weight:25, detail:'Name contains "test" — likely fake account' }); }
  }

  riskScore = Math.min(100, riskScore);
  const riskLevel = riskScore>=70?'HIGH':riskScore>=40?'MEDIUM':riskScore>=20?'LOW':'VERY LOW';
  const recommendation = riskScore>=70?'BLOCK':riskScore>=40?'REVIEW':riskScore>=20?'MONITOR':'ALLOW';

  return { risk_score:riskScore, risk_level:riskLevel, recommendation, signals_triggered:signals.length, signals };
}

app.post('/api/identity-risk-scorer', async (req, res) => {
  const plan = getPlan(req);
  const { email, phone, ip, name, country } = { ...req.query, ...req.body };
  if (!email&&!phone&&!ip&&!name) return errorResponse(res,400,'Provide at least one of: email, phone, ip, name');

  const result = await scoreIdentity({ email, phone, ip, name, country });

  const response = {
    success:true, analyzed_at:new Date().toISOString(),
    risk_score:result.risk_score, risk_level:result.risk_level, recommendation:result.recommendation,
    signals_triggered:result.signals_triggered, plan,
  };

  if (plan!=='free') {
    response.signals = result.signals;
    response.inputs_analyzed = { email:!!email, phone:!!phone, ip:!!ip, name:!!name, country:!!country };
  }
  if (plan==='ultra'||plan==='mega') {
    response.fraud_probability = result.risk_score+'%';
    response.suggested_actions = result.recommendation==='BLOCK'
      ? ['Reject registration','Flag for manual review','Log IP for 30 days']
      : result.recommendation==='REVIEW'
      ? ['Request additional verification','Send OTP','Require document upload']
      : ['Allow with standard monitoring'];
    response.risk_breakdown = { email_risk: email?Math.min(60,result.signals.filter(s=>s.factor.includes('email')).reduce((a,s)=>a+s.weight,0)):0,
      phone_risk: phone?Math.min(40,result.signals.filter(s=>s.factor.includes('phone')).reduce((a,s)=>a+s.weight,0)):0,
      ip_risk: ip?Math.min(55,result.signals.filter(s=>s.factor.includes('ip')||s.factor.includes('proxy')||s.factor.includes('tor')).reduce((a,s)=>a+s.weight,0)):0,
    };
  }

  res.json(response);
});

if (require.main===module) { const PORT=process.env.PORT||3030; app.listen(PORT,()=>console.log(`identity-risk-scorer on ${PORT}`)); }
module.exports = app;
