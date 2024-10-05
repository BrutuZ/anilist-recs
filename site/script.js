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
const flags = { CN: '🇨🇳', KR: '🇰🇷', JP: '🇯🇵' };
let data = null,
  tagFilters = [],
  recs = [],
  ignore = [];
deleteOldCaches(); // Clear expired cache (with extra steps)

async function fetchData(simple = false) {
  table.innerHTML =
    '<h1>Calling AniList API...<br />(This may take a while)<br />(∪.∪ )...zzz</h1>';
  console.log('Fetching...');
  const recsSubQuery =
    'recommendations(sort: RATING_DESC){entries: nodes{rating mediaRecommendation{title{romaji english native}synonyms id url: siteUrl meanScore status tags{name isMediaSpoiler}cover: coverImage{medium large}description countryOfOrigin isAdult';
  const simpleQuery =
    'query ($user: String){collection: MediaListCollection(userName: $user type: MANGA perChunk: 500 chunk: 1 forceSingleCompletedList: true sort: UPDATED_TIME_DESC){statuses: lists{status list: entries {manga: media {id}}}}}';
  const recsQuery = `query ($user: String){collection: MediaListCollection(userName: $user type: MANGA perChunk: 500 chunk: 1 forceSingleCompletedList: true status_in: CURRENT sort: UPDATED_TIME_DESC){hasNextChunk statuses: lists{status list: entries {manga: media {title{romaji english native}id url: siteUrl cover: coverImage {medium}countryOfOrigin isAdult ${recsSubQuery} ${recsSubQuery}}}}}}}}}}}}`;
  const json = DEV
    ? await fetch('_.._/mangarecs.json').then(response => response.json())
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
            variables: { user: document.querySelector('#username').value.trim() },
          }),
        },
        simple
      );
  if (simple) {
    ignore = json.data.collection.statuses // .filter(s => s.status != 'CURRENT')
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
      (country.length > 0 && !country?.includes(rec.countryOfOrigin))
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
      if (rec.recommendations && document.querySelector('#subRecs').checked) {
        parseRecs(rec);
      }
    }
  });
}

async function parseData() {
  if (ignore.length == 0) {
    console.log('Nothing to ignore!');
    await fetchData(true);
  }
  if (!data) {
    console.log('Nothing to parse!');
    await fetchData();
  }
  table.innerHTML = '<h1>Successfully stalked your profile<br />(⓿_⓿)</h1>';
  console.log('Parsing...');
  const englishTitles = document.querySelector('#englishTitles').checked;
  const current = data.collection.statuses.find(s => s.status == 'CURRENT').list.map(e => e.manga);
  recs = [];

  console.log('Currents...');
  current.forEach(manga => parseRecs(manga));
  console.log('Currents DONE');
  table.innerHTML = '';

  recs
    .sort((a, b) => {
      switch (document.querySelector('#sortMode').value) {
        case 'default':
        default:
          return b - a;
        case 'score':
          return b.meanScore - a.meanScore;
        case 'publishing':
          return b.status - a.status;
        case 'recCount':
          return b.recommended.length - a.recommended.length;
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
        ?.filter(tag => !tag.isMediaSpoiler)
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
async function getData(url, options = {}, simple = false) {
  const cacheName = `${cacheBaseName}-${simple ? 'onList' : 'recs'}`;
  let cachedData = await getCachedData(cacheName, url);

  if (cachedData) {
    console.log('Retrieved cached data:', cacheName);
    return cachedData;
  }

  console.log('Fetching fresh data:', cacheName);

  const cacheStorage = await caches.open(cacheName);
  await fetch(url, options).then(response => {
    if (!response.ok) {
      table.innerHTML = `<h1>Request failed!<br />${response.status} - ${response.statusText}</h1>`;
      return false;
    }
    return cacheStorage.put(url, response);
  });

  cachedData = await getCachedData(cacheName, url);
  await deleteOldCaches(cacheName);

  return cachedData;
}

// Get data from the cache.
async function getCachedData(cacheName, url) {
  const cacheStorage = await caches.open(cacheName);
  const cachedResponse = await cacheStorage.match(url);

  if (!cachedResponse || !cachedResponse.ok || expiredCache(cachedResponse.headers.date)) {
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
    const cachedResponse = await (await caches.open(key)).match(apiUrl);
    if (cacheName === key || isOurCache || !expiredCache(cachedResponse.headers.date)) {
      continue;
    }
    console.log(`Deleting ${key}`);
    caches.delete(key);
  }
}

function expiredCache(time) {
  return Date.now() < Date.parse(time) + 10800000; // Invalidate if cache is over 3h old
}
