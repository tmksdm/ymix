// mixer.js — логика страницы миксера.
// Этап 2: два iframe-а с github.io, общаемся через postMessage.
// Этап 3.2: загрузка плейлиста через YouTube Data API + рендер списка.

console.log('YMix mixer page loaded');

// Должно совпадать с origin страниц-плееров (github.io).
const PLAYER_ORIGIN = 'https://tmksdm.github.io';

// Ключи в chrome.storage.local.
const STORAGE_API_KEY = 'ytApiKey';
const STORAGE_LAST_PLAYLIST = 'lastPlaylist'; // { id, tracks, savedAt }

const frames = {
  a: document.getElementById('frame-a'),
  b: document.getElementById('frame-b'),
};

const ready = { a: false, b: false };

// ====== Деки: приём сообщений из плееров ======
window.addEventListener('message', (event) => {
  if (event.origin !== PLAYER_ORIGIN) return;

  const msg = event.data;
  if (!msg || typeof msg !== 'object' || !msg.deck) return;

  switch (msg.type) {
    case 'ready':
      console.log(`[YMix] Player ${msg.deck} ready`);
      ready[msg.deck] = true;
      enableDeckButtons(msg.deck);
      setStatus(msg.deck, 'готов');
      break;

    case 'state':
      console.log(`[YMix] Player ${msg.deck} state: ${stateToName(msg.state)}`);
      setStatus(msg.deck, stateToName(msg.state));
      break;

    case 'error':
      console.error(`[YMix] Player ${msg.deck} error:`, msg.code);
      setStatus(msg.deck, `ошибка ${msg.code}`);
      break;
  }
});

function sendToDeck(deckKey, message) {
  const frame = frames[deckKey];
  if (!frame || !frame.contentWindow) return;
  frame.contentWindow.postMessage(message, PLAYER_ORIGIN);
}

document.addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-deck]');
  if (!btn) return;

  const deckKey = btn.dataset.deck;
  if (!ready[deckKey]) return;

  if (btn.classList.contains('btn-play')) {
    sendToDeck(deckKey, { type: 'play' });
  } else if (btn.classList.contains('btn-pause')) {
    sendToDeck(deckKey, { type: 'pause' });
  }
});

function enableDeckButtons(deckKey) {
  document
    .querySelectorAll(`button[data-deck="${deckKey}"]`)
    .forEach((btn) => (btn.disabled = false));
}

function setStatus(deckKey, text) {
  const el = document.getElementById(`status-${deckKey}`);
  if (el) el.textContent = text;
}

function stateToName(code) {
  switch (code) {
    case -1: return 'не начато';
    case 0:  return 'закончено';
    case 1:  return 'играет';
    case 2:  return 'пауза';
    case 3:  return 'буферизация';
    case 5:  return 'готово к воспроизведению';
    default: return `код ${code}`;
  }
}

// ====== Плейлист ======

const playlistInput = document.getElementById('playlistInput');
const loadPlaylistBtn = document.getElementById('loadPlaylistBtn');
const barStatus = document.getElementById('barStatus');
const tracksList = document.getElementById('tracksList');

let currentTracks = []; // массив треков, который потом будет использовать Этап 4

// При открытии страницы — подгрузить последний плейлист, если есть.
chrome.storage.local.get([STORAGE_LAST_PLAYLIST], (data) => {
  const last = data[STORAGE_LAST_PLAYLIST];
  if (last && Array.isArray(last.tracks) && last.tracks.length > 0) {
    currentTracks = last.tracks;
    playlistInput.value = last.id || '';
    renderTracks(currentTracks);
    setBarStatus(`загружен сохранённый плейлист: ${currentTracks.length} треков`, 'ok');
  }
});

// Клик «Загрузить».
loadPlaylistBtn.addEventListener('click', loadPlaylistFromInput);

// Enter в поле ввода = клик по кнопке.
playlistInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') loadPlaylistFromInput();
});

async function loadPlaylistFromInput() {
  const raw = playlistInput.value.trim();
  if (!raw) {
    setBarStatus('введи ID плейлиста или ссылку', 'error');
    return;
  }

  const playlistId = YMixPlaylist.extractPlaylistId(raw);
  if (!playlistId) {
    setBarStatus('не удалось распознать ID плейлиста', 'error');
    return;
  }

  // Достаём API-ключ.
  const { [STORAGE_API_KEY]: apiKey } = await chromeStorageGet([STORAGE_API_KEY]);
  if (!apiKey) {
    setBarStatus('нет API-ключа — открой Настройки и сохрани его', 'error');
    return;
  }

  loadPlaylistBtn.disabled = true;
  setBarStatus('загружаю плейлист…', '');

  try {
    const tracks = await YMixPlaylist.loadPlaylist(playlistId, apiKey);
    currentTracks = tracks;
    renderTracks(tracks);

    // Сохраняем «последний плейлист» для следующего открытия.
    chrome.storage.local.set({
      [STORAGE_LAST_PLAYLIST]: {
        id: playlistId,
        tracks,
        savedAt: Date.now(),
      },
    });

    const ok = tracks.filter(t => t.available).length;
    setBarStatus(`загружено треков: ${tracks.length} (доступно: ${ok})`, 'ok');
  } catch (err) {
    console.error('[YMix] Ошибка загрузки плейлиста:', err);
    setBarStatus(`ошибка: ${err.message}`, 'error');
  } finally {
    loadPlaylistBtn.disabled = false;
  }
}

// ====== Рендер списка треков ======
function renderTracks(tracks) {
  tracksList.innerHTML = '';
  if (!tracks || tracks.length === 0) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = 'плейлист пустой';
    tracksList.appendChild(li);
    return;
  }

  tracks.forEach((t, idx) => {
    const li = document.createElement('li');
    li.className = 'track' + (t.available ? '' : ' unavailable');

    const num = document.createElement('span');
    num.className = 'num';
    num.textContent = String(idx + 1);

    const img = document.createElement('img');
    img.src = t.thumbUrl || '';
    img.alt = '';
    img.loading = 'lazy';

    const title = document.createElement('span');
    title.className = 'title';
    title.textContent = t.title;
    title.title = t.channel ? `${t.title} — ${t.channel}` : t.title;

    const dur = document.createElement('span');
    dur.className = 'dur';
    dur.textContent = t.available ? YMixPlaylist.formatDuration(t.durationSec) : '✕';

    li.append(num, img, title, dur);
    tracksList.appendChild(li);
  });
}

// ====== Утилиты ======
function setBarStatus(text, kind) {
  barStatus.textContent = text;
  barStatus.classList.toggle('error', kind === 'error');
  barStatus.classList.toggle('ok', kind === 'ok');
}

// chrome.storage.local.get с промисом (чтобы можно было await).
function chromeStorageGet(keys) {
  return new Promise((resolve) => {
    chrome.storage.local.get(keys, resolve);
  });
}
