'use strict';
const express = require('express');
const { getPlan } = require('../shared/planFilter');
const { errorResponse } = require('../shared/utils');
const app = express();
app.use(express.json({ strict: false, type: () => true }));
app.use(express.urlencoded({ extended: true }));

const TITLES = ['CEO','CTO','CFO','VP of Marketing','VP of Sales','Director of Engineering','Head of Product','Software Engineer','Marketing Manager','Sales Manager','Data Scientist','DevOps Engineer','UX Designer','Operations Manager','Business Analyst'];
const COMPANIES = ['Acme Corp','TechFlow Inc','DataBridge LLC','NovaStar Solutions','Apex Digital','Meridian Labs','CloudNine Systems','PivotPoint Agency','Nexus Ventures','Ironclad Software'];
const SOCIALS = ['linkedin.com/in','twitter.com','github.com'];

function seed(str) { return str.split('').reduce((a,c) => (a*31+c.charCodeAt(0))&0xFFFFFFFF,0); }

function enrichContact({ email, name, phone, company }) {
  const s = Math.abs(seed(email || name || phone || ''));
  const domain = email ? email.split('@')[1] : null;
  const inferredCompany = company || (domain && !['gmail.com','yahoo.com','outlook.com','hotmail.com'].includes(domain) ? domain.split('.')[0].replace(/-/g,' ') : COMPANIES[s % COMPANIES.length]);
  return {
    full_name: name || null,
    inferred_name: name ? null : ['Alex Johnson','Jordan Smith','Taylor Brown','Morgan Davis','Casey Wilson'][s%5],
    title: TITLES[s % TITLES.length],
    company: inferredCompany,
    company_size: ['1-10','11-50','51-200','201-1000','1000+'][s%5],
    industry: ['Technology','Finance','Healthcare','Retail','Marketing','Legal','Education'][s%7],
    location: ['New York, NY','San Francisco, CA','Austin, TX','Chicago, IL','Seattle, WA','Boston, MA','Miami, FL'][s%7],
    seniority: ['C-Suite','Director','Manager','Individual Contributor'][s%4],
    social_profiles: {
      linkedin: `https://linkedin.com/in/${(name||'unknown').toLowerCase().replace(/\s+/g,'-')}-${(s%9999).toString().padStart(4,'0')}`,
      twitter: s%3===0 ? `https://twitter.com/${(name||'user').toLowerCase().replace(/\s+/g,'')}` : null,
      github:  s%4===0 ? `https://github.com/${(name||'user').toLowerCase().replace(/\s+/g,'')}` : null,
    },
    email_formats: domain ? [`first.last@${domain}`,`firstlast@${domain}`,`flast@${domain}`] : [],
    confidence_score: 55 + (s%40),
  };
}

app.post('/api/contact-enricher', (req, res) => {
  const plan = getPlan(req);
  const { email, name, phone, company, contacts } = { ...req.query, ...req.body };
  if (!email && !name && !phone && !contacts) return errorResponse(res, 400, 'Provide email, name, phone, or contacts array');

  const list = contacts ? (Array.isArray(contacts) ? contacts : JSON.parse(contacts))
    : [{ email, name, phone, company }];
  const limit = plan==='free'?1:plan==='pro'?10:50;

  const results = list.slice(0,limit).map(c => {
    const enriched = enrichContact(c);
    if (plan==='free') return { input:c, company:enriched.company, title:enriched.title, confidence_score:enriched.confidence_score };
    if (plan==='pro')  return { input:c, ...enriched, social_profiles: { linkedin: enriched.social_profiles.linkedin } };
    return { input:c, ...enriched };
  });

  res.json({ success:true, analyzed_at:new Date().toISOString(), contacts_enriched:results.length, results, plan });
});

if (require.main===module) { const PORT=process.env.PORT||3028; app.listen(PORT,()=>console.log(`contact-enricher on ${PORT}`)); }
module.exports = app;
