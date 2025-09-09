import { load } from 'cheerio';
import { client } from '../utils/client.js';

const DEFAULT_BASE = 'https://animekai.to';
const KAISVA_URL = 'https://ilovekai.simplepostrequest.workers.dev'; // Cloudflare Worker decoder

function fixUrl(url, base = DEFAULT_BASE) {
  if (!url) return '';
  if (url.startsWith('http')) return url;
  return `${base.replace(/\/$/, '')}/${url.replace(/^\//, '')}`;
}

async function requestWithRetry(url, config = {}, retries = 2, perRequestTimeoutMs = 60000) {
  let lastErr;
  for (let i = 0; i <= retries; i++) {
    try {
      const { data } = await client.get(url, { timeout: perRequestTimeoutMs, ...config });
      return data;
    } catch (e) {
      lastErr = e;
      if (i < retries) await new Promise(r => setTimeout(r, 500 * (i + 1)));
    }
  }
  throw lastErr;
}

// Optional: use Playwright headless browser to intercept .m3u8 and .vtt
async function extractFromMegaUpHeadless(pageUrl, baseHeaders) {
  try {
    const { chromium } = await import('playwright').catch(() => ({ chromium: null }));
    if (!chromium) return null; // Playwright not installed

    const ua = baseHeaders['User-Agent'] || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36';
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      userAgent: ua,
      extraHTTPHeaders: {
        Referer: baseHeaders.Referer || 'https://megaup.site',
        'Accept-Language': baseHeaders['Accept-Language'] || 'en-US,en;q=0.9',
      },
    });
    const page = await context.newPage();

    const seenM3U8 = new Set();
    const seenVTT = new Set();

    page.on('request', (req) => {
      try {
        const url = req.url();
        if (/\.m3u8(\?|$)/i.test(url)) seenM3U8.add(url);
        if (/\.vtt(\?|$)/i.test(url) && !/thumbnails/i.test(url)) seenVTT.add(url);
      } catch {}
    });

    await page.goto(pageUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    // Try multiple common play selectors
    const playSelectors = ['button', '.vjs-big-play-button', '.plyr__control', '.jw-icon-playback'];
    for (const sel of playSelectors) {
      const btn = page.locator(sel).first();
      if (await btn.count().catch(() => 0)) {
        await btn.click({ timeout: 3000 }).catch(() => {});
      }
    }
    // Explicitly wait for an HLS request
    await Promise.race([
      page.waitForRequest(req => /\.m3u8(\?|$)/i.test(req.url()), { timeout: 10000 }).catch(() => null),
      page.waitForTimeout(7000),
    ]);

    const m3u8 = Array.from(seenM3U8)[0];
    const subtitles = Array.from(seenVTT).map((u) => ({ file: u, label: extractLangLabelFromUrl(u), kind: 'captions' }));

    await context.close();
    await browser.close();

    if (m3u8) {
      const pageUrlObj = new URL(pageUrl);
      const origin = `${pageUrlObj.protocol}//${pageUrlObj.host}`;
      return {
        headers: { Referer: origin, 'User-Agent': ua },
        sources: [ { url: m3u8, isM3U8: true } ],
        subtitles,
      };
    }
    return null;
  } catch {
    return null;
  }
}

async function decodeParam(value, mode = 'e') {
  // Always use worker-style: ilovefeet (encode) and ilovearmpits (decode)
  const url = new URL(KAISVA_URL);
  const paramName = mode === 'e' ? 'ilovefeet' : 'ilovearmpits';
  url.searchParams.set(paramName, value);
  return await requestWithRetry(url.toString(), { responseType: 'text' }, 2, 30000);
}

async function getJson(url, params = {}, headers = {}) {
  return await requestWithRetry(url, { params, headers }, 2, 30000);
}

function extractBackgroundUrl(style) {
  if (!style) return '';
  const m = style.match(/url\(([^)]+)\)/i);
  if (!m) return '';
  return m[1].replace(/^['"]|['"]$/g, '');
}

/**
 * AnimeKai provider implemented via scraping
 */
export class AnimeKai {
  constructor(baseUrl = DEFAULT_BASE) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  /**
   * Search AnimeKai by keyword
   */
  async search(query) {
    const url = `${this.baseUrl}/browser?keyword=${encodeURIComponent(query)}`;
    const { data: html } = await client.get(url, { responseType: 'text', headers: { Referer: this.baseUrl } });
    const $ = load(html);
    const results = $("div.aitem-wrapper div.aitem").map((_, el) => {
      const item = $(el);
      const href = fixUrl(item.find('a.poster').attr('href'), this.baseUrl);
      const title = item.find('a.title').text().trim();
      const subCount = parseInt(item.find('div.info span.sub').text().trim() || '0', 10) || 0;
      const dubCount = parseInt(item.find('div.info span.dub').text().trim() || '0', 10) || 0;
      const posterUrl = fixUrl(item.find('a.poster img').attr('data-src') || item.find('a.poster img').attr('src'), this.baseUrl);
      const type = (item.find('div.fd-infor > span.fdi-item').text().trim() || '').toLowerCase();
      return {
        id: href,
        url: href,
        title,
        image: posterUrl,
        type,
        subCount,
        dubCount,
      };
    }).get();
    return { results };
  }

  /**
   * Fetch anime info and episodes from a show page URL
   */
  async fetchAnimeInfo(idOrUrl) {
    const url = fixUrl(idOrUrl, this.baseUrl);
    const { data: html } = await client.get(url, { responseType: 'text', headers: { Referer: this.baseUrl } });
    const $ = load(html);

    const title = $('h1.title').first().text().trim();
    const japaneseTitle = $('h1.title').first().attr('data-jp') || '';
    const animeId = $('div.rate-box').attr('data-id');
    const malId = $('div.watch-section').attr('data-mal-id') || null;
    const aniId = $('div.watch-section').attr('data-al-id') || null;
    const subCount = parseInt($('#main-entity div.info span.sub').text().trim() || '0', 10) || 0;
    const dubCount = parseInt($('#main-entity div.info span.dub').text().trim() || '0', 10) || 0;
    const bgStyle = $('div.watch-section-bg').attr('style') || '';
    const posterFromBg = extractBackgroundUrl(bgStyle);

    const underscore = await decodeParam(animeId, 'e');
    const listJson = await getJson(`${this.baseUrl}/ajax/episodes/list`, { ani_id: animeId, _: underscore }, { Referer: url });
    const listHtml = listJson?.result || '';
    const $$ = load(listHtml);

    const episodes = [];
    $$("div.eplist a").each((index, el) => {
      const a = $$(el);
      const token = a.attr('token');
      const name = a.find('span').text().trim();
      const numAttr = a.attr('num');
      const number = numAttr ? parseInt(numAttr, 10) : (index + 1);
      if (token) {
        episodes.push({ id: token, number, title: name });
      }
    });

    // Optional enrichment from Ani.zip when MAL id is present
    let aniZip = null;
    if (malId) {
      try {
        const { data: aniZipData } = await client.get(`https://api.ani.zip/mappings`, { params: { mal_id: malId } });
        aniZip = aniZipData || null;
      } catch {
        aniZip = null;
      }
      if (aniZip && aniZip.episodes) {
        // Attach episode metadata when index matches
        episodes.forEach((ep) => {
          const meta = aniZip.episodes?.[String(ep.number)];
          if (meta) {
            ep.image = meta.image || undefined;
            ep.overview = meta.overview || undefined;
            const r = parseFloat(meta.rating || '0');
            ep.rating = Number.isFinite(r) ? Math.round(r * 10) : 0;
          }
        });
      }
    }

    // Genres
    const genres = $('div.detail a')
      .toArray()
      .map((el) => ({ href: $(el).attr('href') || '', text: $(el).text().trim() }))
      .filter((x) => x.href.includes('/genres/'))
      .map((x) => x.text);

    // Status: avoid :containsOwn which isn't supported by css-select
    let statusText = undefined;
    const statusDiv = $('div').filter((_, el) => /\bstatus\b/i.test($(el).text()));
    if (statusDiv.length) {
      const spanTxt = statusDiv.first().find('span').first().text().trim();
      if (spanTxt) statusText = spanTxt;
    }

    return {
      id: url,
      title,
      japaneseTitle,
      url,
      image: posterFromBg ? fixUrl(posterFromBg, this.baseUrl) : undefined,
      type: 'anime',
      totalEpisodes: episodes.length,
      episodes,
      hasSub: subCount > 0,
      hasDub: dubCount > 0,
      subOrDub: subCount && dubCount ? 'both' : (dubCount ? 'dub' : 'sub'),
      status: statusText,
      season: undefined,
      genres,
      malId: malId ? Number(malId) : undefined,
      anilistId: aniId ? Number(aniId) : undefined,
    };
  }

  /**
   * Fetch episode sources for a given episode token
   * @param {string} episodeToken
   * @param {string} serverName optional server display name filter
   * @param {boolean} dub fetch dubbed if true (also tries softsub when false)
   */
  async fetchEpisodeSources(episodeToken, serverName = undefined, dub = false) {
    const underscoreToken = await decodeParam(episodeToken, 'e');
    const listJson = await getJson(`${this.baseUrl}/ajax/links/list`, { token: episodeToken, _: underscoreToken }, { Referer: this.baseUrl });
    const listHtml = listJson?.result || '';
    const $ = load(listHtml);

    const preferredTypes = dub ? ['dub'] : ['sub', 'softsub'];
    const serverCandidates = [];
    preferredTypes.forEach((type) => {
      $(`div.server-items[data-id=${type}] span.server[data-lid]`).each((_, el) => {
        const span = $(el);
        serverCandidates.push({
          type,
          lid: span.attr('data-lid'),
          name: span.text().trim(),
        });
      });
    });

    if (serverCandidates.length === 0) {
      throw new Error('No servers found for this episode');
    }

    let chosen = serverCandidates[0];
    if (serverName) {
      const found = serverCandidates.find(s => s.name.toLowerCase() === serverName.toLowerCase());
      if (found) chosen = found;
    }

    const underscoreLid = await decodeParam(chosen.lid, 'e');
    const viewJson = await getJson(`${this.baseUrl}/ajax/links/view`, { id: chosen.lid, _: underscoreLid }, { Referer: this.baseUrl });
    const result = viewJson?.result || '';

    const decodedText = await decodeParam(result, 'd');
    let iframeUrl = '';
    try {
      const parsed = JSON.parse(decodedText);
      iframeUrl = parsed.url || '';
    } catch {
      const m = decodedText.match(/\"url\"\s*:\s*\"(.*?)\"/);
      if (m) iframeUrl = m[1].replace(/\\\//g, '/');
    }

    if (!iframeUrl) {
      throw new Error('Failed to resolve iframe URL');
    }

    // If MegaUp, try to extract direct m3u8 and subtitles
    if (/megaup\.(site|cc)/i.test(iframeUrl)) {
      const resolved = await extractFromMegaUp(iframeUrl);
      if (resolved) return resolved;
    }

    return {
      headers: {
        Referer: this.baseUrl,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
      },
      sources: [
        { url: iframeUrl, isM3U8: /\.m3u8($|\?)/.test(iframeUrl) }
      ],
      subtitles: [],
    };
  }
}

// Try to resolve .m3u8 and .vtt subtitle links from MegaUp pages without a WebView
async function extractFromMegaUp(pageUrl) {
  try {
    const pageUrlObj = new URL(pageUrl);
    const origin = `${pageUrlObj.protocol}//${pageUrlObj.host}`;
    const headers = {
      Referer: 'https://megaup.site',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:134.0) Gecko/20100101 Firefox/134.0',
      Accept: '*/*',
      'Accept-Language': 'en-US,en;q=0.9',
      Pragma: 'no-cache',
      'Cache-Control': 'no-cache',
    };
    const html = await requestWithRetry(pageUrl, { responseType: 'text', headers }, 1, 30000);

    // Look for HLS URLs in HTML/inline scripts
    const m3u8Matches = String(html).match(/https?:[^\"'\s]+\.m3u8[^\"'\s]*/gi) || [];

    // Collect subtitle .vtt links
    const vttMatches = String(html).match(/https?:[^\"'\s]+\.vtt[^\"'\s]*/gi) || [];
    const subtitles = vttMatches
      .filter((u) => !/thumbnails/i.test(u))
      .map((u) => ({
        file: u,
        label: extractLangLabelFromUrl(u),
        kind: 'captions',
      }));

    if (m3u8Matches.length > 0) {
      const file = m3u8Matches[0];
      return {
        headers: { Referer: origin, 'User-Agent': headers['User-Agent'] },
        sources: [ { url: file, isM3U8: true } ],
        subtitles,
      };
    }

    // If not found via static scraping, try headless interception if available
    const headless = await extractFromMegaUpHeadless(pageUrl, headers);
    if (headless) return headless;
    // If still not found, return null to fall back to iframe
    return null;
  } catch {
    return null;
  }
}

function extractLangLabelFromUrl(url) {
  try {
    const file = url.split('/').pop() || '';
    const code = (file.split('_')[0] || '').toLowerCase();
    const map = {
      eng: 'English', ger: 'German', deu: 'German', spa: 'Spanish', fre: 'French', fra: 'French',
      ita: 'Italian', jpn: 'Japanese', chi: 'Chinese', zho: 'Chinese', kor: 'Korean', rus: 'Russian',
      ara: 'Arabic', hin: 'Hindi', por: 'Portuguese', vie: 'Vietnamese', pol: 'Polish', ukr: 'Ukrainian',
      swe: 'Swedish', ron: 'Romanian', rum: 'Romanian', ell: 'Greek', gre: 'Greek', hun: 'Hungarian',
      fas: 'Persian', per: 'Persian', tha: 'Thai'
    };
    return map[code] || code.toUpperCase() || 'Subtitle';
  } catch { return 'Subtitle'; }
}

export default AnimeKai; 