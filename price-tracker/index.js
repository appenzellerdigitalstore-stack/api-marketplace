/**
 * /api/price-tracker
 * Extracts product price, title, availability, rating, images and seller info
 * from any e-commerce product page using schema.org, Open Graph, and DOM heuristics.
 * Works across Amazon, eBay, Shopify stores, WooCommerce, and generic product pages.
 */
const express = require('express');
const cheerio = require('cheerio');
const { normalizeUrl, fetchPage, errorResponse } = require('../shared/utils');
const { getPlan } = require('../shared/planFilter');

const app = express();
app.use(express.json({ strict: false, type: () => true }));
app.use(express.urlencoded({ extended: true }));

// Price-like string extractor
function parsePrice(str) {
  if (!str) return null;
  const match = String(str).replace(/,/g, '').match(/[\d]+(?:\.\d{1,2})?/);
  return match ? parseFloat(match[0]) : null;
}

function extractCurrency(str) {
  if (!str) return null;
  const symbols = { '$': 'USD', '€': 'EUR', '£': 'GBP', '¥': 'JPY', '₹': 'INR', 'R$': 'BRL' };
  for (const [sym, code] of Object.entries(symbols)) {
    if (String(str).includes(sym)) return code;
  }
  const match = String(str).match(/\b([A-Z]{3})\b/);
  return match ? match[1] : null;
}

function fromSchema($, html) {
  let product = null;
  $('script[type="application/ld+json"]').each((_, el) => {
    if (product) return;
    try {
      const json = JSON.parse($(el).html());
      const items = Array.isArray(json) ? json : [json];
      for (const item of items) {
        if (item['@type'] === 'Product' || item['@type'] === 'ItemPage') {
          product = item;
          break;
        }
      }
    } catch {}
  });
  if (!product) return null;

  const offer = product.offers || product.offer;
  const offerObj = Array.isArray(offer) ? offer[0] : offer;

  return {
    name: product.name || null,
    description: (product.description || '').slice(0, 300) || null,
    brand: product.brand?.name || product.brand || null,
    sku: product.sku || product.mpn || null,
    price: parsePrice(offerObj?.price),
    currency: offerObj?.priceCurrency || extractCurrency(offerObj?.price),
    availability: offerObj?.availability?.replace('https://schema.org/', '') || null,
    condition: offerObj?.itemCondition?.replace('https://schema.org/', '') || null,
    seller: offerObj?.seller?.name || null,
    rating: product.aggregateRating?.ratingValue
      ? parseFloat(product.aggregateRating.ratingValue)
      : null,
    review_count: product.aggregateRating?.reviewCount
      ? parseInt(product.aggregateRating.reviewCount)
      : null,
    images: Array.isArray(product.image)
      ? product.image.slice(0, 5)
      : product.image ? [product.image] : [],
  };
}

function fromOpenGraph($) {
  const get = prop => $(`meta[property="${prop}"]`).attr('content') ||
                      $(`meta[name="${prop}"]`).attr('content') || null;
  const price = get('product:price:amount') || get('og:price:amount');
  const currency = get('product:price:currency') || get('og:price:currency');
  const image = get('og:image');
  return {
    name: get('og:title'),
    description: (get('og:description') || '').slice(0, 300),
    price: parsePrice(price),
    currency: currency || extractCurrency(price),
    images: image ? [image] : [],
    availability: get('product:availability'),
    brand: get('product:brand') || get('og:brand'),
    sku: get('product:retailer_item_id') || null,
    rating: null, review_count: null, condition: null, seller: null,
  };
}

function fromDOM($) {
  // Heuristic selectors for price
  const priceSelectors = [
    '[itemprop="price"]', '[class*="price"]:not([class*="was"]):not([class*="old"])',
    '#price', '.product-price', '.offer-price', '[data-price]',
    '[class*="Price"]:not([class*="Was"]):not([class*="Old"])',
  ];
  let rawPrice = null;
  for (const sel of priceSelectors) {
    const el = $(sel).first();
    if (el.length) {
      rawPrice = el.attr('content') || el.attr('data-price') || el.text().trim();
      if (rawPrice && /\d/.test(rawPrice)) break;
    }
  }

  // Title heuristics
  const titleSelectors = ['[itemprop="name"]', 'h1', '.product-title', '.product-name', '#productTitle'];
  let name = null;
  for (const sel of titleSelectors) {
    const t = $(sel).first().text().trim();
    if (t && t.length > 3) { name = t; break; }
  }

  // Availability heuristics
  const availText = $('[itemprop="availability"], [class*="availability"], [class*="stock"]').first().text().trim();

  // Images
  const images = [];
  $('[itemprop="image"], img[class*="product"], img[id*="product"], img[class*="main"]').each((_, el) => {
    const src = $(el).attr('src') || $(el).attr('data-src') || $(el).attr('data-lazy-src');
    if (src && src.startsWith('http') && !images.includes(src)) images.push(src);
  });

  return {
    name,
    price: parsePrice(rawPrice),
    currency: extractCurrency(rawPrice),
    availability: availText || null,
    images: images.slice(0, 5),
    description: null, brand: null, sku: null, rating: null, review_count: null,
    condition: null, seller: null,
  };
}

function detectPlatform(html, urlStr) {
  if (urlStr.includes('amazon.')) return 'amazon';
  if (urlStr.includes('ebay.')) return 'ebay';
  if (/cdn\.shopify\.com/i.test(html)) return 'shopify';
  if (/woocommerce/i.test(html)) return 'woocommerce';
  if (/etsy\.com/i.test(urlStr)) return 'etsy';
  if (/walmart\.com/i.test(urlStr)) return 'walmart';
  return 'generic';
}

app.post('/api/price-tracker', async (req, res) => {
  const plan = getPlan(req);
  const { url } = { ...req.query, ...req.body };

  let urlObj;
  try { urlObj = normalizeUrl(url); } catch (e) { return errorResponse(res, 400, e.message); }

  try {
    const { response } = await fetchPage(urlObj);
    const html = typeof response.data === 'string' ? response.data : '';
    const $ = cheerio.load(html);

    // Layered extraction: schema > OG > DOM
    const schema = fromSchema($, html);
    const og = fromOpenGraph($);
    const dom = fromDOM($);

    const merged = {
      name:         schema?.name || og?.name || dom?.name,
      description:  schema?.description || og?.description || dom?.description,
      brand:        schema?.brand || og?.brand || dom?.brand,
      sku:          schema?.sku || og?.sku || dom?.sku,
      price:        schema?.price ?? og?.price ?? dom?.price,
      currency:     schema?.currency || og?.currency || dom?.currency || 'USD',
      availability: schema?.availability || og?.availability || dom?.availability,
      condition:    schema?.condition || dom?.condition,
      seller:       schema?.seller || dom?.seller,
      rating:       schema?.rating || dom?.rating,
      review_count: schema?.review_count || dom?.review_count,
      images:       (schema?.images?.length ? schema.images : og?.images?.length ? og.images : dom?.images) || [],
    };

    const platform = detectPlatform(html, urlObj.href);

    const result = {
      url: urlObj.href,
      platform,
      product_name: merged.name,
      price: merged.price,
      currency: merged.currency,
      availability: merged.availability,
      ...(plan !== 'free' && {
        description: merged.description,
        brand: merged.brand,
        sku: merged.sku,
        condition: merged.condition,
        seller: merged.seller,
        rating: merged.rating,
        review_count: merged.review_count,
      }),
      ...(plan === 'ultra' || plan === 'mega'
        ? { images: merged.images }
        : {}),
      extraction_sources: [
        schema ? 'schema.org' : null,
        og?.price ? 'open_graph' : null,
        'dom_heuristics',
      ].filter(Boolean),
      plan,
    };

    res.json({ success: true, data: result });
  } catch (err) {
    console.error('[price-tracker]', err.message);
    return errorResponse(res, 500, 'Failed to extract product data from this URL');
  }
});

if (require.main === module) {
  const PORT = process.env.PORT || 3016;
  app.listen(PORT, () => console.log(`price-tracker running on port ${PORT}`));
}

module.exports = app;
