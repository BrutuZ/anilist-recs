import { apiUrl, message } from '../script.js';

const cacheBaseName = 'MangaRecs';
// Try to get data from the cache, but fall back to fetching it live.
export async function getData(options = {}) {
  const cacheName = cacheBaseName; //`${cacheBaseName}-${onList ? 'onList' : 'recs'}-${userName}`;
  await deleteOldCaches(cacheName);
  let cachedData = await getCachedData(cacheName);

  $('#cached').prop('hidden', !Boolean(cachedData));
  if (cachedData) {
    console.log('Retrieved cached data', apiUrl.search.slice(1));
    const cacheCountdown = new Date(
      (localStorage.getItem('cacheExpiry') || Date.now()) - Date.now()
    )
      .toISOString()
      .slice(11, 16)
      .replace('00:', '')
      .replace(':', 'h ');
    $('#cached > p').text(`${cacheCountdown}m`);
    return cachedData;
  }

  console.log('Fetching fresh data', apiUrl.search.slice(1));

  const cacheStorage = await caches.open(cacheName);
  cachedData = await fetch(apiUrl, options).then(async response => {
    if (!response.ok) {
      message(
        'Request failed!',
        response.status,
        response.statusText || (await response.json())?.errors?.at(0)?.message
      );
      return false;
    }
    cacheStorage
      .put(apiUrl, response.clone())
      .then(() => localStorage.setItem('cacheExpiry', Date.now() + 10800000)); // 3h
    return response;
  });
  return cachedData;
}
// Get data from the cache.

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
    if (cachedData) console.log('Found cache with extra information. Reduce, Reuse, Recycle!');
  }
  return cachedData;
}
// Delete any old caches to respect user's disk space.
export async function deleteOldCaches(cacheName = cacheBaseName) {
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
  return Date.now() > (localStorage.getItem('cacheExpiry') || 1); // Invalidate if cache is over 3h old
}
