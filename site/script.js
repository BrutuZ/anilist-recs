import { deleteOldCaches, getData } from './modules/caching.js';

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
export const qe = document.querySelector.bind(document);
const qa = document.querySelectorAll.bind(document);
const ce = document.createElement.bind(document);
export const apiUrl = new URL('https://graphql.anilist.co');
const table = qe('.content');
const statusSelect = qe('#status');
const flags = { CN: '🇨🇳', KR: '🇰🇷', JP: '🇯🇵' };
const statusMap = {
  Ongoing: ['RELEASING', 'HIATUS'],
  Ended: ['FINISHED', 'CANCELLED', 'NOT_YET_RELEASED'],
};
export var data = [],
  wlTags = [],
  blTags = [],
  userIgnored = [],
  recs = [],
  ignore = [];
var settings = settingsLoad(),
  // lastEntry = undefined,
  jwt = localStorage.getItem('jwt');
deleteOldCaches(); // Clear expired cache

// vvv AUTHENTICATION vvv
// Check if authentication is saved and clear if expired
if (jwt && Number(decodeJwt(jwt).exp) * 1000 < Date.now()) jwt = null;
// Save authentication from AniList redirect and clear the URL afterwards
if (!jwt && location.hash.search('access_token') !== -1) {
  const url = new URL(location);
  url.search = url.hash.slice(1);
  url.hash = '';
  jwt = url.searchParams.get('access_token');
  localStorage.setItem('jwt', jwt);
  url.search = '';
  history.replaceState(null, '', url.toString());
  message('Authenticated with AniList', '(⌐■_■)');
}

function validateUser() {
  if (DEV) return ['', ''];
  if (settings.private || qe('#private').checked) {
    if (jwt) return ['userId', decodeJwt(jwt).sub];
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
    } else return ['userName', `"${settings.username || qe('#username').value}"`];
  }
}

// ^^^ AUTHENTICATION ^^^

async function* fetchData(onList = false) {
  settingsSave();
  const user = validateUser();
  let perChunk = 500; // onList ? 500 : 100;
  DEV: perChunk = 5;
  const recsSubQuery =
    'recommendations(sort: RATING_DESC){entries: nodes{rating mediaRecommendation{title{romaji english native}synonyms id url: siteUrl meanScore popularity status tags{name isMediaSpoiler}cover: coverImage{medium large}description chapters countryOfOrigin isAdult';
  const headers = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };
  if (settings.private) headers['Authorization'] = `Bearer ${jwt}`;
  for (let chunk = 1; chunk < 21; chunk++) {
    onList
      ? message('Stalking your profile', '(⓿_⓿)', `Page ${chunk}`)
      : message(
          'Digging Recommentations...',
          '(This may take a while)',
          '(∪.∪ )...zzz',
          `Page ${chunk}`
        );
    const queryStart = `{collection: MediaListCollection(${user.join(':')} type: MANGA perChunk: ${perChunk} chunk: ${chunk} forceSingleCompletedList: true sort: UPDATED_TIME_DESC`;
    const onListQuery = `${queryStart}){hasNextChunk statuses: lists{status list: entries {manga: media {id}}}}}`;
    const recsQuery = `${queryStart} status_in: [${settings.lists?.join().toUpperCase()}]){hasNextChunk statuses: lists{status list: entries {manga: media {title{romaji english native}id url: siteUrl cover: coverImage {medium}countryOfOrigin isAdult ${recsSubQuery} ${settings.subRecs ? recsSubQuery + '}}}' : ''}}}}}}}}}`;
    console.log('Fetching chunk', chunk);
    apiUrl.search = '';
    apiUrl.searchParams.set(user[0], user[1].split('"')[1]);
    apiUrl.searchParams.set('page', chunk);
    if (!onList) {
      apiUrl.searchParams.set('subRecs', settings.subRecs);
      apiUrl.searchParams.set('lists', settings.lists?.join());
    }
    apiUrl.search = btoa(apiUrl.search.slice(1));
    DEV: apiUrl.search = atob(apiUrl.search.slice(1));
    const response = DEV
      ? await fetch(`_.._/manga${onList ? 'list' : 'recs'}.json`).then(body => body.json())
      : await getData({
          method: 'post',
          mode: 'cors',
          headers: headers,
          body: JSON.stringify({
            query: onList ? onListQuery : recsQuery,
          }),
        }).then(body => (body ? body.json() : body));
    if (!response) {
      console.log(`Error fetching ${apiUrl.search}`);
      return false;
    }
    yield await Promise.resolve(
      response.data.collection.statuses
        .flatMap(statuses => statuses.list)
        .map(entry => (onList ? entry.manga.id : entry.manga))
    );
    console.log('hasNextChunk:', response.data.collection.hasNextChunk);
    if (!response.data.collection.hasNextChunk) break;
    DEV: break;
  }
}

function parseRecs(manga) {
  manga.recommendations.entries.forEach(entry => {
    const rec = entry.mediaRecommendation;
    // APPLY FILTERS
    if (
      !rec ||
      ignore.includes(rec.id) ||
      rec.isAdult == qe('#adult').selectedIndex ||
      rec.meanScore < qe('#minScore').value ||
      (settings.country.length > 0 && !settings.country?.includes(rec.countryOfOrigin)) ||
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
  console.log('Nothing to ignore!');
  ignore = [...userIgnored];
  for await (const chunk of fetchData(true)) ignore.push(...chunk);
  console.log('Ignored entries:', ignore);
  console.log('Nothing to parse!');
  for await (const chunk of fetchData(false)) data.push(...chunk);
  console.log('Reading list:', data);
  recs = [];

  console.log('Parsing Recomendations...');
  data.forEach(manga => parseRecs(manga));
  console.log('Recomendations:', recs);
  message();

  console.log('Whitelist:', wlTags, 'Blacklist:', blTags);
  qe('.header').innerHTML = `${recs.length} Recommendations`;
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
    .forEach(drawRec);
  // I hate this so much
  qa('.tag').forEach(tagContainer => tagContainer.addEventListener('click', filterTag, false));
  console.log('Parsed!');
}

function filterTag(ev) {
  console.log(this, ev);
  ev.preventDefault();
  qa('#tag-filter').forEach(i => i.remove());
  const tagName = this.dataset.tag;
  if (ev.target.classList.contains('rejected')) {
    doTagFilter(true);
    return;
  }
  if (ev.target.classList.contains('filtered')) {
    doTagFilter(false);
    return;
  }
  const buttons = ce('div');
  buttons.id = 'tag-filter';
  buttons.style.top = `${ev.pageY}px`;
  buttons.style.left = `${ev.pageX}px`;
  const whiteListBtn = ce('span');
  whiteListBtn.textContent = '✅';
  whiteListBtn.addEventListener('click', () => doTagFilter(false, this), false);
  const blackListBtn = ce('span');
  blackListBtn.textContent = '❌';
  blackListBtn.addEventListener('click', () => doTagFilter(true, this), false);
  buttons.append(whiteListBtn);
  buttons.append(blackListBtn);
  document.body.append(buttons);

  function doTagFilter(blacklist = false, element = undefined) {
    const tagList = blacklist ? blTags : wlTags;
    const listType = blacklist ? 'blacklist' : 'whitelist';
    if (tagList.includes(tagName)) tagList.splice(tagList.indexOf(tagName), 1);
    else tagList.push(tagName);
    tagList.length ? localStorage.setItem(listType, tagList) : localStorage.removeItem(listType);

    qa('.content > .entry').forEach(entry => {
      const tag = entry.querySelector(`[data-tag="${tagName}"]`);
      const tags = Array.from(entry.querySelectorAll('.tag')).map(t => t.dataset.tag);
      entry.hidden = blTags?.some(t => tags.includes(t)) || !wlTags?.every(t => tags.includes(t));
      if (tag) {
        if (blacklist) tag.classList.toggle('rejected');
        else tag.classList.toggle('filtered');
      }
    });
    let headerTag = qe(`#active-tags [data-tag="${tagName}"]`);
    if (headerTag) headerTag.remove();
    else {
      headerTag = element?.cloneNode(true);
      headerTag.addEventListener('click', () => doTagFilter(blacklist, headerTag));
      qe('#active-tags').appendChild(headerTag);
    }

    qa('#tag-filter').forEach(i => i.remove());
  }
}

function appendTag(tag) {
  const container = ce('div');
  container.append(tag);
  container.classList.add('tag');
  if (blTags.includes(tag)) container.classList.add('rejected');
  if (wlTags.includes(tag)) container.classList.add('filtered');
  container.dataset.tag = tag;
  // Doesn't in the main table for some reason
  // container.addEventListener('click', filterTag, { capture: true });
  this.appendChild(container);
}

function drawRec(rec) {
  const entry = ce('div');
  const cell = ce('div');
  const text = ce('p');

  const link = ce('a');
  const img = ce('img');

  entry.classList.add('entry');
  entry.id = `id-${rec.id}`;
  entry.hidden =
    blTags.some(b => rec.tags.map(t => t.name).includes(b)) ||
    !wlTags.every(w => rec.tags.map(t => t.name).includes(w));

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
    if ($(cell).find(`img[src="${origin.cover}"]`).length > 0) return;
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
  const textContainer = ce('div');
  const header = ce('h3');
  const title = settings.englishTitles ? rec.title.english || rec.title.romaji : rec.title.romaji;
  header.textContent = `${rec.isAdult ? '🔞' : ''}${flags[rec.countryOfOrigin]} ${title}`;
  if (settings.englishTitles && rec.title.english) header.classList.add('licensed');
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

  const tags = ce('span');
  tags.classList.add('tags');
  rec.tags
    ?.filter(tag => (settings.spoilers ? !tag.isMediaSpoiler : true))
    .map(tag => tag.name)
    .forEach(appendTag, tags);
  if (tags.innerHTML) textContainer.appendChild(tags);

  cell.appendChild(textContainer.cloneNode(true));
  cell.classList.add('details');
  entry.appendChild(cell.cloneNode(true));
  cell.removeAttribute('class');

  const ignoreButton = ce('span');
  ignoreButton.innerText = '×';
  ignoreButton.className = 'ignore';
  ignoreButton.addEventListener('click', () => {
    ignore.push(rec.id);
    userIgnored.push(rec.id);
    localStorage.setItem('ignored', userIgnored);
    console.log('Ignored', title);
    entry.remove();
  });
  entry.appendChild(ignoreButton);
  table.appendChild(entry);
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

  // Scroll Handler for Pagination
  document.addEventListener('scroll', scrollHandler);

  // Style Selects
  $('select').select2({
    containerCssClass: 'sc',
    dropdownCssClass: 'sc',
    minimumResultsForSearch: -1,
    width: 'style',
  });
});

function scrollHandler() {
  qe('#top').hidden = scrollY < visualViewport.height * 1.1;
  if (qe('.settings').getBoundingClientRect().top < 0)
    qe('#active-tags').style = 'position: fixed;';
  else qe('#active-tags').removeAttribute('style');
  qa('#tag-filter').forEach(i => i.remove());

  // TODO:
  // if (lastEntry && scrollY > lastEntry.offsetTop) {
  //   // Paginate stuff
  //   // parseRecs(page) [Generator]  => fetchData(false, page)=> renderData()
  //   // lastEntry = document.querySelector('.entry:nth-last-child(2)');
  // }
}

function settingsLoad() {
  const savedSettings = JSON.parse(localStorage.getItem('settings') || '{}');
  $.each(savedSettings, (key, value) => {
    switch ($(key).prop('type')) {
      case 'checkbox':
        $(`#${key}`).prop('checked', value);
        break;
      default:
        $(`#${key}`).val(value).trigger('change');
        break;
    }
  });
  qe('#username').hidden = qe('#username').disabled = qe('#private').checked;
  wlTags = localStorage.getItem('whitelist')?.split(',') || [];
  blTags = localStorage.getItem('blacklist')?.split(',') || [];
  qe('#active-tags').innerHTML = '';
  [...wlTags, ...blTags].forEach(appendTag, qe('#active-tags'));
  console.log('Read settings:', savedSettings);
  return savedSettings;
}
function settingsSave() {
  const savedSettings = {};
  $('.settings input, .settings select').each((_, el) => {
    if (!el.id) return;
    switch (el.type) {
      case 'checkbox':
        savedSettings[el.id] = el.checked;
        break;
      case 'select-multiple':
        savedSettings[el.id] = $(el)
          .find('option:selected')
          .map((_, option) => option.id || option.value)
          .get();
        break;
      default:
        savedSettings[el.id] = $(el).val();
        break;
    }
  });
  console.log('Saving settings:', savedSettings);
  localStorage.setItem('settings', JSON.stringify(savedSettings));
  return savedSettings;
}

export function message() {
  table.innerHTML = arguments.length
    ? `<h1>${Array.from(arguments)
        .filter(i => i)
        .join('<br />')}</h1>`
    : '';
}
