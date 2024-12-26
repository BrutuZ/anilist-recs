import { deleteOldCaches, getData } from './modules/caching.js';
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
const DIV = '<div>',
  SPAN = '<span>',
  flags = { CN: '🇨🇳', KR: '🇰🇷', JP: '🇯🇵' },
  statusMap = {
    Ongoing: ['RELEASING', 'HIATUS'],
    Ended: ['FINISHED', 'CANCELLED', 'NOT_YET_RELEASED'],
  };
export const apiUrl = new URL('https://graphql.anilist.co'),
  data = [],
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
  message('(⌐■_■)', 'Authenticated with AniList');
}

function validateUser() {
  if (DEV) return ['', ''];
  if (settings.private || $('#private').prop('checked')) {
    if (jwt) return ['userId', decodeJwt(jwt).sub];
    else {
      message(
        '( •_•)>⌐■-■',
        '<a href="https://anilist.co/api/v2/oauth/authorize?client_id=9655&response_type=token">Authenticate with AniList</a>',
        'to see Private Profile / Entries'
      );
      throw new Error('Unauthenticated');
    }
  } else {
    if (!settings.username || !$('#username').val()) {
      message('╰(￣ω￣ｏ)', 'Fill your username');
      throw new Error('No username');
    } else return ['userName', `"${settings.username || $('#username').val()}"`];
  }
}

// ^^^ AUTHENTICATION ^^^

async function* fetchData(onList = false) {
  settingsSave();
  if (!settings.lists.length) {
    message('(ㆆ_ㆆ)', 'Select at least one list, BAKA!');
    throw new Error('No lists selected');
  }
  const user = validateUser();
  let perChunk = 500; // onList ? 500 : 100;
  DEV: perChunk = 5;
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
          '(∪.∪ )...<sup>z</sup>z<sup>z</sup>ᶻ',
          'Digging Recommentations ' + '.'.repeat(chunk - 1),
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
    apiUrl.searchParams.set('page', chunk);
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
      rec.isAdult == $('#adult').prop('selectedIndex') ||
      rec.meanScore < $('#minScore').val() ||
      (settings.country.length > 0 && !settings.country?.includes(rec.countryOfOrigin)) ||
      ($('#status').prop('selectedIndex') && !statusMap[$('#status').val()]?.includes(rec.status))
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
  for await (const chunk of fetchData(true)) ignore.push(...chunk);
  console.log('Ignored entries:', ignore);
  for await (const chunk of fetchData(false)) data.push(...chunk);
  console.log('Reading list:', data);
  recs.length = 0;

  console.log('Parsing Recomendations...');
  data.forEach(manga => parseRecs(manga));
  console.log('Recomendations:', recs);
  message();

  console.log('Whitelist:', wlTags, 'Blacklist:', blTags);
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
  recsCounter();
  console.log('Parsed!');
}

function recsCounter() {
  $('.header')
    .empty()
    .text($('.content > .entry:visible').length + ' Recommendations');
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
    tagList.length ? localStorage.setItem(listType, tagList) : localStorage.removeItem(listType);

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

function isFiltered(tags) {
  return blTags?.some(b => tags.includes(b)) || !wlTags?.every(w => tags.includes(w));
}

function appendTag(tag) {
  const classes = blTags.includes(tag) ? ' rejected' : wlTags.includes(tag) ? ' filtered' : '';
  $(DIV, {
    attr: { 'data-tag': tag },
    class: 'tag' + classes,
    text: tag,
    on: { click: filterTag },
  }).appendTo(this);
  // .on('click', filterTag);
}

function drawRec(rec) {
  const entry = $(DIV, {
    id: rec.id,
    hidden: isFiltered(rec.tags.map(t => t.name)),
    class: 'entry',
  });
  const cell = $(DIV);

  const link = $('<a>', { target: '_blank', href: rec.url });
  const img = $('<img>', {
    loading: 'lazy',
    crossorigin: 'anonymous',
    referrerpolicy: 'no-referrer',
    attr: { width: '250px' },
    src: rec.cover.large,
  });

  // COVER + URL

  link.append(img.clone());
  const text = $('<p>', {
    text: [
      rec.status ? rec.status.charAt(0) + rec.status.slice(1).toLowerCase() : 'Unknown Status',
      rec.chapters ? `[${rec.chapters}]` : '',
      rec.meanScore >= 70 ? '💖' : rec.meanScore >= 60 ? '💙' : '💔',
      rec.meanScore + '%',
    ].join(' '),
  });

  link.append(text.clone());

  cell.attr('class', 'cover').append(link.clone());
  entry.append(cell.clone());

  // CONNECTIONS
  cell.empty().attr('class', 'recs');
  rec.recommended.forEach(origin => {
    if ($(cell).find(`img[src="${origin.cover}"]`).length > 0) return;
    link
      .empty()
      .attr({
        href: ignore.includes(origin.id) ? origin.url : '#' + origin.id,
        target: ignore.includes(origin.id) ? '_blank' : '_self',
        'data-id': origin.id,
      })
      .append(
        img
          .attr({ width: '75px', src: origin.cover, title: origin.title, alt: origin.title })
          .clone()
      );
    cell.append(link.clone());
  });
  entry.append(cell.clone());

  // TITLE (PORTRAIT)
  const textContainer = $(DIV);
  const title = settings.englishTitles ? rec.title.english || rec.title.romaji : rec.title.romaji;
  textContainer.append(
    link
      .empty()
      .removeAttr('data-id')
      .attr({ href: '#' + rec.id, target: '_self' })
      .append(
        $('<h3>', {
          text: rec.isAdult ? '🔞' : '' + flags[rec.countryOfOrigin] + ' ' + title,
          class: settings.englishTitles && rec.title.english ? 'licensed' : '',
        })
      )
  );
  cell.empty().attr('class', 'title').append(textContainer.clone());

  entry.append(cell.clone());

  // ALT. TITLES (PORTRAIT)
  textContainer.empty();
  const altTitles = [
    ...new Set([rec.title.english, rec.title.romaji, ...rec.synonyms, rec.title.native]),
  ]
    .filter(i => (i && i != title ? i : false))
    .join('<br />• ');
  if (altTitles)
    textContainer.append(
      text
        .empty()
        .append('• ' + altTitles)
        .clone()
    );
  cell.empty().attr('class', 'alt-titles').append(textContainer.clone());

  entry.append(cell.clone());

  // TITLES FOR LANDSCAPE
  textContainer.empty().append(entry.find('.title a, .alt-titles p').clone());
  cell.empty().attr('class', 'titles').append(textContainer.clone());

  entry.append(cell.clone());

  // DESCRIPTION
  textContainer.empty().append(
    text
      .empty()
      .append(rec.description || '<i>&lt;Empty Description&gt;</i>')
      .clone()
  );

  const tags = $(SPAN, { style: 'tags' });
  rec.tags
    ?.filter(tag => (settings.spoilers ? !tag.isMediaSpoiler : true))
    .map(tag => tag.name)
    .forEach(appendTag, tags);
  if (tags.children()) tags.appendTo(textContainer);

  $('.content').append(
    entry.append([
      cell.empty().attr('class', 'details').append(textContainer),
      $(SPAN, {
        text: '×',
        class: 'ignore',
        on: {
          click: () => {
            ignore.push(rec.id);
            userIgnored.push(rec.id);
            localStorage.setItem('ignored', userIgnored);
            console.log('Ignored', title);
            entry.remove();
            $(`[data-id='${rec.id}']`).each((_, e) => {
              $(e).siblings().length ? $(e).remove() : $(e).closest('.entry').remove();
            });
            recsCounter();
          },
        },
      }),
    ])
  );
}

$(async () => {
  // Call API from login form
  $('#login').on('submit', async event => {
    event.preventDefault();
    await parseData();
  });

  $('#private').on('change', e => {
    $('#username').prop('disabled', e.target.checked);
    $('#username').show();
  });
  // Refilter on settings change
  $('#filters').on('click', async () => await parseData());
  DEV: await parseData();

  // Back to Top button
  $('#top').on('click', () => scrollTo({ top: 0, behavior: 'smooth' }));

  // Scroll Handler for Pagination
  $(document).on('scroll', scrollHandler);

  // Style Selects
  $('select').select2({
    minimumResultsForSearch: -1,
    width: 'style',
  });
});

function scrollHandler() {
  $('#top').prop('hidden', scrollY < visualViewport.height * 1.1);
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
  $.each(savedSettings, (key, value) => {
    switch ($(key).prop('type')) {
      case 'checkbox':
        $('#' + key).prop('checked', value);
        break;
      default:
        $('#' + key)
          .val(value)
          .trigger('change');
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
  $('.settings input, .settings select').each((_, el) => {
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

export function message() {
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
