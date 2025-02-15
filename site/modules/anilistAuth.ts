import Cookies from 'js-cookie';
import { decodeJwt } from 'jose';
import { message, settings } from '../script';

export var jwt = Cookies.get('jwt') || localStorage.getItem('jwt');

// vvv AUTHENTICATION vvv
// Check if authentication is saved and clear if expired
if (jwt && Number(decodeJwt(jwt).exp) * 1000 < Date.now()) jwt = null;
// Save authentication from AniList redirect and clear the URL afterwards
if (location.hash.search('access_token') !== -1) {
  const url = new URL(location.href);
  url.search = url.hash.slice(1);
  url.hash = '';
  jwt = url.searchParams.get('access_token');
  // localStorage.setItem('jwt', jwt);
  Cookies.set('jwt', jwt, { expires: new Date(decodeJwt(jwt).exp * 1000) });
  url.search = '';
  history.replaceState(null, '', url.toString());
  message('(⌐■_■)', 'Authenticated with AniList');
}

export function validateUser() {
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
