import { apiUrl, message, qe, settings } from '../script';

const cacheBaseName = 'MangaRecs';
// Try to get data from the cache, but fall back to fetching it live.
export async function getData(options = {}) {
  const cacheName = cacheBaseName; //`${cacheBaseName}-${onList ? 'onList' : 'recs'}-${userName}`;
  // await deleteOldCaches(cacheName);
  let cachedData = await getCachedData(cacheName);

  if (cachedData) {
    console.log('Retrieved cached data', apiUrl.search.slice(1));
    cacheIndicator();
    return cachedData;
  }

  console.log('Fetching fresh data', apiUrl.search.slice(1));

  const cacheStorage = await caches.open(cacheName);
  cachedData = await fetchWithProgress(apiUrl, options, cacheStorage);
  return cachedData;
}
// Get data from the cache.

export function cacheIndicator() {
  const expired = expiredCache();
  const expireTime = Number(localStorage.getItem('cacheExpiry'));
  const cacheCountdown = new Date((expireTime || Date.now()) - Date.now())
    .toISOString()
    .slice(11, 16)
    .replace('00:', '')
    .replace(':', 'h ');
  $('#cached > p').html(expired ? 'Refresh Data' : `Cached for<br />${cacheCountdown}m`);
  const cachedElem = $('#cached');
  expireTime ? cachedElem.removeAttr('hidden') : cachedElem.prop('hidden', true);
  expired
    ? cachedElem.addClass('expired').one('click', async () => {
        await deleteOldCaches();
        localStorage.removeItem('cacheExpiry');
        cacheIndicator();
      })
    : setTimeout(cacheIndicator, 30000) && cachedElem.removeAttr('class');
}

async function getCachedData(cacheName = cacheBaseName) {
  const cacheStorage = await caches.open(cacheName);
  const options = { ignoreSearch: false, ignoreMethod: true, ignoreVary: true };
  let cachedData = await cacheStorage.match(apiUrl, options);
  if (!cachedData) {
    const keys = (await cacheStorage.keys())
      .map(r => r.url)
      .filter(u => u.includes(`page=${apiUrl.searchParams.get('page')}`));

    if (!settings.subRecs && keys.some(k => k.includes('subRecs=1'))) {
      cachedData = await cacheStorage.match(
        apiUrl.toString().replace('subRecs=0', 'subRecs=1'),
        options
      );
    }

    if (settings.lists.length < 3) {
      for (const cachedUrl in keys.filter(k => settings.lists.every(l => k.includes(l)))) {
        cachedData = await cacheStorage.match(cachedUrl, options);
        if (
          !cachedData &&
          cachedUrl.includes('subRecs=1') &&
          apiUrl.searchParams.get('subRecs') == '0'
        )
          cachedData = await cacheStorage.match(
            cachedUrl.replace('subRecs=0', 'subRecs=1'),
            options
          );
        if (cachedData) break;
      }
    }

    if (cachedData) console.log('Found cache with extra information. Reduce, Reuse, Recycle!');
  }
  return cachedData;
}
// Delete any old caches to respect user's disk space.
async function deleteOldCaches(cacheName = cacheBaseName) {
  const keys = await caches.keys();

  for (const key of keys) {
    const isOurCache = typeof cacheBaseName == 'boolean' || key.startsWith(cacheBaseName);
    if (!expiredCache() && (cacheName === key || isOurCache)) {
      continue;
    }
    console.log('Deleting', key);
    caches.delete(key);
  }
}
function expiredCache() {
  return Date.now() > Number(localStorage.getItem('cacheExpiry') || '1'); // Invalidate if cache is over 3h old
}

async function fetchWithProgress(url: URL, options: RequestInit, cache?: Cache) {
  const page = Number(url.searchParams.get('page'));
  let receivedLength = 0;
  let lastProgress = 0;
  const chunks = [];
  const progressSpan = `<span id="progress">Page ${page}: 0.00 KB</span>`;
  url.searchParams.has('lists')
    ? message(
        '(∪.∪ ) .' + 'z<sup>z</sup>'.repeat(page),
        'Downloading Recommendations',
        progressSpan
      )
    : message('(⓿' + '_'.repeat(page) + '⓿)', 'Stalking your profile ', progressSpan);
  const response = await fetch(url, options);
  const reader = response.clone().body.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    chunks.push(value);
    receivedLength += value.length;
    const isMB = receivedLength > 1048576;
    const progress = receivedLength / (isMB ? 1048576 : 1024);
    if (progress > lastProgress + (isMB ? 0.1 : 5) || progress < lastProgress) {
      $('#progress').text(`Page ${page}: ${progress.toFixed(2)} ` + (isMB ? 'MB' : 'KB'));
      lastProgress = progress;
    }
  }
  if (!response.ok) {
    message(
      'Request failed!',
      response.status.toString(),
      response.statusText || (await response.json())?.errors?.at(0)?.message
    );
    throw new Error(qe('.content').textContent);
  }
  cache
    .put(apiUrl, response.clone())
    .then(() => localStorage.setItem('cacheExpiry', (Date.now() + 3 * 3600000).toString())); // 3h
  return response;
}
