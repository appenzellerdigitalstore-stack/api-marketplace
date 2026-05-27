/**
 * /api/job-listings
 * Scrapes job listings from a given company career page or job board URL.
 * Also supports parsing individual job posting pages for structured data.
 * Uses schema.org JobPosting, DOM heuristics, and Greenhouse/Lever/Workday patterns.
 *
 * Supported ATS platforms: Greenhouse, Lever, Workday, BambooHR, generic career pages.
 */
const express = require('express');
const cheerio = require('cheerio');
const { normalizeUrl, fetchPage, errorResponse } = require('../shared/utils');
const { getPlan } = require('../shared/planFilter');

const app = express();
app.use(express.json({ strict: false, type: () => true }));
app.use(express.urlencoded({ extended: true }));

// ──────────────────────────────────────────────
// ATS Detection
// ──────────────────────────────────────────────

function detectATS(html, urlStr) {
  if (/boards\.greenhouse\.io/i.test(urlStr) || /greenhouse-io/i.test(html)) return 'greenhouse';
  if (/jobs\.lever\.co/i.test(urlStr) || /lever-jobs/i.test(html)) return 'lever';
  if (/myworkdayjobs\.com/i.test(urlStr) || /workday/i.test(html)) return 'workday';
  if (/bamboohr\.com/i.test(urlStr)) return 'bamboohr';
  if (/jobs\.ashbyhq\.com/i.test(urlStr)) return 'ashby';
  if (/smartrecruiters\.com/i.test(urlStr)) return 'smartrecruiters';
  if (/apply\.workable\.com/i.test(urlStr)) return 'workable';
  return 'generic';
}

// ──────────────────────────────────────────────
// Schema.org JobPosting extraction
// ──────────────────────────────────────────────

function fromSchema($) {
  const jobs = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const json = JSON.parse($(el).html());
      const items = Array.isArray(json) ? json : [json];
      items.forEach(item => {
        if (item['@type'] !== 'JobPosting') return;
        jobs.push({
          title: item.title || null,
          company: item.hiringOrganization?.name || null,
          location: [
            item.jobLocation?.address?.addressLocality,
            item.jobLocation?.address?.addressRegion,
            item.jobLocation?.address?.addressCountry,
          ].filter(Boolean).join(', ') || null,
          employment_type: item.employmentType || null,
          remote: item.jobLocationType === 'TELECOMMUTE' || /remote/i.test(item.title || '') || null,
          salary: item.baseSalary
            ? `${item.baseSalary.value?.minValue || ''}-${item.baseSalary.value?.maxValue || ''} ${item.baseSalary.currency || ''}`.trim()
            : null,
          description: (item.description || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 400),
          posted_date: item.datePosted || null,
          expiry_date: item.validThrough || null,
          apply_url: item.url || null,
          source: 'schema.org',
        });
      });
    } catch {}
  });
  return jobs;
}

// ──────────────────────────────────────────────
// ATS-specific scrapers
// ──────────────────────────────────────────────

function scrapeGreenhouse($, baseUrl) {
  const jobs = [];
  $('.opening, [class*="opening"]').each((_, el) => {
    const titleEl = $(el).find('a').first();
    const title = titleEl.text().trim();
    const href = titleEl.attr('href');
    const location = $(el).find('.location, [class*="location"]').first().text().trim();
    const dept = $(el).closest('[id]').prev('[class*="department"]').text().trim() ||
                 $(el).closest('[class*="department"]').find('h3,h4').first().text().trim();
    if (title) jobs.push({
      title,
      department: dept || null,
      location: location || null,
      apply_url: href ? (href.startsWith('http') ? href : baseUrl + href) : null,
      source: 'greenhouse',
    });
  });
  return jobs;
}

function scrapeLever($, baseUrl) {
  const jobs = [];
  $('[class*="posting"], .posting').each((_, el) => {
    const titleEl = $(el).find('h5, [class*="posting-name"]').first();
    const title = titleEl.text().trim();
    const location = $(el).find('[class*="location"], [class*="workplaceTypes"]').first().text().trim();
    const dept = $(el).closest('[class*="postings-group"]').find('[class*="large-category-header"]').text().trim();
    const linkEl = $(el).find('a[href]').first();
    const href = linkEl.attr('href');
    if (title) jobs.push({
      title,
      department: dept || null,
      location: location || null,
      apply_url: href ? (href.startsWith('http') ? href : baseUrl + href) : null,
      source: 'lever',
    });
  });
  return jobs;
}

function scrapeGeneric($, baseUrl) {
  const jobs = [];
  const seen = new Set();

  // Look for job listing patterns
  const jobSelectors = [
    'li[class*="job"]', 'div[class*="job-card"]', '[class*="position"]',
    '[class*="vacancy"]', 'article[class*="job"]', 'tr[class*="job"]',
    '[data-job-id]', '[class*="career-item"]', 'li[class*="opening"]',
  ];

  for (const sel of jobSelectors) {
    $(sel).each((_, el) => {
      const linkEl = $(el).find('a[href]').first();
      const titleEl = $(el).find('h2, h3, h4, [class*="title"], [class*="name"]').first();
      const title = titleEl.text().trim() || linkEl.text().trim();
      const href = linkEl.attr('href');
      const location = $(el).find('[class*="location"], [class*="city"]').first().text().trim();
      const dept = $(el).find('[class*="department"], [class*="team"], [class*="category"]').first().text().trim();
      const type = $(el).find('[class*="type"], [class*="employment"]').first().text().trim();

      if (title && !seen.has(title)) {
        seen.add(title);
        jobs.push({
          title,
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

// ──────────────────────────────────────────────
// Route
// ──────────────────────────────────────────────

app.post('/api/job-listings', async (req, res) => {
  const plan = getPlan(req);
  const { url, filter_location, filter_department, filter_remote } = req.body;

  let urlObj;
  try { urlObj = normalizeUrl(url); } catch (e) { return errorResponse(res, 400, e.message); }

  try {
    const { response } = await fetchPage(urlObj);
    const html = typeof response.data === 'string' ? response.data : '';
    const $ = cheerio.load(html);
    const baseUrl = `${urlObj.protocol}//${urlObj.hostname}`;
    const ats = detectATS(html, urlObj.href);

    // Extract jobs using best available method
    let jobs = fromSchema($);
    if (jobs.length === 0) {
      if (ats === 'greenhouse') jobs = scrapeGreenhouse($, baseUrl);
      else if (ats === 'lever')  jobs = scrapeLever($, baseUrl);
      else                       jobs = scrapeGeneric($, baseUrl);
    }

    // Apply filters
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

    // Plan-based result cap
    const maxJobs = plan === 'free' ? 10 : plan === 'pro' ? 30 : 100;
    const cappedJobs = jobs.slice(0, maxJobs);

    // Department breakdown (pro+)
    let byDepartment = null;
    if (plan !== 'free') {
      byDepartment = {};
      cappedJobs.forEach(j => {
        const dept = j.department || 'Other';
        byDepartment[dept] = (byDepartment[dept] || 0) + 1;
      });
    }

    const result = {
      url: urlObj.href,
      ats_platform: ats,
      total_found: jobs.length,
      jobs_returned: cappedJobs.length,
      jobs: cappedJobs,
      ...(plan !== 'free' && {
        by_department: byDepartment,
        remote_count: jobs.filter(j => j.remote || /remote/i.test(j.title || '') || /remote/i.test(j.location || '')).length,
      }),
      ...(plan === 'ultra' || plan === 'mega'
        ? {
            filters_applied: {
              location: filter_location || null,
              department: filter_department || null,
              remote_only: filter_remote || false,
            },
          }
        : {}),
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
  app.listen(PORT, () => console.log(`job-listings running on port ${PORT}`));
}

module.exports = app;
