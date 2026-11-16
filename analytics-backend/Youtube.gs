/**
 * yCanta - YouTube search for songs without video links (#151).
 *
 * The app sends { action: "search", query: "<title> <authors>" } (Server.gs routes it here) and gets back
 * { results: [{ videoId, title, channel }] }, or { error, limit: true } when today's searches are used up.
 *
 * - No API key: Apps Script's built-in YouTube service (Resources > YouTube Data API v3, in appsscript.json)
 *   runs as the yCanta account that deploys the web app. Its first deploy asks that account for a YouTube
 *   permission.
 * - Each new search costs 100 of the 10,000 daily units (about 100 a day), so answers are kept: in the cache
 *   for 6 hours (fast), and in this sheet's "YouTube" tab for up to 30 days. YouTube's rules say kept results
 *   must be refreshed or deleted within 30 days, so older rows are searched again, and deleted when a new
 *   search is saved.
 * - At most YT_DAILY_CAP new searches a day (YouTube's day starts at midnight Pacific), so a flood of new
 *   songs can't use up the allowance.
 *
 * Needs from Config.gs: ANALYTICS_SHEET_ID.
 */
const YT_KEEP_DAYS = 30;
const YT_DAILY_CAP = 90;
const YT_TAB = 'YouTube';

function getSearchResults(query) {
  query = String(query || '').trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 200);
  if (!query) return { error: 'No query provided' };

  const cache = CacheService.getScriptCache();
  const key = 'yt:' + Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, query, Utilities.Charset.UTF_8));
  const cached = cache.get(key);
  if (cached) return JSON.parse(cached);

  const lock = LockService.getScriptLock();
  lock.waitLock(20000); // one search at a time, so two people opening the same song search once
  try {
    const sheet = ytTab();
    const rows = sheet.getLastRow() > 1 ? sheet.getRange(2, 1, sheet.getLastRow() - 1, 4).getValues() : [];
    const fresh = Date.now() - YT_KEEP_DAYS * 864e5;
    const kept = rows.find(row => row[0] === key && new Date(row[3]).getTime() > fresh);
    if (kept) {
      cache.put(key, kept[2], 21600);
      return JSON.parse(kept[2]);
    }

    if (!ytCountSearch()) return { error: "Today's YouTube searches are used up. Try again tomorrow.", limit: true };

    const answer = YouTube.Search.list('snippet', {
      q: query,
      type: 'video',
      videoEmbeddable: 'true', // only videos that can play inside yCanta
      safeSearch: 'strict',
      maxResults: 5,
    });
    const results = { results: (answer.items || []).map(item => ({
      videoId: item.id.videoId,
      title: ytText(item.snippet.title),
      channel: ytText(item.snippet.channelTitle),
    })) };
    const json = JSON.stringify(results);

    // keep it: drop this query's old row and any row past 30 days, then add the new one
    const keep = rows.filter(row => row[0] !== key && new Date(row[3]).getTime() > fresh);
    keep.push([key, query, json, new Date()]);
    if (rows.length) sheet.getRange(2, 1, rows.length, 4).clearContent();
    sheet.getRange(2, 1, keep.length, 4).setValues(keep);
    cache.put(key, json, 21600);
    return results;
  } catch (e) {
    console.error('YouTube search failed for "' + query + '": ' + e);
    return { error: 'YouTube search failed. Try again later.' };
  } finally {
    lock.releaseLock();
  }
}

// The "YouTube" tab of the analytics sheet, made the first time: key, query, results, saved
function ytTab() {
  const ss = SpreadsheetApp.openById(ANALYTICS_SHEET_ID);
  let sheet = ss.getSheetByName(YT_TAB);
  if (!sheet) {
    sheet = ss.insertSheet(YT_TAB);
    sheet.getRange(1, 1, 1, 4).setValues([['Key', 'Query', 'Results', 'Saved']]).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

// Counts a new search against today's cap. False when the cap is reached.
function ytCountSearch() {
  const props = PropertiesService.getScriptProperties();
  const today = Utilities.formatDate(new Date(), 'America/Los_Angeles', 'yyyy-MM-dd');
  const used = props.getProperty('YT_DAY') === today ? Number(props.getProperty('YT_USED')) || 0 : 0;
  if (used >= YT_DAILY_CAP) return false;
  props.setProperties({ YT_DAY: today, YT_USED: String(used + 1) });
  return true;
}

// YouTube sends titles with HTML entities (&#39; &amp;); the app shows plain text
function ytText(s) {
  return String(s || '')
    .replace(/&#(\d+);/g, (m, n) => String.fromCharCode(Number(n)))
    .replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}
