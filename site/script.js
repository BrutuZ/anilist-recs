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
const table = document.querySelector('.content');
let data = null;
let recs,
  ignore = [];
async function fetchData() {
  table.innerHTML = '<h1>Calling AniList API...<br />(This may take a while)</h1>';
  console.log('Fetching...');
  const json = DEV
    ? await getData('_.._/mangarecs.json')
    : await getData('https://graphql.anilist.co', {
        method: 'post',
        mode: 'cors',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'Cache-Control': 'max-stale=36000, force-cache, private',
        },
        cache: 'force-cache',
        body: JSON.stringify({
          query:
            'query($user:String){collection:MediaListCollection(userName:$user,type:MANGA,perChunk:500,chunk:1,status_in:[CURRENT,COMPLETED],forceSingleCompletedList:true,sort:UPDATED_TIME_DESC){hasNextChunk statuses:lists{status name list:entries{manga:media{title{romaji english native} id url:siteUrl cover:coverImage{medium} countryOfOrigin isAdult recommendations(sort:RATING_DESC){entries:nodes{rating mediaRecommendation{title{romaji english native}synonyms id url:siteUrl tags{name isMediaSpoiler}cover:coverImage{medium large}description countryOfOrigin isAdult recommendations(sort:RATING_DESC){entries:nodes{rating mediaRecommendation{title{romaji english native}synonyms id url:siteUrl tags{name isMediaSpoiler}cover:coverImage{medium large}description countryOfOrigin isAdult}}}}}}}}}}}',
          variables: { user: document.querySelector('#username').value.trim() },
        }),
      });
  data = json.data;
  parseData(data);
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

function parseData(data) {
  if (!data) {
    console.log('Nothing to parse!');
    return false;
  }
  console.log('Parsing...');
  const englishTitles = document.querySelector('#englishTitles').checked;
  table.innerHTML = '';
  const completed = data.collection.statuses
    .find(s => s.status == 'COMPLETED')
    .list.map(entry => entry.manga);
  const current = data.collection.statuses.find(s => s.status == 'CURRENT').list.map(e => e.manga);
  ignore = [...completed.map(m => m.id), ...current.map(m => m.id)];
  recs = [];

  console.log('Currents...');
  current.forEach(manga => parseRecs(manga));
  console.log('Currents DONE');

  recs
    // .sort((a, b) => b.recommended.length - a.recommended.length)
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

      // TITLE
      cell.innerHTML = '';
      const textContainer = document.createElement('div');
      const header = document.createElement('h3');
      const title = englishTitles ? rec.title.english || rec.title.romaji : rec.title.romaji;
      header.textContent = rec.isAdult ? `🔞 ${title}` : title;
      textContainer.appendChild(header.cloneNode(true));

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

      cell.classList.add('title');
      entry.appendChild(cell.cloneNode(true));
      cell.removeAttribute('class');

      // DESCRIPTION
      cell.innerHTML = '';
      textContainer.innerHTML = '';
      text.innerHTML = rec.description || '<i>&lt;Empty Description&gt;</i>';
      textContainer.appendChild(text.cloneNode(true));

      text.innerHTML = '';
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

      cell.appendChild(textContainer.cloneNode(true));
      cell.classList.add('details');
      entry.appendChild(cell.cloneNode(true));
      cell.removeAttribute('class');

      table.appendChild(entry.cloneNode(true));
    });
  document
    .querySelectorAll('.tag')
    .forEach(tagContainer => tagContainer.addEventListener('click', filterTag, false));
  console.log('Parsed!');
}

function filterTag(ev) {
  ev.preventDefault();
  document
    .querySelectorAll(`div.entry:not(.header, :has([data-tag="${this.dataset.tag}"])`)
    .forEach(entry => {
      entry.classList.toggle('filtered');
    });
  document.querySelectorAll(`[data-tag="${this.dataset.tag}"]`).forEach(tag => {
    tag.classList.toggle('filtered');
  });
}

document.addEventListener('DOMContentLoaded', () => {
  // Call API from login form
  document.querySelector('#login').addEventListener('submit', event => {
    event.preventDefault();
    fetchData();
  });

  // Refilter on settings change
  document.querySelector('#filters').addEventListener('click', () => parseData(data));
  DEV: fetchData();
});

// Try to get data from the cache, but fall back to fetching it live.
async function getData(url, options = {}) {
  const cacheName = 'MangaRecs';
  let cachedData = await getCachedData(cacheName, url);

  if (cachedData) {
    console.log('Retrieved cached data');
    return cachedData;
  }

  console.log('Fetching fresh data');

  const cacheStorage = await caches.open(cacheName);
  await fetch(url, options).then(response => {
    if (!response.ok) {
      window.alert(`Request failed!\n${response.status} - ${response.statusText}`);
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

  if (
    !cachedResponse ||
    !cachedResponse.ok ||
    Date.now() > Date.parse(cachedResponse.headers.date) + 36000 * 1000 // Invalidate if cache is over 3h old
  ) {
    return false;
  }

  return await cachedResponse.json();
}

// Delete any old caches to respect user's disk space.
async function deleteOldCaches(currentCache) {
  const keys = await caches.keys();

  for (const key of keys) {
    const isOurCache = key == 'MangaRecs';
    if (currentCache === key || !isOurCache) {
      continue;
    }
    caches.delete(key);
  }
}
