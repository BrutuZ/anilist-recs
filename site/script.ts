import Cookies from 'js-cookie';
import { deleteOldCaches, getData } from './modules/caching.js';
import { jwt, validateUser } from './modules/anilistAuth.js';

DEV: new EventSource('/esbuild').addEventListener('change', e => {
  const { added, removed, updated } = JSON.parse(e.data);

  if (!added.length && !removed.length && updated.length === 1) {
    for (const link of document.getElementsByTagName('link')) {
      const url = new URL(link.href);

      if (url.host === location.host && url.pathname === updated[0]) {
        // @ts-ignore
        const next: HTMLLinkElement = link.cloneNode();
        next.href = updated[0] + '?' + Math.random().toString(36).slice(2);
        next.onload = () => link.remove();
        link.parentNode.insertBefore(next, link.nextSibling);
        return;
      }
    }
  }

  location.reload();
});
declare global {
  var DEV: boolean;
  const qe: HTMLElement;
  const qa: NodeListOf<HTMLElement>;

  interface HTMLElement {
    attrs(attributes: object): HTMLElement;
  }

  interface MediaListCollection {
    data: {
      collection: {
        hasNextChunk: boolean;
        statuses: [
          {
            status: string;
            list: ListEntry[];
          },
        ];
      };
    };
  }
  interface ListEntry {
    manga: Manga;
  }
  interface Manga {
    title: {
      romaji: string;
      english: string;
      native: string;
    };
    id: number;
    url: string;
    cover: { medium: string };
    countryOfOrigin: string;
    isAdult: boolean;
    recommendations: Recommendation;
  }
  interface Recommendation {
    entries: [
      {
        rating: number;
        mediaRecommendation: MediaRecommendation;
      },
    ];
  }
  interface MediaRecommendation {
    title: {
      romaji: string;
      english: string;
      native: string;
    };
    synonyms: string[];
    id: number;
    url: string;
    meanScore: number;
    popularity: number;
    status: string;
    tags: Tags[];
    cover: { medium: string; large: string };
    description: string;
    chapters: number | null;
    countryOfOrigin: string;
    rating: number;
    isAdult: boolean;
    recommendations: Recommendation;
    recommended: SlimRecommendations[];
  }
  interface Tags {
    name: string;
    isMediaSpoiler: boolean;
  }
  interface SlimRecommendations {
    id: number;
    cover: string;
    title: string;
    url: string;
    rating: number;
  }
}

HTMLElement.prototype.attrs = function (o) {
  for (let k in o) {
    if (typeof o[k] == 'object')
      for (let d in o[k]) {
        this[k][d] = o[k][d];
      }
    else this[k] = o[k];
  }
  return this;
};

function ce(element: string, params?: object): HTMLElement {
  const e = document.createElement(element);
  if (params) e.attrs(params);
  return e;
}

const qe = document.querySelector.bind(document) as typeof document.querySelector;
const qa = document.querySelectorAll.bind(document) as typeof document.querySelectorAll;

const DIV = '<div>',
  SPAN = '<span>',
  flags = { CN: '🇨🇳', KR: '🇰🇷', JP: '🇯🇵' },
  statusMap = {
    Ongoing: ['RELEASING', 'HIATUS'],
    Ended: ['FINISHED', 'CANCELLED', 'NOT_YET_RELEASED'],
  };
export const apiUrl = new URL('https://graphql.anilist.co'),
  data: Manga[] = [],
  wlTags: string[] = [],
  blTags: string[] = [],
  userIgnored: number[] = [],
  recs: MediaRecommendation[] = [],
  ignore: number[] = [];
var settings = settingsLoad(),
  // lastEntry = undefined,
  jwt = localStorage.getItem('jwt');
deleteOldCaches(); // Clear expired cache
export var settings = settingsLoad();
// lastEntry = undefined,

async function* fetchData(onList = false) {
  settingsSave();
  if (!settings.lists.length) {
    message('(ㆆ_ㆆ)', 'Select at least one list, BAKA!');
    throw new Error('No lists selected');
  }
  const user = validateUser();
  let perChunk = DEV ? 5 : 500; // onList ? 500 : 100;
  const recsSubQuery =
    'recommendations(sort: RATING_DESC){entries: nodes{rating mediaRecommendation{title{romaji english native}synonyms id url: siteUrl meanScore popularity status tags{name isMediaSpoiler}cover: coverImage{medium large}description chapters countryOfOrigin isAdult';
  const headers = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };
  if (settings.private) headers['Authorization'] = 'Bearer ' + jwt;
  for (let chunk = 1; chunk < 21; chunk++) {
    onList
      ? message('(⓿_⓿)', 'Stalking your profile ' + '.'.repeat(chunk - 1))
      : message(
          '(∪.∪ ) .' + 'z<sup>z</sup>'.repeat(chunk),
          'Digging Recommentations',
          '(This may take a while)'
        );
    const queryStart = `{collection: MediaListCollection(${user.join(':')} type: MANGA perChunk: ${perChunk} chunk: ${chunk} forceSingleCompletedList: true sort: UPDATED_TIME_DESC`;
    const onListQuery = `${queryStart}){hasNextChunk statuses: lists{status list: entries {manga: media {id}}}}}`;
    const recsQuery = `${queryStart} status_in: [${settings.lists?.join()}]){hasNextChunk statuses: lists{status list: entries {manga: media {title{romaji english native}id url: siteUrl cover: coverImage {medium}countryOfOrigin isAdult ${recsSubQuery} ${settings.subRecs ? recsSubQuery + '}}}' : ''}}}}}}}}}`;
    console.log('Fetching chunk', chunk);
    apiUrl.search = '';
    apiUrl.searchParams.set(user[0], user[1].replace(/^"|"$/g, ''));
    if (!onList) {
      apiUrl.searchParams.set('lists', settings.lists?.join());
      apiUrl.searchParams.set('subRecs', settings.subRecs);
    }
    apiUrl.searchParams.set('page', chunk.toString());
    const response: MediaListCollection = DEV
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
      console.log('Error fetching', apiUrl.search);
      return false;
    }
    yield await Promise.resolve(
      response.data.collection.statuses
        .flatMap(statuses => statuses.list)
        .map(entry => (onList ? entry.manga.id : entry.manga))
    );
    console.log('hasNextChunk:', response.data.collection.hasNextChunk);
    if (!response.data.collection.hasNextChunk) break;
    if (DEV) break;
  }
}

function parseRecs(manga: Manga) {
  manga.recommendations.entries.forEach(entry => {
    const rec = entry.mediaRecommendation;
    // APPLY FILTERS
    if (
      !rec ||
      ignore.includes(rec.id) ||
      rec.isAdult == $('#adult').prop('selectedIndex') ||
      rec.meanScore < Number($('#minScore').val()) ||
      (settings.country.length > 0 && !settings.country?.includes(rec.countryOfOrigin)) ||
      ($('#status').prop('selectedIndex') &&
        !statusMap[$('#status').val().toString()]?.includes(rec.status))
      // || e.rating < 1
    )
      return;
    const recObj = {
      id: manga.id,
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
  ignore.length = 0;
  ignore.push(...userIgnored);
  try {
    // @ts-ignore
    for await (const chunk of fetchData(true)) ignore.push(...chunk);
  } catch {
    return;
  }
  console.log('Ignored entries:', ignore); // @ts-ignore
  for await (const chunk of fetchData(false)) data.push(...chunk);
  console.log('Reading list:', data);
  recs.length = 0;

  console.log('Parsing Recomendations...');
  data.forEach(manga => parseRecs(manga));
  console.log('Recomendations:', recs);
  message();

  console.log('Whitelist:', wlTags, 'Blacklist:', blTags);
  const elems = recs
    .sort((a, b) => {
      switch (settings.sortMode) {
        case 'default':
        default:
          return 0;
        case 'score':
          return b.meanScore - a.meanScore;
        case 'publishing':
          return a.status.localeCompare(b.status);
        case 'recCount':
          return b.recommended.length - a.recommended.length;
        case 'popularity':
          return b.popularity - a.popularity;
        case 'chapters':
          return b.chapters || 0 - a.chapters || 0;
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
    .map(drawRec);
  $('.content').empty().append(elems);
  recsCounter();
  console.log('Parsed!');
}

function recsCounter() {
  const text = qa('.content > .entry:not([hidden])').length + ' Recommendations';
  const element = qe('.header');
  element.innerHTML = text;
  if (element.getBoundingClientRect().top < 0) {
    toast(text);
  }
}

async function toast(content: string) {
  const toast = ce('div', {
    className: 'entry header toast',
    innerText: content,
  }) as HTMLDivElement;
  toast.addEventListener(
    'animationend',
    e => {
      if (e.elapsedTime > 0.5) toast.remove();
    },
    false
  );
  qe('body').appendChild(toast);
}

function filterTag(ev) {
  ev.preventDefault();
  console.log('Clicked Tag', this, ev);
  cleanTagPrompt();
  const tagName = this.dataset.tag;

  // Check if Tag is already active
  if (ev.target.classList.contains('rejected')) {
    console.log('De-rejecting tag');
    doTagFilter(this, true);
    return false;
  }
  if (ev.target.classList.contains('filtered')) {
    console.log('De-filtering tag');
    doTagFilter(this, false);
    return false;
  }
  // Draw prompt otherwise
  $(DIV, { id: 'tag-filter', css: { top: ev.pageY + 'px', left: ev.pageX + 'px' } })
    .append($(SPAN, { text: '✅', on: { click: () => doTagFilter(this, false) } }))
    .append($(SPAN, { text: '❌', on: { click: () => doTagFilter(this, true) } }))
    .appendTo($('body'));
  return false;

  function doTagFilter(element = undefined, blacklist = false) {
    ev.stopImmediatePropagation();
    cleanTagPrompt();
    // Pick list mode
    const tagList = blacklist ? blTags : wlTags;
    const listType = blacklist ? 'blacklist' : 'whitelist';

    // Toggle tag from array
    if (tagList.includes(tagName)) tagList.splice(tagList.indexOf(tagName), 1);
    else tagList.push(tagName);
    tagList.length
      ? localStorage.setItem(listType, tagList.toString())
      : localStorage.removeItem(listType);

    // Show/Hide based on array results
    $('.content > .entry').each((_, entry) => {
      $(entry)
        .find(`[data-tag="${tagName}"]`)
        .toggleClass(blacklist ? 'rejected' : 'filtered');
      const tags = $(entry)
        .find('.tag')
        .map((_, t) => t.dataset.tag)
        .get();
      $(entry).prop('hidden', isFiltered(tags));
    });

    // Manage the header list
    let headerTag = $(`#active-tags [data-tag="${tagName}"]`);
    if (headerTag.length) {
      headerTag.first().remove();
      console.log('Removing header');
    } else {
      $('#active-tags').append($(element).clone(true));
      console.log('Drawing header');
    }

    recsCounter();
    console.log('Whitelist:', wlTags, 'Blacklist:', blTags);
    return false;
  }
}

function isFiltered(tags: Array<Tags | string>) {
  const recTags =
    typeof tags[0] === 'string'
      ? tags // @ts-ignore
      : tags?.filter(tag => (settings.spoilers ? !tag.isMediaSpoiler : true)).map(tag => tag.name);
  return blTags?.some(b => recTags.includes(b)) || !wlTags?.every(w => recTags.includes(w));
}

function appendTag(tag: string) {
  const classes = blTags.includes(tag) ? ' rejected' : wlTags.includes(tag) ? ' filtered' : '';
  $(DIV, {
    attr: { 'data-tag': tag },
    class: 'tag' + classes,
    text: tag,
    on: { click: filterTag },
  }).appendTo(this);
}

function drawRec(rec: MediaRecommendation, index: number) {
  const debug = index == 0 || index == recs.length - 1;
  if (debug) console.log('Handling entry', index + 1, 'of', recs.length);

  const entry = ce('div', {
    id: rec.id,
    className: 'entry',
  });

  const linkParams = { target: '_blank', href: rec.url };
  const imgParams = {
    loading: 'lazy',
    crossOrigin: 'anonymous',
    referrerPolicy: 'no-referrer',
    width: 250,
    src: rec.cover.large,
  };

  // COVER + URL
  const cover = ce('div', { className: 'cover' });
  let container = ce('a', linkParams);
  container.appendChild(ce('img', imgParams));

  let text = ce('p', {
    textContent: [
      rec.status ? rec.status.charAt(0) + rec.status.slice(1).toLowerCase() : 'Unknown Status',
      rec.chapters ? ` [${rec.chapters}] ` : ' ',
      rec.meanScore >= 70 ? '💖' : rec.meanScore >= 60 ? '💙' : '💔',
      rec.meanScore + '%',
    ].join(''),
  });
  container.appendChild(text);
  cover.appendChild(container);

  entry.appendChild(cover);
  entry.hidden = isFiltered(rec.tags);

  // CONNECTIONS
  const connections = ce('div', { className: 'recs' });
  rec.recommended.forEach(origin => {
    if ($(connections).find(`img[src="${origin.cover}"]`).length > 0) return;
    container = ce('a', linkParams).attrs({
      href: ignore.includes(origin.id) ? origin.url : '#' + origin.id,
      target: ignore.includes(origin.id) ? '_blank' : '_self',
      dataset: { id: origin.id },
    });
    container.appendChild(
      ce('img', imgParams).attrs({
        width: 75,
        src: origin.cover,
        title: origin.title,
        alt: origin.title,
      })
    );
    connections.appendChild(container);
  });
  entry.appendChild(connections);

  // TITLE (PORTRAIT)
  const titlePortrait = ce('div', { className: 'title' });
  const entryTitle = settings.englishTitles
    ? rec.title.english || rec.title.romaji
    : rec.title.romaji;

  container = ce('a', { href: '#' + rec.id, target: '_self' });
  text = ce('h3', {
    className: settings.englishTitles && rec.title.english ? 'licensed' : null,
    innerText: (rec.isAdult ? '🔞' : '') + flags[rec.countryOfOrigin] + ' ' + entryTitle,
  });
  container.appendChild(text);
  titlePortrait.appendChild(container);

  entry.appendChild(titlePortrait);

  // ALT. TITLES (PORTRAIT)
  const altTitlesPortait = ce('div', { className: 'alt-titles' });

  const altTitles = [
    ...new Set([rec.title.english, rec.title.romaji, ...rec.synonyms, rec.title.native]),
  ]
    .filter(i => (i && i != entryTitle ? i : false))
    .join('\n• ');

  container = ce('div');
  if (altTitles) {
    text = ce('p', { innerText: '• ' + altTitles });
    container.appendChild(text);
  }

  altTitlesPortait.appendChild(text);
  entry.appendChild(altTitlesPortait);

  // TITLES FOR LANDSCAPE
  const titlesLandscape = ce('div', { className: 'titles' });
  container = ce('div');
  entry
    .querySelectorAll('.title a, .alt-titles p')
    .forEach(node => container.appendChild(node.cloneNode(true)));
  titlesLandscape.appendChild(container);

  entry.appendChild(titlesLandscape);

  // DESCRIPTION
  const details = ce('div', { className: 'details' });
  container = ce('div');
  container.appendChild(
    ce('p', { innerHTML: rec.description || '<i>&lt;Empty Description&gt;</i>' })
  );
  details.appendChild(container);

  // TAGS
  const tags = ce('span', { className: 'tags' });
  rec.tags
    ?.filter(tag => (settings.spoilers ? !tag.isMediaSpoiler : true))
    .map(tag => tag.name)
    .forEach(appendTag, tags);
  if (tags.innerHTML) container.appendChild(tags);

  entry.appendChild(details);

  // Ignore Button
  const ignoreBtn = ce('span', { className: 'ignore', innerText: '×' });
  ignoreBtn.addEventListener('click', () => {
    ignore.push(rec.id);
    userIgnored.push(rec.id);
    localStorage.setItem('ignored', userIgnored.toString());
    console.log('Ignored', entryTitle);
    entry.remove();
    $(`[data-id='${rec.id}']`).each((_, e) => {
      $(e).siblings().length ? $(e).remove() : $(e).closest('.entry').remove();
    });
    recsCounter();
  });
  entry.appendChild(ignoreBtn);

  return entry;
}

$(async () => {
  // Call API from login form
  $('#login').on('submit', async event => {
    event.preventDefault();
    await parseData();
  });

  $('#private').on('change', e => {
    $('#username').prop('disabled', e.target.getAttribute('checked'));
    $('#username').show();
  });
  // Refilter on settings change
  $('#filters').on('click', async () => await parseData());
  if (DEV) await parseData();

  // Back to Top button
  $('#top').on('click', () => scrollTo({ top: 0, behavior: 'smooth' }));

  // Scroll Handler for Pagination
  $(document).on('scroll', scrollHandler);

  // Style Selects
  $('select[multiple]').select2({
    minimumResultsForSearch: -1,
    width: 'style',
  });
});

function scrollHandler() {
  $('#top').toggleClass('collapsed', scrollY < visualViewport.height * 1.1);
  $('.settings').get(0).getBoundingClientRect().top < 0
    ? $('#active-tags').css('position', 'fixed')
    : $('#active-tags').removeAttr('style');
  cleanTagPrompt();

  // TODO:
  // if (lastEntry && scrollY > lastEntry.offsetTop) {
  //   // Paginate stuff
  //   // parseRecs(page) [Generator]  => fetchData(false, page)=> renderData()
  //   // lastEntry = document.querySelector('.entry:nth-last-child(2)');
  // }
}
function cleanTagPrompt() {
  $('#tag-filter').remove();
}
function settingsLoad() {
  const savedSettings = JSON.parse(localStorage.getItem('settings') || '{}');
  $.each(savedSettings, (key: string, value: string) => {
    const id = `#${key}`;
    switch ($(id).prop('type')) {
      case 'checkbox':
        $(id).prop('checked', value);
        break;
      default:
        $(id).val(value).trigger('change');
        break;
    }
  });
  $('#username').prop({
    hidden: $('#private').prop('checked'),
    disabled: $('#private').prop('checked'),
  });
  wlTags.push(...(localStorage.getItem('whitelist')?.split(',') || []));
  blTags.push(...(localStorage.getItem('blacklist')?.split(',') || []));
  $('#active-tags').empty();
  [...wlTags, ...blTags].forEach(appendTag, $('#active-tags'));
  console.log('Read settings:', savedSettings);
  return savedSettings;
}
function settingsSave() {
  const savedSettings = {};
  qa('.settings input, .settings select').forEach((el: HTMLInputElement | HTMLSelectElement) => {
    if (!el.id) return;
    switch (el.type) {
      case 'checkbox':
        savedSettings[el.id] = Number(el.checked);
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

export function message(...line: string[]) {
  $('.content')
    .empty()
    .append(
      arguments.length
        ? `<h1>${Array.from(arguments)
            .filter(i => i)
            .join('<br />')}</h1>`
        : ''
    );
}
