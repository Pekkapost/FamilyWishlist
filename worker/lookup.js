// Cloudflare Worker for Family Wishlist link autofill.
//
//   GET /?url=<product page>  →  { status: 'success', data: { title, price, currency } }
//                                { status: 'fail', code }
//
// Fetches the page from Cloudflare's network (never the visitor's) and returns only a
// name and price, so it can't be used as an open proxy. Only the app's own origins get
// an answer, and successful lookups are cached so repeat pastes don't refetch the store.

const ALLOWED_ORIGINS = [
  'https://pekkapost.github.io',
  'http://localhost:8765',
  'http://localhost:8000'
];
const FETCH_TIMEOUT_MS = 8000;
const CACHE_SECONDS = 6 * 60 * 60;
const CACHE_VERSION = 2;  // bump when parsing changes, so older cached answers are ignored
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
const BLOCKED_TITLE = /robot check|robot or human|captcha|access denied|attention required|just a moment|are you a (human|robot)|page not found/i;

// Amazon keeps its price in page markup rather than meta tags or structured data.
const AMAZON_PRICE_SELECTORS = [
  '#corePriceDisplay_desktop_feature_div .a-offscreen',
  '#corePrice_feature_div .a-offscreen',
  '#apex_desktop .a-offscreen'
];

export default {
  async fetch(request, env, ctx) {
    const origin = request.headers.get('Origin') || '';
    if (!ALLOWED_ORIGINS.includes(origin)) return json({ status: 'fail', code: 'EORIGIN' }, 403);
    const cors = { 'Access-Control-Allow-Origin': origin, 'Vary': 'Origin' };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: { ...cors, 'Access-Control-Allow-Methods': 'GET' } });
    }
    if (request.method !== 'GET') return json({ status: 'fail', code: 'EMETHOD' }, 405, cors);

    const target = parseTarget(new URL(request.url).searchParams.get('url'));
    if (!target) return json({ status: 'fail', code: 'EINVALURL' }, 400, cors);

    const cache = caches.default;
    const cacheKey = new Request('https://lookup-cache.invalid/v' + CACHE_VERSION + '/' + encodeURIComponent(target.href));
    const cached = await cache.match(cacheKey);
    if (cached) return json(await cached.json(), 200, cors);

    let result;
    try {
      result = await lookup(target);
    } catch (e) {
      result = { status: 'fail', code: e.name === 'TimeoutError' ? 'ETIMEOUT' : 'EFETCH' };
    }

    if (result.status === 'success') {
      ctx.waitUntil(cache.put(cacheKey, json(result, 200, { 'Cache-Control': 'max-age=' + CACHE_SECONDS })));
    }
    return json(result, 200, cors);
  }
};

function json(body, status, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers }
  });
}

// Public http(s) pages only — no IP addresses or internal hostnames.
function parseTarget(raw) {
  let url;
  try { url = new URL(raw); } catch (e) { return null; }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  const host = url.hostname;
  if (!host.includes('.') || /^[\d.]+$/.test(host) || host.startsWith('[') || /(^|\.)localhost$/.test(host)) return null;
  return url;
}

async function lookup(url) {
  const res = await fetch(url.href, {
    headers: {
      'User-Agent': USER_AGENT,
      'Accept': 'text/html,application/xhtml+xml',
      'Accept-Language': 'en-US,en;q=0.9'
    },
    redirect: 'follow',
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)
  });
  if (res.status === 403 || res.status === 429 || res.status === 503) return { status: 'fail', code: 'EBLOCKED' };
  if (!res.ok) return { status: 'fail', code: 'EHTTP' + res.status };
  if (!(res.headers.get('Content-Type') || '').includes('html')) return { status: 'fail', code: 'ENOTHTML' };

  const page = await readPage(res);
  const title = decodeEntities(page.productTitle || page.ogTitle || page.title).replace(/\s+/g, ' ').trim();
  if (!title || BLOCKED_TITLE.test(title)) return { status: 'fail', code: 'EBLOCKED' };

  const offer = offerFromJsonLd(page.jsonLd)
    || (page.metaPrice && { price: page.metaPrice, currency: page.metaCurrency })
    || amazonOffer(page.amazonPrice);
  return {
    status: 'success',
    data: {
      title,
      price: offer ? String(offer.price).trim() : null,
      currency: offer ? (offer.currency || '').toUpperCase() : null
    }
  };
}

// Streams the page through HTMLRewriter, keeping only the bits needed — cheap even for
// Amazon's ~2 MB product pages.
async function readPage(res) {
  const page = { title: '', ogTitle: '', productTitle: '', metaPrice: '', metaCurrency: '', amazonPrice: '', jsonLd: [] };
  const firstText = key => {
    let active = false;
    return {
      element() { active = !page[key]; },
      text(chunk) { if (active) page[key] += chunk.text; }
    };
  };

  let rewriter = new HTMLRewriter()
    .on('head title', firstText('title'))
    .on('#productTitle', firstText('productTitle'))
    .on('meta', {
      element(el) {
        const key = (el.getAttribute('property') || el.getAttribute('name') || el.getAttribute('itemprop') || '').toLowerCase();
        const content = el.getAttribute('content') || '';
        if (!content) return;
        if (key === 'og:title' && !page.ogTitle) page.ogTitle = content;
        if ((key === 'product:price:amount' || key === 'og:price:amount' || key === 'price') && !page.metaPrice) page.metaPrice = content;
        if ((key === 'product:price:currency' || key === 'og:price:currency' || key === 'pricecurrency') && !page.metaCurrency) page.metaCurrency = content;
      }
    })
    .on('script[type="application/ld+json"]', {
      element() { page.jsonLd.push(''); },
      text(chunk) { page.jsonLd[page.jsonLd.length - 1] += chunk.text; }
    });
  for (const selector of AMAZON_PRICE_SELECTORS) rewriter = rewriter.on(selector, firstText('amazonPrice'));

  await rewriter.transform(res).arrayBuffer();
  return page;
}

function offerFromJsonLd(blocks) {
  for (const raw of blocks) {
    let data;
    try { data = JSON.parse(raw); } catch (e) { continue; }
    const offer = findOffer(data, 0);
    if (offer) return offer;
  }
  return null;
}

function findOffer(node, depth) {
  if (!node || typeof node !== 'object' || depth > 6) return null;
  if (Array.isArray(node)) {
    for (const item of node) {
      const offer = findOffer(item, depth + 1);
      if (offer) return offer;
    }
    return null;
  }
  for (const o of [].concat(node.offers || [])) {
    if (!o || typeof o !== 'object') continue;
    const spec = o.priceSpecification || {};
    const price = o.price ?? o.lowPrice ?? spec.price;
    if (price !== undefined && price !== null && price !== '') {
      return { price, currency: o.priceCurrency || spec.priceCurrency || '' };
    }
  }
  for (const key of ['@graph', 'mainEntity', 'itemListElement']) {
    const offer = findOffer(node[key], depth + 1);
    if (offer) return offer;
  }
  return null;
}

// "$199.99" → { price: '199.99', currency: 'USD' }
function amazonOffer(text) {
  const match = (text || '').match(/\$\s*([\d,]+(?:\.\d+)?)/);
  return match ? { price: match[1].replace(/,/g, ''), currency: 'USD' } : null;
}

function decodeEntities(s) {
  return (s || '')
    .replace(/&#x([0-9a-f]+);/gi, (m, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (m, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');
}
