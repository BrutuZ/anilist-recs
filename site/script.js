import { decodeJwt } from 'jose';

DEV: new EventSource('/esbuild').addEventListener('change', e => {
  const { added, removed, updated } = JSON.parse(e.data);

  if (!added.length && !removed.length && updated.length === 1) {
    for (const link of document.getElementsByTagName('link')) {
      const url = new URL(link.href);

      if (url.host === location.host && url.pathname === updated[0]) {
        const next = link.cloneNode();
        next.href = updated[0] + '?' + Math.random().toString(36).slice(2);
        next.onload = () => link.remove();
        link.parentNode.insertBefore(next, link.nextSibling);
        return;
      }
    }
  }

  location.reload();
});
const qe = document.querySelector.bind(document);
const qa = document.querySelectorAll.bind(document);
const cacheBaseName = 'MangaRecs';
const apiUrl = 'https://graphql.anilist.co';
const table = qe('.content');
const statusSelect = qe('#status');
const flags = { CN: '🇨🇳', KR: '🇰🇷', JP: '🇯🇵' };
const statusMap = {
  Ongoing: ['RELEASING', 'HIATUS'],
  Ended: ['FINISHED', 'CANCELLED', 'NOT_YET_RELEASED'],
};
var settings = settingsLoad(),
  jwt = localStorage.getItem('jwt');
export var data = null,
  // lastEntry = undefined,
  tagFilters = [],
  recs = [],
  ignore = [];
deleteOldCaches(); // Clear expired cache

// --- AUTHENTICATION ---
// Check if authentication is saved and clear if expired
if (jwt && Number(decodeJwt(jwt).exp) * 1000 < Date.now()) jwt = null;
// Save authentication from AniList redirect and clear the URL afterwards
if (!jwt && location.hash.search('access_token') !== -1) {
  const url = new URL(location);
  url.search = url.hash.slice(1);
  url.hash = '';
  jwt = url.searchParams.get('access_token');
  localStorage.setItem('jwt', jwt);
  ['access_token', 'token_type', 'expires_in'].forEach(param => url.searchParams.delete(param));
  history.replaceState(null, '', url.toString());
  message('Authenticated with AniList', '(⌐■_■)');
}

function validateUser() {
  if (!DEV) {
    if (settings.private || qe('#private').checked) {
      if (jwt) return `userId: ${decodeJwt(jwt).sub}`;
      else {
        message(
          '<a href="https://anilist.co/api/v2/oauth/authorize?client_id=9655&response_type=token">Authenticate with AniList</a>',
          'to see Private Profile / Entries'
        );
        throw new Error('Unauthenticated');
      }
    } else {
      if (!settings.username || !qe('#username').value) {
        message('╰(￣ω￣ｏ)', 'Fill your username');
        throw new Error('No username');
      } else return `userName: "${settings.username || qe('#username').value}"`;
    }
  } else return '';
}

async function fetchData(onList = false) {
  settingsSave();
  console.log('Fetching...');
  const user = validateUser();
  const queryStart = `{collection: MediaListCollection(${user} type: MANGA perChunk: 500 chunk: 1 forceSingleCompletedList: true sort: UPDATED_TIME_DESC`;
  const recsSubQuery =
    'recommendations(sort: RATING_DESC){entries: nodes{rating mediaRecommendation{title{romaji english native}synonyms id url: siteUrl meanScore popularity status tags{name isMediaSpoiler}cover: coverImage{medium large}description chapters countryOfOrigin isAdult';
  const simpleQuery = `${queryStart}){statuses: lists{status list: entries {manga: media {id}}}}}`;
  const recsQuery = `${queryStart} status_in: CURRENT){hasNextChunk statuses: lists{status list: entries {manga: media {title{romaji english native}id url: siteUrl cover: coverImage {medium}countryOfOrigin isAdult ${recsSubQuery} ${recsSubQuery}}}}}}}}}}}}`;
  const response = DEV
    ? await fetch(`_.._/manga${onList ? 'list' : 'recs'}.json`).then(body => body.json())
    : await getData(
        apiUrl,
        {
          method: 'post',
          mode: 'cors',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            query: onList ? simpleQuery : recsQuery,
          }),
        },
        jwt ? 'auth' : settings.username,
        onList
      );
  if (onList) {
    ignore = response.data.collection.statuses
      .flatMap(statuses => statuses.list)
      .map(entry => entry.manga.id);
    console.log('Ignored entries:', ignore);
  } else {
    data = response.data;
    console.log('Reading entries', data);
  }
}

function parseRecs(manga) {
  const country = [];
  for (const option of qa('#country > input')) {
    if (option.checked) country.push(option.id);
  }
  manga.recommendations.entries.forEach(entry => {
    const rec = entry.mediaRecommendation;
    // APPLY FILTERS
    if (
      !rec ||
      ignore.includes(rec.id) ||
      rec.isAdult == qe('#adult').selectedIndex ||
      rec.meanScore < qe('#minScore').value ||
      (country.length > 0 && !country?.includes(rec.countryOfOrigin)) ||
      (statusSelect.selectedIndex && !statusMap[statusSelect.value]?.includes(rec.status))
      // || e.rating < 1
    )
      return;
    const recObj = {
      cover: manga.cover.medium,
      title: manga.title.english || manga.title.romaji,
      url: manga.url,
      rating: entry.rating,
    };
    if (recs.find(e => e.id == rec.id)) {
      const index = recs.findIndex(e => e.id == rec.id);
      recs[index].recommended.push(recObj);
      return;
    } else {
      rec.recommended = [recObj];
      recs.push(rec);
      if (rec.recommendations && settings.subRecs) {
        parseRecs(rec);
      }
    }
  });
}

async function parseData() {
  settings = settingsSave();
  if (ignore.length == 0) {
    console.log('Nothing to ignore!');
    message('Stalking your profile', '(⓿_⓿)');
    await fetchData(true).catch(() => message('Unexpected error, please try again', 'o((>ω< ))o'));
    if (ignore.length === 0) return;
  }
  if (!data) {
    console.log('Nothing to parse!');
    message('Digging Recommentations...', '(This may take a while)', '(∪.∪ )...zzz');
    await fetchData();
  }
  console.log('Parsing...');
  const englishTitles = settings.englishTitles;
  const current = data.collection.statuses.find(s => s.status == 'CURRENT').list.map(e => e.manga);
  recs = [];

  console.log('Currents...');
  current.forEach(manga => parseRecs(manga));
  console.log('Currents DONE');
  message();

  recs
    .sort((a, b) => {
      switch (settings.sortMode) {
        case 'default':
        default:
          return b - a;
        case 'score':
          return b.meanScore - a.meanScore;
        case 'publishing':
          return b.status - a.status;
        case 'recCount':
          return b.recommended.length - a.recommended.length;
        case 'popularity':
          return b.popularity - a.popularity;
        case 'chapters':
          return Number(b.chapters) - Number(a.chapters);
        case 'recsTotal':
          return (
            b.recommended.map(r => r.rating).reduce((p, n) => p + n, 0) -
            a.recommended.map(r => r.rating).reduce((p, n) => p + n, 0)
          );
        case 'recsAvg':
          return (
            b.recommended.map(r => r.rating).reduce((p, n) => p + n, 0) / b.recommended.length -
            a.recommended.map(r => r.rating).reduce((p, n) => p + n, 0) / a.recommended.length
          );
      }
    })
    .forEach(rec => {
      const entry = document.createElement('div');
      const cell = document.createElement('div');
      const text = document.createElement('p');

      const link = document.createElement('a');
      const img = document.createElement('img');

      entry.classList.add('entry');
      entry.id = `id-${rec.id}`;

      // COVER + URL
      link.target = '_blank';
      link.href = rec.url;

      img.width = 250;
      img.loading = 'lazy';
      img.src = rec.cover.large;

      link.appendChild(img.cloneNode(true));

      rec.status = rec.status
        ? rec.status.charAt(0) + rec.status.slice(1).toLowerCase()
        : 'Unknown Status';
      text.textContent = `${rec.status} ${rec.chapters ? `[${rec.chapters}] ` : ''}${rec.meanScore >= 70 ? '💖' : rec.meanScore >= 60 ? '💙' : '💔'}${rec.meanScore}%`;
      link.appendChild(text.cloneNode(true));

      cell.appendChild(link.cloneNode(true));
      cell.classList.add('cover');
      entry.appendChild(cell.cloneNode(true));
      cell.removeAttribute('class');

      // CONNECTIONS
      cell.innerHTML = '';
      cell.classList.add('recs');
      img.width = 75;
      rec.recommended.forEach(origin => {
        link.innerHTML = '';
        link.target = '_blank';
        link.href = origin.url;
        img.src = origin.cover;
        img.title = origin.title;
        img.alt = origin.title;
        link.appendChild(img.cloneNode(true));
        cell.appendChild(link.cloneNode(true));
      });
      entry.appendChild(cell.cloneNode(true));
      cell.removeAttribute('class');

      // TITLE (PORTRAIT)
      cell.innerHTML = '';
      const textContainer = document.createElement('div');
      const header = document.createElement('h3');
      const title = englishTitles ? rec.title.english || rec.title.romaji : rec.title.romaji;
      header.textContent = `${rec.isAdult ? '🔞' : ''}${flags[rec.countryOfOrigin]} ${title}`;
      if (englishTitles && rec.title.english) header.classList.add('licensed');
      textContainer.appendChild(header);
      cell.appendChild(textContainer.cloneNode(true));

      cell.classList.add('title');
      entry.appendChild(cell.cloneNode(true));
      cell.removeAttribute('class');

      // ALT. TITLES (PORTRAIT)
      cell.innerHTML = '';
      textContainer.innerHTML = '';
      const altTitles = [
        ...new Set([rec.title.english, rec.title.romaji, ...rec.synonyms, rec.title.native]),
      ]
        .filter(i => (i && i != title ? i : false))
        .join('\n• ');
      if (altTitles) {
        text.innerText = `• ${altTitles}`;
        textContainer.appendChild(text.cloneNode(true));
      }
      cell.appendChild(textContainer.cloneNode(true));

      cell.classList.add('alt-titles');
      entry.appendChild(cell.cloneNode(true));
      cell.removeAttribute('class');

      // TITLES FOR LANDSCAPE
      cell.innerHTML = '';
      textContainer.innerHTML = '';
      entry
        .querySelectorAll('.title h3, .alt-titles p')
        .forEach(node => textContainer.appendChild(node.cloneNode(true)));
      cell.appendChild(textContainer.cloneNode(true));

      cell.classList.add('titles');
      entry.appendChild(cell.cloneNode(true));
      cell.removeAttribute('class');

      // DESCRIPTION
      cell.innerHTML = '';
      textContainer.innerHTML = '';
      text.innerHTML = rec.description || '<i>&lt;Empty Description&gt;</i>';
      textContainer.appendChild(text.cloneNode(true));

      text.innerHTML = '';
      text.classList.add('tags');
      rec.tags
        ?.filter(tag => (settings.spoilers ? !tag.isMediaSpoiler : true))
        .map(tag => tag.name)
        .forEach(tag => {
          const container = document.createElement('div');
          container.append(tag);
          container.className = 'tag';
          container.dataset.tag = tag;
          text.appendChild(container);
        });
      if (text.innerHTML) textContainer.appendChild(text.cloneNode(true));
      text.removeAttribute('class');

      cell.appendChild(textContainer.cloneNode(true));
      cell.classList.add('details');
      entry.appendChild(cell.cloneNode(true));
      cell.removeAttribute('class');

      table.appendChild(entry.cloneNode(true));
    });
  qa('.tag').forEach(tagContainer => tagContainer.addEventListener('click', filterTag, false));
  console.log('Parsed!');
}

function filterTag(ev) {
  ev.preventDefault();
  const tagName = this.dataset.tag;
  if (tagFilters.includes(tagName)) tagFilters.splice(tagFilters.indexOf(tagName), 1);
  else tagFilters.push(tagName);

  qa('.content > .entry').forEach(entry => {
    if (tagFilters.length == 0) {
      entry.hidden = false;
      return;
    }

    const tagElement = entry.querySelector(`[data-tag="${tagName}"]`);
    if (tagElement) tagElement.classList.toggle('filtered');
    const filtered = [];
    entry.querySelectorAll('.tag.filtered').forEach(f => filtered.push(f.dataset.tag));
    entry.hidden = !tagFilters.every(f => filtered.includes(f));
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  // Call API from login form
  qe('#login').addEventListener('submit', async event => {
    event.preventDefault();
    await parseData();
  });

  qe('#private').addEventListener('change', e => {
    qe('#username').disabled = e.target.checked;
    qe('#username').hidden = false;
  });
  // Refilter on settings change
  qe('#filters').addEventListener('click', async () => await parseData());
  DEV: await parseData();

  // Back to Top button
  qe('#top').addEventListener('click', () => scrollTo({ top: 0, behavior: 'smooth' }));

  document.addEventListener(
    'scroll',
    () => (qe('#top').hidden = scrollY < visualViewport.height * 1.1)
  );
});

// Try to get data from the cache, but fall back to fetching it live.
async function getData(url, options = {}, userName = null, onList = false) {
  const cacheName = `${cacheBaseName}-${userName}-${onList ? 'onList' : 'recs'}`;
  await deleteOldCaches(cacheName);
  let cachedData = await getCachedData(cacheName, url);

  qe('#cached').hidden = !Boolean(cachedData);
  if (cachedData) {
    console.log('Retrieved cached data:', cacheName);
    const cacheCountdown = new Date(
      (localStorage.getItem('cacheExpiry') || Date.now()) - Date.now()
    )
      .toISOString()
      .slice(11, 16)
      .replace('00:', '')
      .replace(':', 'h ');
    qe('#cached > p').textContent = `${cacheCountdown}m`;
    return cachedData;
  }

  console.log('Fetching fresh data:', cacheName);

  const cacheStorage = await caches.open(cacheName);
  if (jwt) options.headers['Authorization'] = `Bearer ${jwt}`;
  cachedData = await fetch(url, options).then(response => {
    if (!response.ok) {
      message('Request failed!', response.status, response.statusText);
      return false;
    }
    cacheStorage
      .put(url, response.clone())
      .then(() => localStorage.setItem('cacheExpiry', Date.now() + 10800000));
    return response;
  });
  return cachedData;
}

// Get data from the cache.
async function getCachedData(cacheName, url) {
  const cacheStorage = await caches.open(cacheName);
  const cachedResponse = await cacheStorage.match(url);

  if (!cachedResponse || !cachedResponse.ok || expiredCache()) {
    await caches.delete(cacheName);
    return false;
  }

  return await cachedResponse.json();
}

// Delete any old caches to respect user's disk space.
async function deleteOldCaches(cacheName = cacheBaseName) {
  const keys = await caches.keys();

  for (const key of keys) {
    const isOurCache = key.startsWith(cacheBaseName);
    if (!expiredCache() && (cacheName === key || isOurCache)) {
      continue;
    }
    console.log(`Deleting ${key}`);
    caches.delete(key);
  }
}

function expiredCache() {
  return Date.now() > (localStorage.getItem('cacheExpiry') || 1); // Invalidate if cache is over 3h old
}

function settingsLoad() {
  const settings = JSON.parse(localStorage.getItem('settings') || '{}');
  Object.entries(settings).forEach(setting => {
    const el = document.getElementById(setting[0]);
    if (el.type == 'checkbox') el.checked = setting[1];
    else el.value = setting[1];
  });
  qe('#username').hidden = qe('#username').disabled = qe('#private').checked;
  console.log('Read settings:', settings);
  return settings;
}
function settingsSave() {
  const settings = {};
  const elements = qa('.settings input, .settings select');
  elements.forEach(el => {
    if (el.type == 'checkbox') settings[el.id] = el.checked;
    else settings[el.id] = el.value;
  });
  console.log('Saving settings:', settings);
  localStorage.setItem('settings', JSON.stringify(settings));
  return settings;
}

function message() {
  table.innerHTML = arguments.length ? `<h1>${Array.from(arguments).join('<br />')}</h1>` : '';
}
