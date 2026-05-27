/**
 * /api/linkedin-data
 * Extracts public LinkedIn profile and company page data from public URLs.
 * Uses Open Graph meta tags, JSON-LD schema, and DOM heuristics on
 * publicly accessible (non-login-gated) LinkedIn pages.
 *
 * Supports:
 *  - Public person profiles (/in/username)
 *  - Company pages (/company/name)
 *  - Job postings (/jobs/view/...)
 */
const express = require('express');
const cheerio = require('cheerio');
const { normalizeUrl, fetchPage, errorResponse } = require('../shared/utils');
const { getPlan } = require('../shared/planFilter');

const app = express();
app.use(express.json({ strict: false, type: () => true }));
app.use(express.urlencoded({ extended: true }));

function detectPageType(urlStr) {
  if (/linkedin\.com\/in\//i.test(urlStr)) return 'person';
  if (/linkedin\.com\/company\//i.test(urlStr)) return 'company';
  if (/linkedin\.com\/jobs\/view\//i.test(urlStr)) return 'job';
  if (/linkedin\.com\/school\//i.test(urlStr)) return 'school';
  return 'unknown';
}

function extractFromSchema($) {
  let data = null;
  $('script[type="application/ld+json"]').each((_, el) => {
    if (data) return;
    try {
      const json = JSON.parse($(el).html());
      const items = Array.isArray(json) ? json : [json];
      for (const item of items) {
        if (['Person', 'Organization', 'JobPosting', 'CollegeOrUniversity'].includes(item['@type'])) {
          data = item;
          break;
        }
      }
    } catch {}
  });
  return data;
}

function extractOG($) {
  const get = prop => $(`meta[property="og:${prop}"]`).attr('content') ||
                      $(`meta[name="og:${prop}"]`).attr('content') || null;
  return {
    title:       get('title'),
    description: get('description'),
    image:       get('image'),
    url:         get('url'),
    type:        get('type'),
  };
}

function parsePerson($, schema, og) {
  const name = schema?.name || og?.title?.split(' - ')[0] || null;
  const headline = schema?.jobTitle ||
    $('h2, [class*="headline"], [class*="top-card-layout__headline"]').first().text().trim() ||
    og?.description?.split('·')[0]?.trim() || null;

  // Try to parse "X connections" or "X followers" from description
  const desc = og?.description || $('meta[name="description"]').attr('content') || '';
  const connMatch = desc.match(/([\d,]+)\s*(?:connections?|followers?)/i);
  const connections = connMatch ? connMatch[1].replace(/,/g, '') : null;

  const location = schema?.address?.addressLocality ||
    $('[class*="location"], [class*="subline"]').first().text().trim().slice(0, 80) || null;

  const company = schema?.worksFor?.[0]?.name ||
    $('[class*="company"], [class*="employer"]').first().text().trim().slice(0, 60) || null;

  const education = (schema?.alumniOf || []).map(e => e?.name || e).filter(Boolean).slice(0, 3);

  return { type: 'person', name, headline, location, company, connections, education, profile_image: og?.image };
}

function parseCompany($, schema, og) {
  const name = schema?.name || og?.title?.split(' | ')[0] || null;
  const description = (schema?.description || og?.description || '').slice(0, 400);

  const desc = og?.description || $('meta[name="description"]').attr('content') || '';
  const followerMatch = desc.match(/([\d,]+)\s*followers?/i);
  const followers = followerMatch ? followerMatch[1].replace(/,/g, '') : null;
  const empMatch = desc.match(/([\d,]+(?:[\–\-]\d+)?)\s*employees?/i);
  const employees = empMatch ? empMatch[1] : null;

  const industry = schema?.industry ||
    $('[class*="industry"], [class*="company-industries"]').first().text().trim().slice(0, 80) || null;
  const website = schema?.url || schema?.sameAs?.[0] || null;
  const founded = schema?.foundingDate || null;
  const hq = schema?.address?.addressLocality || null;
  const logo = og?.image || schema?.logo?.url || null;

  return { type: 'company', name, description, industry, followers, employees, website, founded, hq, logo };
}

function parseJob($, schema, og) {
  const title = schema?.title || og?.title?.split(' - ')[0] || null;
  const company = schema?.hiringOrganization?.name ||
    $('[class*="company-name"], [class*="topcard__org"]').first().text().trim() || null;
  const location = schema?.jobLocation?.address?.addressLocality ||
    schema?.jobLocation?.address?.addressRegion ||
    $('[class*="location"]').first().text().trim().slice(0, 80) || null;
  const description = (schema?.description || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 500);
  const employment_type = schema?.employmentType || null;
  const posted = schema?.datePosted || null;
  const salary = schema?.baseSalary?.value?.value
    ? `${schema.baseSalary.value.value} ${schema.baseSalary.currency || ''}`
    : null;

  return { type: 'job', title, company, location, employment_type, posted, salary, description };
}

app.post('/api/linkedin-data', async (req, res) => {
  const plan = getPlan(req);
  const { url } = { ...req.query, ...req.body };

  let urlObj;
  try { urlObj = normalizeUrl(url); } catch (e) { return errorResponse(res, 400, e.message); }

  if (!urlObj.hostname.includes('linkedin.com')) {
    return errorResponse(res, 400, 'URL must be a linkedin.com URL');
  }

  const pageType = detectPageType(urlObj.href);

  try {
    const { response } = await fetchPage(urlObj, {
      headers: {
        'User-Agent': 'LinkedInBot/1.0 (compatible; Mozilla/5.0)',
        'Accept-Language': 'en-US,en;q=0.9',
      }
    });
    const html = typeof response.data === 'string' ? response.data : '';
    const $ = cheerio.load(html);

    const schema = extractFromSchema($);
    const og = extractOG($);

    let parsed;
    if (pageType === 'person')  parsed = parsePerson($, schema, og);
    else if (pageType === 'company') parsed = parseCompany($, schema, og);
    else if (pageType === 'job')     parsed = parseJob($, schema, og);
    else parsed = { type: pageType, raw_title: og?.title, raw_description: og?.description };

    // Plan-based field filtering
    const result = {
      url: urlObj.href,
      page_type: pageType,
      ...parsed,
      ...(plan !== 'free' ? {} : {
        // On free plan, strip some fields
        education: undefined,
        salary: undefined,
        description: undefined,
      }),
      ...(plan === 'ultra' || plan === 'mega'
        ? { raw_schema_type: schema?.['@type'] || null }
        : {}),
      plan,
    };

    // Clean undefined keys
    Object.keys(result).forEach(k => result[k] === undefined && delete result[k]);

    res.json({ success: true, data: result });
  } catch (err) {
    console.error('[linkedin-data]', err.message);
    return errorResponse(res, 500, 'Failed to fetch LinkedIn data. The page may require login or be rate-limited.');
  }
});

if (require.main === module) {
  const PORT = process.env.PORT || 3019;
  app.listen(PORT, () => console.log(`linkedin-data running on port ${PORT}`));
}

module.exports = app;
