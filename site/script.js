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
const cacheBaseName = 'MangaRecs';
const apiUrl = 'https://graphql.anilist.co';
const table = document.querySelector('.content');
const statusSelect = document.querySelector('#status');
const flags = { CN: '🇨🇳', KR: '🇰🇷', JP: '🇯🇵' };
const statusMap = {
  Ongoing: ['RELEASING', 'HIATUS'],
  Ended: ['FINISHED', 'CANCELLED', 'NOT_YET_RELEASED'],
};
let data = null,
  tagFilters = [],
  recs = [],
  ignore = [],
  settings = settingsRead();
deleteOldCaches(); // Clear expired cache

async function fetchData(simple = false) {
  const userName = document.querySelector('#username').value.trim();
  if (!userName) {
    table.innerHTML = '<h1>╰(￣ω￣ｏ)<br />Fill your username</h1>';
    throw new Error('No username');
  }
  console.log('Fetching...');
  const recsSubQuery =
    'recommendations(sort: RATING_DESC){entries: nodes{rating mediaRecommendation{title{romaji english native}synonyms id url: siteUrl meanScore popularity status tags{name isMediaSpoiler}cover: coverImage{medium large}description countryOfOrigin isAdult';
  const simpleQuery =
    'query ($user: String){collection: MediaListCollection(userName: $user type: MANGA perChunk: 500 chunk: 1 forceSingleCompletedList: true sort: UPDATED_TIME_DESC){statuses: lists{status list: entries {manga: media {id}}}}}';
  const recsQuery = `query ($user: String){collection: MediaListCollection(userName: $user type: MANGA perChunk: 500 chunk: 1 forceSingleCompletedList: true status_in: CURRENT sort: UPDATED_TIME_DESC){hasNextChunk statuses: lists{status list: entries {manga: media {title{romaji english native}id url: siteUrl cover: coverImage {medium}countryOfOrigin isAdult ${recsSubQuery} ${recsSubQuery}}}}}}}}}}}}`;
  const json = DEV
    ? await fetch(`_.._/manga${simple ? 'list' : 'recs'}.json`).then(response => response.json())
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
            query: simple ? simpleQuery : recsQuery,
            variables: { user: userName },
          }),
        },
        userName,
        simple
      );
  if (simple) {
    ignore = json.data.collection.statuses
      .flatMap(statuses => statuses.list)
      .map(entry => entry.manga.id);
    console.log('Ignored entries:', ignore);
  } else {
    data = json.data;
    console.log('Reading entries', data);
  }
}

function parseRecs(manga) {
  const country = [];
  for (const option of document.querySelectorAll('#country > input')) {
    if (option.checked) country.push(option.id);
  }
  manga.recommendations.entries.forEach(entry => {
    const rec = entry.mediaRecommendation;
    if (
      !rec ||
      ignore.includes(rec.id) ||
      rec.isAdult == document.querySelector('#adult').selectedIndex ||
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
    table.innerHTML = '<h1>Stalking your profile<br />(⓿_⓿)</h1>';
    await fetchData(true);
  }
  if (!data) {
    console.log('Nothing to parse!');
    table.innerHTML =
      '<h1>Digging Recommentations...<br />(This may take a while)<br />(∪.∪ )...zzz</h1>';
    await fetchData();
  }
  console.log('Parsing...');
  const englishTitles = settings.englishTitles;
  const current = data.collection.statuses.find(s => s.status == 'CURRENT').list.map(e => e.manga);
  recs = [];

  console.log('Currents...');
  current.forEach(manga => parseRecs(manga));
  console.log('Currents DONE');
  table.innerHTML = '';

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
      entry.id = rec.id;

      // COVER + URL
      link.target = '_blank';
      link.href = rec.url;

      img.width = 250;
      img.loading = 'lazy';
      img.src = rec.cover.large;

      link.appendChild(img.cloneNode(true));

      text.textContent = `${rec.status.charAt(0)}${rec.status.substr(1).toLowerCase()} 💙${rec.meanScore}%`;
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
  document
    .querySelectorAll('.tag')
    .forEach(tagContainer => tagContainer.addEventListener('click', filterTag, false));
  document.querySelector('#top-anchor').hidden = false;
  console.log('Parsed!');
}

function filterTag(ev) {
  ev.preventDefault();
  const tagName = this.dataset.tag;
  if (tagFilters.includes(tagName)) tagFilters.splice(tagFilters.indexOf(tagName), 1);
  else tagFilters.push(tagName);

  document.querySelectorAll('.content > .entry').forEach(entry => {
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
  document.querySelector('#login').addEventListener('submit', async event => {
    event.preventDefault();
    await parseData();
  });

  // Refilter on settings change
  document.querySelector('#filters').addEventListener('click', async () => await parseData());
  DEV: await parseData();

  document
    .querySelector('#top')
    .addEventListener('click', () => scrollTo({ top: 0, behavior: 'smooth' }));

  const observer = new IntersectionObserver(entries => {
    document.querySelector('#top').hidden = !(entries[0].boundingClientRect.y < 0);
  });
  observer.observe(document.querySelector('#top-anchor'));
});

// Try to get data from the cache, but fall back to fetching it live.
async function getData(url, options = {}, userName = null, simple = false) {
  const cacheName = `${cacheBaseName}-${userName}-${simple ? 'onList' : 'recs'}`;
  let cachedData = await getCachedData(cacheName, url);

  document.querySelector('#cached').hidden = !Boolean(cachedData);
  if (cachedData) {
    console.log('Retrieved cached data:', cacheName);
    const cacheCountdown = new Date(localStorage.getItem('cacheExpiry') - Date.now())
      .toISOString()
      .slice(11, 16)
      .replace('00:', '')
      .replace(':', 'h ');
    document.querySelector('#cached > span').textContent = `Cached for ${cacheCountdown}m`;
    return cachedData;
  }

  console.log('Fetching fresh data:', cacheName);

  const cacheStorage = await caches.open(cacheName);
  await fetch(url, options).then(response => {
    if (!response.ok) {
      table.innerHTML = `<h1>Request failed!<br />${response.status} ${response.statusText}</h1>`;
      return false;
    }
    return cacheStorage.put(url, response);
  });

  cachedData = await getCachedData(cacheName, url);
  await deleteOldCaches(cacheName);

  localStorage.setItem('cacheExpiry', Date.now() + 10800000);
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
  return Date.now() > localStorage.getItem('cacheExpiry'); // Invalidate if cache is over 3h old
}

function settingsRead() {
  const settings = JSON.parse(localStorage.getItem('settings') || '{}');
  Object.entries(settings).forEach(setting => {
    const el = document.getElementById(setting[0]);
    if (el.type == 'checkbox') el.checked = setting[1];
    else el.value = setting[1];
  });
  return settings;
}
function settingsSave() {
  const settings = {};
  const elements = document.querySelectorAll('.settings input, .settings select');
  elements.forEach(el => {
    if (el.type == 'checkbox') settings[el.id] = el.checked;
    else settings[el.id] = el.value;
  });
  localStorage.setItem('settings', JSON.stringify(settings));
  return settings;
}
