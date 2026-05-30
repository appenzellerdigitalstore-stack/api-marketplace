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
  function flattenJsonLd(value) {
    if (!value) return [];
    const queue = Array.isArray(value) ? value.slice() : [value];
    const items = [];
    while (queue.length) {
      const item = queue.shift();
      if (!item || typeof item !== 'object') continue;
      items.push(item);
      if (Array.isArray(item['@graph'])) queue.push(...item['@graph']);
      if (Array.isArray(item.itemListElement)) {
        item.itemListElement.forEach((entry) => {
          if (entry && typeof entry === 'object') queue.push(entry.item || entry);
        });
      }
    }
    return items;
  }

  $('script[type="application/ld+json"]').each((_, el) => {
    if (product) return;
    try {
      const json = JSON.parse($(el).html());
      const items = flattenJsonLd(json);
      for (const item of items) {
        const type = Array.isArray(item['@type']) ? item['@type'] : [item['@type']];
        if (type.includes('Product') || type.includes('ItemPage')) {
          product = item;
          break;
        }
      }
    } catch (_) {}
  });
  if (!product) return null;

  const offer = product.offers || product.offer;
  const offerObj = Array.isArray(offer) ? offer[0] : offer;

  return {
    name:         product.name || null,
    description:  (product.description || '').slice(0, 300) || null,
    brand:        (product.brand && (product.brand.name || product.brand)) || null,
    sku:          product.sku || product.mpn || null,
    price:        parsePrice(offerObj && offerObj.price),
    currency:     (offerObj && offerObj.priceCurrency) || extractCurrency(offerObj && offerObj.price),
    availability: offerObj && offerObj.availability ? offerObj.availability.replace('https://schema.org/', '') : null,
    condition:    offerObj && offerObj.itemCondition ? offerObj.itemCondition.replace('https://schema.org/', '') : null,
    seller:       (offerObj && offerObj.seller && offerObj.seller.name) || null,
    rating:       product.aggregateRating && product.aggregateRating.ratingValue
                    ? parseFloat(product.aggregateRating.ratingValue) : null,
    review_count: product.aggregateRating && product.aggregateRating.reviewCount
                    ? parseInt(product.aggregateRating.reviewCount) : null,
    images: Array.isArray(product.image)
      ? product.image.slice(0, 5)
      : product.image ? [product.image] : [],
  };
}

function fromOpenGraph($) {
  const get = prop => $('meta[property="' + prop + '"]').attr('content') ||
                      $('meta[name="' + prop + '"]').attr('content') || null;
  const price    = get('product:price:amount') || get('og:price:amount');
  const currency = get('product:price:currency') || get('og:price:currency');
  const image    = get('og:image');
  return {
    name:         get('og:title'),
    description:  (get('og:description') || '').slice(0, 300),
    price:        parsePrice(price),
    currency:     currency || extractCurrency(price),
    images:       image ? [image] : [],
    availability: get('product:availability'),
    brand:        get('product:brand') || get('og:brand'),
    sku:          get('product:retailer_item_id') || null,
    rating: null, review_count: null, condition: null, seller: null,
  };
}

function fromDOM($, urlStr) {
  // Platform-specific selectors first
  const priceSelectors = [
    // Amazon
    '#priceblock_ourprice', '#priceblock_dealprice', '.a-price .a-offscreen',
    '#price_inside_buybox', '#newBuyBoxPrice',
    // eBay
    '#prcIsum', '#mm-saleDscPrc', '.x-price-primary span',
    // Shopify / WooCommerce
    '.price--sale .price__item--sale', '.product__price', '.woocommerce-Price-amount',
    'ins .woocommerce-Price-amount', '.price ins',
    // Generic structured
    '[itemprop="price"]',
    // Generic heuristics
    '[class*="sale-price"]', '[class*="sale_price"]', '[class*="final-price"]',
    '[data-price]', '[data-product-price]',
    '[class*="price"]:not([class*="was"]):not([class*="old"]):not([class*="compare"]):not([class*="regular"])',
    '#price', '.product-price', '.offer-price', '.current-price',
    '[class*="Price"]:not([class*="Was"]):not([class*="Old"]):not([class*="Compare"])',
  ];

  let rawPrice = null;
  for (const sel of priceSelectors) {
    const el = $(sel).first();
    if (el.length) {
      rawPrice = el.attr('content') || el.attr('data-price') || el.attr('data-product-price') || el.text().trim();
      if (rawPrice && /\d/.test(rawPrice)) break;
    }
  }

  if (!rawPrice) {
    $('[data-price]').each((_, el) => {
      const v = $(el).attr('data-price');
      if (v && /\d/.test(v)) { rawPrice = v; return false; }
    });
  }

  const titleSelectors = [
    '#productTitle', '[itemprop="name"]', 'h1.product-title', 'h1.product_title',
    'h1[class*="product"]', 'h1[class*="title"]', 'h1',
    '.product-name', '.product-title', '#itemTitle',
  ];
  let name = null;
  for (const sel of titleSelectors) {
    const t = $(sel).first().text().trim();
    if (t && t.length > 3) { name = t; break; }
  }

  const availText = $('[itemprop="availability"], #availability, [class*="availability"], [class*="in-stock"], [class*="stock"]').first().text().trim();

  const images = [];
  $('[itemprop="image"], img[class*="product"], img[id*="product"], img[class*="main"]').each((_, el) => {
    const src = $(el).attr('src') || $(el).attr('data-src') || $(el).attr('data-lazy-src');
    if (src && src.startsWith('http') && !images.includes(src)) images.push(src);
  });

  return {
    name,
    price:        parsePrice(rawPrice),
    currency:     extractCurrency(rawPrice),
    availability: availText || null,
    images:       images.slice(0, 5),
    description: null, brand: null, sku: null, rating: null,
    review_count: null, condition: null, seller: null,
  };
}

function detectPlatform(html, urlStr) {
  if (urlStr.includes('amazon.'))     return 'amazon';
  if (urlStr.includes('ebay.'))       return 'ebay';
  if (/cdn\.shopify\.com/i.test(html)) return 'shopify';
  if (/woocommerce/i.test(html))      return 'woocommerce';
  if (/etsy\.com/i.test(urlStr))      return 'etsy';
  if (/walmart\.com/i.test(urlStr))   return 'walmart';
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

    const schema = fromSchema($, html);
    const og     = fromOpenGraph($);
    const dom    = fromDOM($, urlObj.href);

    const merged = {
      name:         schema && schema.name || og && og.name || dom && dom.name,
      description:  schema && schema.description || og && og.description || dom && dom.description,
      brand:        schema && schema.brand || og && og.brand || dom && dom.brand,
      sku:          schema && schema.sku || og && og.sku || dom && dom.sku,
      price:        schema && schema.price != null ? schema.price : (og && og.price != null ? og.price : (dom && dom.price)),
      currency:     (schema && schema.currency) || (og && og.currency) || (dom && dom.currency) || 'USD',
      availability: (schema && schema.availability) || (og && og.availability) || (dom && dom.availability),
      condition:    (schema && schema.condition) || (dom && dom.condition),
      seller:       (schema && schema.seller) || (dom && dom.seller),
      rating:       (schema && schema.rating) || (dom && dom.rating),
      review_count: (schema && schema.review_count) || (dom && dom.review_count),
      images:       (schema && schema.images && schema.images.length ? schema.images :
                     og && og.images && og.images.length ? og.images : (dom && dom.images)) || [],
    };

    const platform = detectPlatform(html, urlObj.href);

    const result = {
      url:          urlObj.href,
      platform,
      product_name: merged.name,
      price:        merged.price,
      currency:     merged.currency,
      availability: merged.availability,
      ...(plan !== 'free' && {
        description:  merged.description,
        brand:        merged.brand,
        sku:          merged.sku,
        condition:    merged.condition,
        seller:       merged.seller,
        rating:       merged.rating,
        review_count: merged.review_count,
      }),
      ...((plan === 'ultra' || plan === 'mega') ? { images: merged.images } : {}),
      extraction_sources: [
        schema ? 'schema.org' : null,
        (og && og.price) ? 'open_graph' : null,
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
  app.listen(PORT, () => console.log('price-tracker running on port ' + PORT));
}

module.exports = app;
