import { apiUrl, message } from '../script';

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
  cachedData = await fetch(apiUrl, options).then(async response => {
    if (!response.ok) {
      message(
        'Request failed!',
        response.status.toString(),
        response.statusText || (await response.json())?.errors?.at(0)?.message
      );
      return undefined;
    }
    cacheStorage
      .put(apiUrl, response.clone())
      .then(() => localStorage.setItem('cacheExpiry', (Date.now() + 10800000).toString())); // 3h
    return response;
  });
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
  const options = {
    ignoreSearch: false,
    ignoreMethod: true,
    ignoreVary: true,
  };
  let cachedData = await cacheStorage.match(apiUrl, options);
  if (!cachedData && apiUrl.searchParams.get('subRecs') === '0') {
    apiUrl.searchParams.set('subRecs', '1');
    cachedData = await cacheStorage.match(apiUrl, options);
    if (!cachedData) apiUrl.searchParams.set('subRecs', '0');
    else console.log('Found cache with extra information. Reduce, Reuse, Recycle!');
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
