import { cacheIndicator, getData } from './modules/caching.js';
import { jwt, validateUser } from './modules/anilistAuth.js';

DEV: new EventSource('/esbuild').addEventListener('change', e => {
  const { added, removed, updated } = JSON.parse(e.data);

  if (!added.length && !removed.length && updated.length === 1) {
    for (const link of document.getElementsByTagName('link')) {
      const url = new URL(link.href);

      if (url.host === location.host && url.pathname === updated[0]) {
        const next = link.cloneNode() as HTMLLinkElement;
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

  interface SettingsObj {
    username: string;
    private: number;
    englishTitles: number;
    licensed: number;
    subRecs: number;
    spoilers: number;
    fade: number;
    minScore: number;
    sortMode: string;
    adult: string;
    status: string;
    lists: string[];
    country: string[];
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
    };
    id: number;
    cover: { large: string };
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
    meanScore: number;
    popularity: number;
    status: string;
    genres: string[];
    tags: Tags[];
    cover: { large: string };
    description: string;
    chapters: number | null;
    countryOfOrigin: string;
    rating: number;
    isAdult: boolean;
    recommendations: Recommendation;
    recommended: SlimRecommendations[];
    filtered: boolean;
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

export function ce(element: string, params?: object): HTMLElement {
  const e = document.createElement(element);
  if (params) e.attrs(params);
  return e;
}

export const qe = document.querySelector.bind(document) as typeof document.querySelector;
export const qa = document.querySelectorAll.bind(document) as typeof document.querySelectorAll;

const DIV = '<div>',
  SPAN = '<span>',
  mangaUrl = 'https://anilist.co/manga/',
  flags = { CN: '🇨🇳', KR: '🇰🇷', JP: '🇯🇵' },
  statusMap = {
    Ongoing: ['RELEASING', 'HIATUS'],
    Ended: ['FINISHED', 'CANCELLED', 'NOT_YET_RELEASED'],
  };
export const apiUrl = new URL('https://graphql.anilist.co'),
  data: Manga[] = [],
  recs: MediaRecommendation[] = [];
export var userIgnored: number[] = [],
  wlTags: string[] = [],
  blTags: string[] = [],
  ignore: number[] = [];
cacheIndicator();
export var settings = settingsLoad();
// lastEntry = undefined,

async function* fetchData(onList = false) {
  settingsSave();
  if (!settings.lists.length) {
    message('(ㆆ_ㆆ)💢', 'Select at least one list, BAKA!');
    throw new Error('No lists selected');
  }
  const user = validateUser();
  let perChunk = DEV ? 5 : 500; // onList ? 500 : 100;
  const recsSubQuery =
    'recommendations(sort: RATING_DESC){entries: nodes{rating mediaRecommendation{title{romaji english native}synonyms id meanScore popularity status genres tags{name isMediaSpoiler}cover: coverImage{large}description chapters countryOfOrigin isAdult';
  const headers = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    'Accept-Encoding': 'gzip, deflate, br, zstd',
  };
  if (settings.private) headers['Authorization'] = 'Bearer ' + jwt;
  for (let chunk = 1; chunk < 21; chunk++) {
    const queryStart = `{collection: MediaListCollection(${user.join(':')} type: MANGA perChunk: ${perChunk} chunk: ${chunk} forceSingleCompletedList: true sort: UPDATED_TIME_DESC`;
    const onListQuery = `${queryStart}){hasNextChunk statuses: lists{status list: entries {manga: media {id}}}}}`;
    const recsQuery = `${queryStart} status_in: [${settings.lists?.join()}]){hasNextChunk statuses: lists{status list: entries {manga: media {title{romaji english}id cover: coverImage {large} ${recsSubQuery} ${settings.subRecs ? recsSubQuery + '}}}' : ''}}}}}}}}}`;
    console.log('Fetching chunk', chunk);
    apiUrl.search = '';
    apiUrl.searchParams.set(user[0], user[1].replace(/^"|"$/g, ''));
    if (!onList) {
      apiUrl.searchParams.set('lists', settings.lists?.join());
      apiUrl.searchParams.set('subRecs', settings.subRecs.toString());
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
  manga.recommendations.entries.forEach(listEntry => {
    const rec = listEntry.mediaRecommendation;
    // APPLY FILTERS
    if (
      !rec ||
      ignore.includes(rec.id) ||
      rec.isAdult == $('#adult').prop('selectedIndex') ||
      rec.meanScore < Number($('#minScore').val()) ||
      (settings.country.length > 0 && !settings.country?.includes(rec.countryOfOrigin)) ||
      (settings.licensed && !rec.title.english) ||
      ($('#status').prop('selectedIndex') &&
        !statusMap[$('#status').val().toString()]?.includes(rec.status))
      // || e.rating < 1
    )
      return;
    rec.tags = [
      ...(rec.genres?.map(g => {
        return { name: g, isMediaSpoiler: false };
      }) || []),
      ...(rec.tags || []),
    ].filter((v, i, a) => {
      return a.map(t => t.name).indexOf(v.name) === i;
    });
    const recObj = {
      id: manga.id,
      cover: manga.cover.large,
      title: manga.title.english || manga.title.romaji,
      url: mangaUrl + manga.id,
      rating: listEntry.rating,
    };
    const index = recs.findIndex(e => e.id == rec.id);
    if (index > -1) {
      recs[index].recommended.push(recObj);
      return;
    } else {
      rec.recommended = [recObj];
      rec.filtered = isFiltered(rec.tags);
      recs.push(rec);
      if (settings.subRecs && rec.recommendations) {
        parseRecs(rec);
      }
    }
  });
}

async function parseData() {
  settings = settingsSave();
  ignore = [...userIgnored];
  try {
    for await (const chunk of fetchData(true)) ignore.push(...(chunk as number[]));
  } catch {
    return;
  }
  console.log('Ignored entries:', ignore);
  for await (const chunk of fetchData(false)) data.push(...(chunk as Manga[]));
  console.log('Reading list:', data);
  recs.length = 0;

  console.time('Parsing Recommendations');
  data.forEach(manga => parseRecs(manga));
  console.timeEnd('Parsing Recommendations');
  console.log('Recommendations:', recs);

  console.log('Whitelist:', wlTags, 'Blacklist:', blTags);
  message('(▀̿Ĺ̯▀̿ ̿)', 'Getting nerdy with the data');
  console.time('Mapping Recommendations');
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
    .map(drawRec);
  console.timeEnd('Mapping Recommendations');
  console.time('Drawing Recommendations');
  $('.content').empty().append(elems);
  console.timeEnd('Drawing Recommendations');
  if (settings.fade) {
    console.time('Fading Covers');
    fadeCovers(
      Array.from(qa('.content > .entry[hidden]')).map(e => (e as HTMLDivElement).dataset.id)
    );
    console.timeEnd('Fading Covers');
  }
  recsCounter();
  console.log('Parsed!');
}

async function recsCounter() {
  if (DEV) console.log('Counting recs');
  console.time('Counter');
  const text = qa('.content > .entry:not([hidden])').length + ' Recommendations';
  const element = qe('.header');
  element.innerHTML = text;
  console.timeEnd('Counter');
  if (DEV) console.log('Counted recs', text, recs.filter(r => !r.filtered).length);
  if (element.getBoundingClientRect().top < 0) toast(text);
}

async function toast(content: string) {
  console.time('Toast');
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
  console.timeEnd('Toast');
}

function filterTag(this: HTMLDivElement, ev: MouseEvent) {
  ev.preventDefault();
  cleanTagPrompt();
  const tagName = this.dataset.tag;

  // Check if Tag is already active
  if (this.classList.contains('rejected')) {
    console.log('De-rejecting tag');
    doTagFilter(this, true);
    return false;
  }
  if (this.classList.contains('filtered')) {
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
    console.time('Filter tag');
    console.log('Clicked Tag', this, ev);
    // ev.stopImmediatePropagation();
    console.time('Prompt Removal');
    cleanTagPrompt();
    console.timeEnd('Prompt Removal');
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
    console.time('Styled tags');
    $(`[data-tag="${tagName}"]`).toggleClass(blacklist ? 'rejected' : 'filtered');
    console.timeEnd('Styled tags');
    const changed = [];
    console.time('Filtered changed');
    recs.forEach(r => {
      if (r.filtered != isFiltered(r.tags)) {
        changed.push(r.id.toString());
        r.filtered = !r.filtered;
      }
    });
    console.timeEnd('Filtered changed');

    // Manage the header list
    console.time('Header thingy');
    let headerTag = $(`#active-tags [data-tag="${tagName}"]`);
    if (headerTag.length) {
      headerTag.first().remove();
      console.log('Removing header');
    } else {
      $('#active-tags').append($(element).clone(true));
      console.log('Drawing header');
    }
    console.timeEnd('Header thingy');
    fadeCovers(changed, true);

    recsCounter();
    console.log('Whitelist:', wlTags, 'Blacklist:', blTags);
    console.timeEnd('Filter tag');
    return false;
  }
}

function fadeCovers(ids: string[], hideEntries: boolean = false) {
  console.time('Enumerating entry elements');
  const elements = qa(settings.fade ? '[data-id]' : '.entry[data-id]') as NodeListOf<
    HTMLDivElement | HTMLLinkElement
  >;
  console.timeEnd('Enumerating entry elements');
  console.time('DOM stuff');
  elements.forEach(el => {
    if (!ids.includes(el.dataset.id)) return;
    hideEntries && el.tagName == 'DIV' && el.toggleAttribute('hidden');
    settings.fade && el.tagName == 'A' && el.classList.toggle('faded');
  });
  console.timeEnd('DOM stuff');
  return elements;
}

function isFiltered(tags: Array<Tags | string>) {
  const recTags =
    typeof tags[0] === 'string'
      ? tags
      : tags
          ?.filter((tag: Tags) => (settings.spoilers ? !tag.isMediaSpoiler : true))
          .map((tag: Tags) => tag.name);
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
  if (index == 0 || index == recs.length - 1)
    console.log('Handling entry', index + 1, 'of', recs.length);

  const entry = ce('div', {
    id: 'aid-' + rec.id,
    className: 'entry',
    dataset: { id: rec.id },
    hidden: isFiltered(rec.tags),
  });

  const linkParams = { target: '_blank', href: mangaUrl + rec.id };
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

  // CONNECTIONS
  const connections = ce('div', { className: 'recs' });
  rec.recommended.forEach(origin => {
    if ($(connections).find(`[data-id="${origin.id}"]`).length > 0) return;
    const ignored = ignore.includes(origin.id);
    container = ce('a', linkParams).attrs({
      href: ignored ? origin.url : '#aid-' + origin.id,
      target: ignored ? '_blank' : '_self',
      dataset: { id: origin.id },
    });
    container.appendChild(
      ce('img', imgParams).attrs({
        width: 75,
        src: origin.cover,
        title: origin.title,
        alt: origin.title,
        className: ignored ? null : 'subrec',
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

  container = ce('a', { href: '#aid-' + rec.id, target: '_self' });
  container.addEventListener('click', () => copyTitle(entryTitle));
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
    altTitlesPortait.appendChild(text);
  }

  entry.appendChild(altTitlesPortait);

  // TITLES FOR LANDSCAPE
  const titlesLandscape = ce('div', { className: 'titles' });
  container = ce('div');
  $(entry)
    .find('.title a')
    .clone(true)
    .on('click', () => copyTitle(entryTitle))
    .appendTo(container);
  $(entry).find('.alt-titles p').clone().appendTo(container);
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
  ignoreBtn.addEventListener('click', ignoreEntry);
  entry.appendChild(ignoreBtn);

  return entry;
}

function copyTitle(entryTitle: string) {
  navigator.clipboard
    .writeText(entryTitle)
    .then(() => toast(`Title copied to clipboard '${entryTitle}'`));
}

function ignoreEntry(this: HTMLElement) {
  const id = Number(this.parentElement.dataset.id);
  const entryTitle = (this.parentNode.querySelector('.title') as HTMLElement)?.innerText;

  const modal = ce('div', { className: 'modal-wrapper' });
  modal.addEventListener('click', ev => {
    if (ev.target == modal) modal.remove();
  });
  const content = ce('div', { className: 'modal' });
  const text = ce('p', {
    innerText: 'Always ignore\n' + entryTitle + '\nand its recommendations in the future?',
  });
  const btnNo = ce('button', { innerText: 'No' });
  btnNo.addEventListener('click', () => modal.remove());
  const btnYes = ce('button', { innerText: 'Yes' });
  btnYes.addEventListener('click', () => {
    ignore.push(id);
    userIgnored.push(id);
    localStorage.setItem('ignored', userIgnored.toString());
    console.log('Ignored', entryTitle);
    this.parentElement.remove();
    $(`a[data-id='${id}']`).each((_, e) => {
      $(e).siblings().length ? e.remove() : $(e).closest('.entry').remove();
    });
    modal.remove();
    recsCounter();
  });
  content.append(text, this.parentNode.querySelector('.cover img').cloneNode(), btnYes, btnNo);
  modal.append(content);
  qe('body').appendChild(modal);
}

$(async () => {
  // Call API from login form
  $('#login').on('submit', async event => {
    event.preventDefault();
    $('#filters').trigger('click');
  });

  $('#private').on('change', e => {
    $('#username').prop('disabled', e.target.getAttribute('checked'));
    $('#username').show();
  });
  // Refilter on settings change
  $('#filters').on('click', async () => {
    message('Processing...', 'ლ(╹◡╹ლ)');
    await parseData();
  });
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
function settingsLoad(): SettingsObj {
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
  wlTags = localStorage.getItem('whitelist')?.split(',') || [];
  blTags = localStorage.getItem('blacklist')?.split(',') || [];
  userIgnored =
    localStorage
      .getItem('ignored')
      ?.split(',')
      .map(i => Number(i)) || [];
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
  return savedSettings as SettingsObj;
}

export function message(..._line: string[]) {
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
