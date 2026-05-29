/**
 * /api/job-listings
 * Fetches job listings from company career pages and ATS platforms.
 * Primary: uses Greenhouse/Lever/Ashby/Workable public JSON APIs.
 * Fallback: schema.org JobPosting + DOM heuristics.
 */
const express = require('express');
const axios   = require('axios');
const cheerio = require('cheerio');
const { normalizeUrl, fetchPage, errorResponse } = require('../shared/utils');
const { getPlan } = require('../shared/planFilter');

const app = express();
app.use(express.json({ strict: false, type: () => true }));
app.use(express.urlencoded({ extended: true }));

// ── ATS Detection ─────────────────────────────────────────────────────────────

function detectATS(html, urlStr) {
  if (/boards\.greenhouse\.io/i.test(urlStr) || /greenhouse-io/i.test(html)) return 'greenhouse';
  if (/jobs\.lever\.co/i.test(urlStr) || /lever\.co/i.test(urlStr)) return 'lever';
  if (/myworkdayjobs\.com/i.test(urlStr)) return 'workday';
  if (/bamboohr\.com/i.test(urlStr)) return 'bamboohr';
  if (/jobs\.ashbyhq\.com/i.test(urlStr)) return 'ashby';
  if (/smartrecruiters\.com/i.test(urlStr)) return 'smartrecruiters';
  if (/apply\.workable\.com/i.test(urlStr)) return 'workable';
  return 'generic';
}

// ── Slug extractors ───────────────────────────────────────────────────────────

function extractGreenhouseSlug(urlStr) {
  const m = urlStr.match(/boards\.greenhouse\.io\/([^/?#]+)/i);
  if (m) return m[1];
  const m2 = urlStr.match(/([^./]+)\.greenhouse\.io/i);
  if (m2 && m2[1] !== 'boards') return m2[1];
  return null;
}

function extractLeverSlug(urlStr) {
  const m = urlStr.match(/lever\.co\/([^/?#]+)/i);
  return m ? m[1] : null;
}

function extractWorkableSlug(urlStr) {
  const m = urlStr.match(/workable\.com\/([^/?#]+)/i);
  return m ? m[1] : null;
}

function extractAshbySlug(urlStr) {
  const m = urlStr.match(/ashbyhq\.com\/([^/?#]+)/i);
  return m ? m[1] : null;
}

// ── Public ATS JSON API fetchers ──────────────────────────────────────────────

async function fetchGreenhouseJobs(slug) {
  try {
    const resp = await axios.get(
      'https://boards-api.greenhouse.io/v1/boards/' + encodeURIComponent(slug) + '/jobs?content=true',
      { timeout: 15000, headers: { 'User-Agent': 'Mozilla/5.0' } }
    );
    const jobs = (resp.data.jobs || []).map(function(j) {
      return {
        title: j.title || null,
        company: null,
        department: j.departments && j.departments[0] ? j.departments[0].name : null,
        location: j.location ? j.location.name : null,
        employment_type: null,
        remote: j.location ? /remote/i.test(j.location.name) : null,
        description: j.content ? j.content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 400) : null,
        posted_date: j.updated_at ? j.updated_at.split('T')[0] : null,
        apply_url: j.absolute_url || null,
        source: 'greenhouse_api',
      };
    });
    return { jobs: jobs, ats: 'greenhouse' };
  } catch (e) {
    return null;
  }
}

async function fetchLeverJobs(slug) {
  try {
    const resp = await axios.get(
      'https://api.lever.co/v0/postings/' + encodeURIComponent(slug) + '?mode=json',
      { timeout: 15000, headers: { 'User-Agent': 'Mozilla/5.0' } }
    );
    const postings = Array.isArray(resp.data) ? resp.data : [];
    const jobs = postings.map(function(j) {
      return {
        title: j.text || null,
        company: null,
        department: (j.categories && (j.categories.team || j.categories.department)) || null,
        location: (j.categories && j.categories.location) || j.workplaceType || null,
        employment_type: (j.categories && j.categories.commitment) || null,
        remote: j.workplaceType === 'remote' || (j.categories && /remote/i.test(j.categories.location || '')) || null,
        description: j.descriptionPlain ? j.descriptionPlain.slice(0, 400) : null,
        posted_date: j.createdAt ? new Date(j.createdAt).toISOString().split('T')[0] : null,
        apply_url: j.applyUrl || j.hostedUrl || null,
        source: 'lever_api',
      };
    });
    return { jobs: jobs, ats: 'lever' };
  } catch (e) {
    return null;
  }
}

async function fetchWorkableJobs(slug) {
  try {
    const resp = await axios.post(
      'https://apply.workable.com/api/v3/accounts/' + encodeURIComponent(slug) + '/jobs',
      { query: '', location: [], department: [], remote: false, workplace: [] },
      { timeout: 15000, headers: { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0' } }
    );
    const results = (resp.data && resp.data.results) || [];
    const jobs = results.map(function(j) {
      return {
        title: j.title || null,
        company: (j.account && j.account.name) || slug,
        department: j.department || null,
        location: j.location ? (j.location.city ? j.location.city + ', ' + j.location.country : j.location.country) : null,
        employment_type: j.employment_type || null,
        remote: j.remote || null,
        description: null,
        posted_date: j.published_on || null,
        apply_url: j.url || null,
        source: 'workable_api',
      };
    });
    return { jobs: jobs, ats: 'workable' };
  } catch (e) {
    return null;
  }
}

async function fetchAshbyJobs(slug) {
  try {
    const body = {
      operationName: 'ApiJobBoardWithTeams',
      variables: { organizationHostedJobsPageName: slug },
      query: 'query ApiJobBoardWithTeams($organizationHostedJobsPageName: String!) { jobBoard: publishedJobBoard(organizationHostedJobsPageName: $organizationHostedJobsPageName) { jobPostings { id title locationName isRemote publishedDate externalLink department { name } } } }'
    };
    const resp = await axios.post('https://jobs.ashbyhq.com/api/non-user-graphql', body,
      { timeout: 15000, headers: { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0' } }
    );
    const postings = (resp.data && resp.data.data && resp.data.data.jobBoard && resp.data.data.jobBoard.jobPostings) || [];
    const jobs = postings.map(function(j) {
      return {
        title: j.title || null,
        company: null,
        department: j.department ? j.department.name : null,
        location: j.locationName || null,
        employment_type: null,
        remote: j.isRemote || null,
        description: null,
        posted_date: j.publishedDate ? j.publishedDate.split('T')[0] : null,
        apply_url: j.externalLink || ('https://jobs.ashbyhq.com/' + slug + '/' + j.id),
        source: 'ashby_api',
      };
    });
    return { jobs: jobs, ats: 'ashby' };
  } catch (e) {
    return null;
  }
}

// ── schema.org JobPosting ─────────────────────────────────────────────────────

function fromSchema($) {
  var jobs = [];
  $('script[type="application/ld+json"]').each(function(_, el) {
    try {
      var json = JSON.parse($(el).html());
      var items = Array.isArray(json) ? json : [json];
      items.forEach(function(item) {
        if (item['@type'] !== 'JobPosting') return;
        jobs.push({
          title: item.title || null,
          company: (item.hiringOrganization && item.hiringOrganization.name) || null,
          location: [
            item.jobLocation && item.jobLocation.address && item.jobLocation.address.addressLocality,
            item.jobLocation && item.jobLocation.address && item.jobLocation.address.addressRegion,
            item.jobLocation && item.jobLocation.address && item.jobLocation.address.addressCountry,
          ].filter(Boolean).join(', ') || null,
          employment_type: item.employmentType || null,
          remote: item.jobLocationType === 'TELECOMMUTE' || /remote/i.test(item.title || '') || null,
          salary: item.baseSalary ? (
            ((item.baseSalary.value && item.baseSalary.value.minValue) || '') + '-' +
            ((item.baseSalary.value && item.baseSalary.value.maxValue) || '') + ' ' +
            (item.baseSalary.currency || '')
          ).trim() : null,
          description: (item.description || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 400),
          posted_date: item.datePosted || null,
          expiry_date: item.validThrough || null,
          apply_url: item.url || null,
          source: 'schema.org',
        });
      });
    } catch (_) {}
  });
  return jobs;
}

// ── DOM scrapers (fallback) ───────────────────────────────────────────────────

function scrapeGreenhouse($, baseUrl) {
  var jobs = [];
  $('.opening, [class*="opening"]').each(function(_, el) {
    var titleEl = $(el).find('a').first();
    var title = titleEl.text().trim();
    var href = titleEl.attr('href');
    var location = $(el).find('.location, [class*="location"]').first().text().trim();
    var dept = $(el).closest('[class*="department"]').find('h3,h4').first().text().trim();
    if (title) jobs.push({
      title: title,
      department: dept || null,
      location: location || null,
      apply_url: href ? (href.startsWith('http') ? href : baseUrl + href) : null,
      source: 'greenhouse',
    });
  });
  return jobs;
}

function scrapeLever($, baseUrl) {
  var jobs = [];
  $('[class*="posting"], .posting').each(function(_, el) {
    var titleEl = $(el).find('h5, [class*="posting-name"]').first();
    var title = titleEl.text().trim();
    var location = $(el).find('[class*="location"], [class*="workplaceTypes"]').first().text().trim();
    var dept = $(el).closest('[class*="postings-group"]').find('[class*="large-category-header"]').text().trim();
    var linkEl = $(el).find('a[href]').first();
    var href = linkEl.attr('href');
    if (title) jobs.push({
      title: title,
      department: dept || null,
      location: location || null,
      apply_url: href ? (href.startsWith('http') ? href : baseUrl + href) : null,
      source: 'lever',
    });
  });
  return jobs;
}

function scrapeGeneric($, baseUrl) {
  var jobs = [];
  var seen = new Set();
  var jobSelectors = [
    'li[class*="job"]', 'div[class*="job-card"]', '[class*="position"]',
    '[class*="vacancy"]', 'article[class*="job"]', 'tr[class*="job"]',
    '[data-job-id]', '[class*="career-item"]', 'li[class*="opening"]',
  ];
  for (var i = 0; i < jobSelectors.length; i++) {
    $(jobSelectors[i]).each(function(_, el) {
      var linkEl = $(el).find('a[href]').first();
      var titleEl = $(el).find('h2, h3, h4, [class*="title"], [class*="name"]').first();
      var title = titleEl.text().trim() || linkEl.text().trim();
      var href = linkEl.attr('href');
      var location = $(el).find('[class*="location"], [class*="city"]').first().text().trim();
      var dept = $(el).find('[class*="department"], [class*="team"], [class*="category"]').first().text().trim();
      var type = $(el).find('[class*="type"], [class*="employment"]').first().text().trim();
      if (title && !seen.has(title)) {
        seen.add(title);
        jobs.push({
          title: title,
          department: dept || null,
          location: location || null,
          employment_type: type || null,
          apply_url: href ? (href.startsWith('http') ? href : baseUrl + href) : null,
          source: 'generic',
        });
      }
    });
    if (jobs.length >= 30) break;
  }
  return jobs;
}

// ── Route ─────────────────────────────────────────────────────────────────────

app.post('/api/job-listings', async (req, res) => {
  const plan = getPlan(req);
  const { url, filter_location, filter_department, filter_remote } = { ...req.query, ...req.body };

  let urlObj;
  try { urlObj = normalizeUrl(url); } catch (e) { return errorResponse(res, 400, e.message); }

  try {
    const urlStr = urlObj.href;
    let jobs = [];
    let ats = 'generic';
    let usedApi = false;

    // ── STEP 1: Try public ATS JSON APIs first ───────────────────────────────
    const ghSlug  = extractGreenhouseSlug(urlStr);
    const lvSlug  = extractLeverSlug(urlStr);
    const wkSlug  = extractWorkableSlug(urlStr);
    const ashSlug = extractAshbySlug(urlStr);

    if (ghSlug) {
      const r = await fetchGreenhouseJobs(ghSlug);
      if (r && r.jobs.length > 0) { jobs = r.jobs; ats = r.ats; usedApi = true; }
    } else if (lvSlug) {
      const r = await fetchLeverJobs(lvSlug);
      if (r && r.jobs.length > 0) { jobs = r.jobs; ats = r.ats; usedApi = true; }
    } else if (wkSlug) {
      const r = await fetchWorkableJobs(wkSlug);
      if (r && r.jobs.length > 0) { jobs = r.jobs; ats = r.ats; usedApi = true; }
    } else if (ashSlug) {
      const r = await fetchAshbyJobs(ashSlug);
      if (r && r.jobs.length > 0) { jobs = r.jobs; ats = r.ats; usedApi = true; }
    }

    // ── STEP 2: Fallback to HTML scraping ────────────────────────────────────
    if (!usedApi) {
      const { response } = await fetchPage(urlObj);
      const html = typeof response.data === 'string' ? response.data : '';
      const $ = cheerio.load(html);
      const baseUrl = urlObj.protocol + '//' + urlObj.hostname;
      ats = detectATS(html, urlStr);

      jobs = fromSchema($);
      if (jobs.length === 0) {
        if (ats === 'greenhouse') jobs = scrapeGreenhouse($, baseUrl);
        else if (ats === 'lever') jobs = scrapeLever($, baseUrl);
        else jobs = scrapeGeneric($, baseUrl);
      }

      // Last resort: detect ATS slugs embedded in page HTML
      if (jobs.length === 0) {
        const ghMatch = html.match(/boards\.greenhouse\.io\/([a-z0-9_-]+)/i);
        const lvMatch = html.match(/jobs\.lever\.co\/([a-z0-9_-]+)/i);
        if (ghMatch) {
          const r = await fetchGreenhouseJobs(ghMatch[1]);
          if (r) { jobs = r.jobs; ats = r.ats; usedApi = true; }
        } else if (lvMatch) {
          const r = await fetchLeverJobs(lvMatch[1]);
          if (r) { jobs = r.jobs; ats = r.ats; usedApi = true; }
        }
      }
    }

    // ── Filters ──────────────────────────────────────────────────────────────
    if (filter_location) {
      const loc = filter_location.toLowerCase();
      jobs = jobs.filter(j => j.location && j.location.toLowerCase().includes(loc));
    }
    if (filter_department) {
      const dept = filter_department.toLowerCase();
      jobs = jobs.filter(j => j.department && j.department.toLowerCase().includes(dept));
    }
    if (filter_remote === true || filter_remote === 'true') {
      jobs = jobs.filter(j => j.remote || /remote/i.test(j.title || '') || /remote/i.test(j.location || ''));
    }

    const maxJobs = plan === 'free' ? 10 : plan === 'pro' ? 30 : 100;
    const cappedJobs = jobs.slice(0, maxJobs);

    let byDepartment = null;
    if (plan !== 'free') {
      byDepartment = {};
      cappedJobs.forEach(j => {
        const dept = j.department || 'Other';
        byDepartment[dept] = (byDepartment[dept] || 0) + 1;
      });
    }

    const result = {
      url: urlStr,
      ats_platform: ats,
      total_found: jobs.length,
      jobs_returned: cappedJobs.length,
      jobs: cappedJobs,
      ...(plan !== 'free' && {
        by_department: byDepartment,
        remote_count: jobs.filter(j => j.remote || /remote/i.test(j.title || '') || /remote/i.test(j.location || '')).length,
      }),
      ...((plan === 'ultra' || plan === 'mega') ? {
        filters_applied: {
          location: filter_location || null,
          department: filter_department || null,
          remote_only: filter_remote || false,
        },
      } : {}),
      plan,
    };

    res.json({ success: true, data: result });
  } catch (err) {
    console.error('[job-listings]', err.message);
    return errorResponse(res, 500, 'Failed to fetch job listings from this URL');
  }
});

if (require.main === module) {
  const PORT = process.env.PORT || 3020;
  app.listen(PORT, () => console.log('job-listings running on port ' + PORT));
}

module.exports = app;
