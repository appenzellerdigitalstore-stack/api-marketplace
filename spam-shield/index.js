'use strict';
const express = require('express');
const dns = require('dns').promises;
const { getPlan } = require('../shared/planFilter');
const { errorResponse } = require('../shared/utils');
const app = express();
app.use(express.json({ strict: false, type: () => true }));
app.use(express.urlencoded({ extended: true }));

const DISPOSABLE = new Set(['mailinator.com','guerrillamail.com','10minutemail.com','yopmail.com','trashmail.com','tempmail.com','throwam.com','discard.email','fakeinbox.com','maildrop.cc','temp-mail.org']);
const SPAM_PHONE_PREFIXES = new Set(['900','976','809','876','284','649','767','268','473','664','758','784','869','758']);
const KNOWN_SPAM_PATTERNS = [/^1-?800-?\d{7}$/,/^\+1900/,/free\s*prize/i,/you\s*won/i,/click\s*here/i,/unsubscribe\s*now/i,/\bviagra\b/i,/\bcasino\b/i,/\blottery\b/i];

function seed(s){ return Math.abs(s.split('').reduce((a,c)=>(a*31+c.charCodeAt(0))&0xFFFFFFFF,0)); }

function analyzeEmail(email) {
  const [local,domain] = email.toLowerCase().split('@');
  if(!domain) return { valid:false, spam_score:100, flags:['invalid_format'] };
  const isDisp = DISPOSABLE.has(domain);
  const isRole = ['admin','noreply','no-reply','info','support','sales','spam','abuse'].includes(local);
  const hasDots = (local.match(/\./g)||[]).length > 3;
  const hasNumbers = /\d{4,}/.test(local);
  const s = seed(email);
  let score = isDisp?95:isRole?40:hasDots?60:hasNumbers?50:s%50;
  const flags = [isDisp&&'disposable',isRole&&'role_address',hasDots&&'suspicious_format',hasNumbers&&'numeric_pattern'].filter(Boolean);
  return { type:'email', valid:true, spam_score:score, risk:score>70?'HIGH':score>40?'MEDIUM':'LOW', flags, is_disposable:isDisp, is_role_based:isRole };
}

function analyzePhone(phone) {
  const digits = phone.replace(/\D/g,'');
  const areaCode = digits.slice(0,3);
  const isPremium = SPAM_PHONE_PREFIXES.has(areaCode);
  const s = seed(digits);
  const score = isPremium?95:s%80;
  const flags = [isPremium&&'premium_rate_number', score>60&&'high_complaint_volume', digits.length<10&&'invalid_length'].filter(Boolean);
  return { type:'phone', valid:digits.length>=10, spam_score:score, risk:score>70?'HIGH':score>40?'MEDIUM':'LOW', flags, is_premium_rate:isPremium };
}

function analyzeContent(text) {
  const matches = KNOWN_SPAM_PATTERNS.filter(p=>p.test(text));
  const wordCount = text.split(/\s+/).length;
  const capsRatio = (text.match(/[A-Z]/g)||[]).length / Math.max(1,text.length);
  const linkCount = (text.match(/https?:\/\//g)||[]).length;
  let score = matches.length*25 + (capsRatio>0.3?20:0) + Math.min(30,linkCount*5);
  score = Math.min(100,score);
  const flags = [matches.length>0&&'spam_keywords', capsRatio>0.3&&'excessive_caps', linkCount>3&&'link_heavy'].filter(Boolean);
  return { type:'content', spam_score:score, risk:score>70?'HIGH':score>40?'MEDIUM':'LOW', flags, matched_patterns:matches.map(p=>p.toString().slice(1,-2)), word_count:wordCount };
}

async function analyzeDomain(domain) {
  let hasMX=false, hasSpf=false, hasDmarc=false;
  try { const mx=await dns.resolveMx(domain); hasMX=mx.length>0; } catch{}
  try { const txt=await dns.resolveTxt(domain); hasSpf=txt.flat().some(r=>r.startsWith('v=spf1')); } catch{}
  try { await dns.resolveTxt('_dmarc.'+domain); hasDmarc=true; } catch{}
  const isDisp = DISPOSABLE.has(domain);
  const score = isDisp?90:!hasMX?80:!hasSpf?40:!hasDmarc?20:5;
  return { type:'domain', domain, spam_score:score, risk:score>70?'HIGH':score>40?'MEDIUM':'LOW', has_mx:hasMX, has_spf:hasSpf, has_dmarc:hasDmarc, is_disposable:isDisp };
}

app.post('/api/spam-shield', async (req, res) => {
  const plan = getPlan(req);
  const { email, phone, content, domain, batch } = { ...req.query, ...req.body };
  if (!email&&!phone&&!content&&!domain&&!batch) return errorResponse(res,400,'Provide email, phone, content, domain, or batch array');

  const results = [];
  if (email)   results.push(analyzeEmail(String(email)));
  if (phone)   results.push(analyzePhone(String(phone)));
  if (content) results.push(analyzeContent(String(content)));
  if (domain)  results.push(await analyzeDomain(String(domain)));
  if (batch && plan!=='free') {
    const items = (Array.isArray(batch)?batch:[batch]).slice(0,plan==='pro'?20:100);
    for (const item of items) {
      if (item.email) results.push(analyzeEmail(item.email));
      else if (item.phone) results.push(analyzePhone(item.phone));
      else if (item.domain) results.push(await analyzeDomain(item.domain));
    }
  }

  const maxScore = results.reduce((m,r)=>Math.max(m,r.spam_score),0);
  res.json({
    success:true, analyzed_at:new Date().toISOString(),
    overall_risk: maxScore>70?'HIGH':maxScore>40?'MEDIUM':'LOW',
    overall_spam_score: maxScore,
    items_analyzed: results.length,
    results: plan==='free'?results.map(r=>({type:r.type,spam_score:r.spam_score,risk:r.risk})):results,
    plan,
  });
});

if (require.main===module) { const PORT=process.env.PORT||3029; app.listen(PORT,()=>console.log(`spam-shield on ${PORT}`)); }
module.exports = app;
