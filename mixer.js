// mixer.js — логика страницы миксера.
// Этап 2: два iframe-а с github.io, общаемся через postMessage.
// Этап 3: загрузка плейлиста через YouTube Data API + рендер списка.
// Этап 4: очередь, последовательное воспроизведение, общие кнопки транспорта.

console.log('YMix mixer page loaded');

// Должно совпадать с origin страниц-плееров (github.io).
const PLAYER_ORIGIN = 'https://tmksdm.github.io';

// Ключи в chrome.storage.local.
const STORAGE_API_KEY = 'ytApiKey';
const STORAGE_LAST_PLAYLIST = 'lastPlaylist'; // { id, tracks, savedAt }

// ====== DOM ======
const frames = {
  a: document.getElementById('frame-a'),
  b: document.getElementById('frame-b'),
};
const deckEls = {
  a: document.getElementById('deck-a'),
  b: document.getElementById('deck-b'),
};

const playlistInput = document.getElementById('playlistInput');
const loadPlaylistBtn = document.getElementById('loadPlaylistBtn');
const barStatus = document.getElementById('barStatus');
const tracksList = document.getElementById('tracksList');

const btnPrev  = document.getElementById('btnPrev');
const btnPlay  = document.getElementById('btnPlay');
const btnPause = document.getElementById('btnPause');
const btnNext  = document.getElementById('btnNext');
const nowPlayingEl = document.getElementById('nowPlaying');

// ====== Состояние ======
const ready = { a: false, b: false };

// Очередь и текущая позиция.
let currentTracks = []; // массив треков (см. playlist.js: loadPlaylist)
let queueIndex = -1;    // индекс текущего трека в currentTracks (-1 = ничего)
let activeDeck = 'a';   // на каком деке сейчас играем (на Этапе 4 всегда 'a')
let isPlaying = false;  // играет ли сейчас активный дек

// Флаг, чтобы при первом state=0 (после ручной паузы/cue) не уехать на следующий трек.
// state=0 (ENDED) приходит только когда видео реально доиграло до конца.
// Но YT может прислать 0 и при stopVideo — поэтому подстрахуемся флагом.
let expectEndedAdvance = false;

// ====== Сообщения от плееров ======
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
      updateTransportButtons();
      break;

    case 'state':
      console.log(`[YMix] Player ${msg.deck} state: ${stateToName(msg.state)}`);
      setStatus(msg.deck, stateToName(msg.state));
      handlePlayerState(msg.deck, msg.state);
      break;

    case 'error':
      console.error(`[YMix] Player ${msg.deck} error:`, msg.code);
      setStatus(msg.deck, `ошибка ${msg.code}`);
      // Если ошибка на активном деке во время воспроизведения — пробуем дальше.
      if (msg.deck === activeDeck && isPlaying) {
        playNext();
      }
      break;
  }
});

function sendToDeck(deckKey, message) {
  const frame = frames[deckKey];
  if (!frame || !frame.contentWindow) return;
  frame.contentWindow.postMessage(message, PLAYER_ORIGIN);
}

// ====== Реакция на состояние плеера ======
function handlePlayerState(deckKey, state) {
  if (deckKey !== activeDeck) return;

  // 1 = играет, 2 = пауза, 0 = закончено.
  if (state === 1) {
    isPlaying = true;
    expectEndedAdvance = true; // раз пошло играть — значит, следующий ENDED законный
    updateTransportButtons();
  } else if (state === 2) {
    isPlaying = false;
    updateTransportButtons();
  } else if (state === 0) {
    // Видео доиграло. Переходим на следующий трек.
    if (expectEndedAdvance) {
      expectEndedAdvance = false;
      playNext();
    }
  }
}

// ====== Кнопки на самих деках (оставляем для отладки) ======
document.addEventListener('click', (e) => {
  const btn = e.target.closest('.deck button[data-deck]');
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
    .querySelectorAll(`.deck button[data-deck="${deckKey}"]`)
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

// ====== Транспорт: общие кнопки ======
btnPlay.addEventListener('click', () => {
  if (queueIndex < 0) {
    // Ничего не выбрано — стартуем с первого доступного трека.
    const firstAvailable = currentTracks.findIndex(t => t.available);
    if (firstAvailable >= 0) playTrackAt(firstAvailable);
  } else {
    // Просто разблокируем паузу на активном деке.
    sendToDeck(activeDeck, { type: 'play' });
  }
});

btnPause.addEventListener('click', () => {
  sendToDeck(activeDeck, { type: 'pause' });
});

btnNext.addEventListener('click', () => playNext());
btnPrev.addEventListener('click', () => playPrev());

function updateTransportButtons() {
  const hasTracks = currentTracks.some(t => t.available);
  const deckReady = ready[activeDeck];

  btnPlay.disabled  = !hasTracks || !deckReady;
  btnPause.disabled = !isPlaying || !deckReady;
  btnNext.disabled  = !hasTracks || !deckReady;
  btnPrev.disabled  = !hasTracks || !deckReady || queueIndex <= 0;
}

// ====== Воспроизведение по очереди ======
function playTrackAt(index) {
  if (index < 0 || index >= currentTracks.length) return;
  const track = currentTracks[index];
  if (!track || !track.available) {
    // Недоступный — попробуем найти следующий доступный.
    const next = findNextAvailable(index, +1);
    if (next >= 0) playTrackAt(next);
    return;
  }

  queueIndex = index;
  // На Этапе 4 активный дек всегда A. На Этапе 5 будем чередовать.
  activeDeck = 'a';

  // Загружаем и сразу запускаем.
  expectEndedAdvance = false; // станет true, когда придёт state=1
  sendToDeck(activeDeck, { type: 'loadAndPlay', videoId: track.videoId });

  // UI.
  setActiveDeckHighlight(activeDeck);
  highlightCurrentTrack(index);
  updateNowPlaying(track);
  updateTransportButtons();
}

function playNext() {
  const next = findNextAvailable(queueIndex, +1);
  if (next >= 0) {
    playTrackAt(next);
  } else {
    // Дошли до конца плейлиста (repeat-режимы будут на Этапе 6).
    stopActiveDeck();
    queueIndex = -1;
    isPlaying = false;
    highlightCurrentTrack(-1);
    updateNowPlaying(null);
    updateTransportButtons();
  }
}

function playPrev() {
  const prev = findNextAvailable(queueIndex, -1);
  if (prev >= 0) playTrackAt(prev);
}

// Ищет следующий/предыдущий доступный трек, начиная с from + step.
function findNextAvailable(from, step) {
  let i = from + step;
  while (i >= 0 && i < currentTracks.length) {
    if (currentTracks[i] && currentTracks[i].available) return i;
    i += step;
  }
  return -1;
}

function stopActiveDeck() {
  expectEndedAdvance = false; // не считать остановку за «трек кончился»
  sendToDeck(activeDeck, { type: 'stop' });
}

// ====== UI: подсветка ======
function setActiveDeckHighlight(deckKey) {
  Object.entries(deckEls).forEach(([k, el]) => {
    if (!el) return;
    el.classList.toggle('active', k === deckKey);
  });
}

function highlightCurrentTrack(index) {
  const items = tracksList.querySelectorAll('li.track');
  items.forEach((li, i) => li.classList.toggle('current', i === index));
  // Прокрутить активный трек в зону видимости.
  if (index >= 0 && items[index]) {
    items[index].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
}

function updateNowPlaying(track) {
  if (!track) {
    nowPlayingEl.textContent = '— ничего не играет —';
    return;
  }
  nowPlayingEl.innerHTML = '';
  const label = document.createElement('strong');
  label.textContent = track.title;
  nowPlayingEl.append(`▶ `, label);
  if (track.channel) {
    nowPlayingEl.append(` — ${track.channel}`);
  }
}

// ====== Плейлист: загрузка и рендер ======

// При открытии страницы — подгрузить последний плейлист, если есть.
chrome.storage.local.get([STORAGE_LAST_PLAYLIST], (data) => {
  const last = data[STORAGE_LAST_PLAYLIST];
  if (last && Array.isArray(last.tracks) && last.tracks.length > 0) {
    currentTracks = last.tracks;
    playlistInput.value = last.id || '';
    renderTracks(currentTracks);
    setBarStatus(`загружен сохранённый плейлист: ${currentTracks.length} треков`, 'ok');
    updateTransportButtons();
  }
});

loadPlaylistBtn.addEventListener('click', loadPlaylistFromInput);
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

    // Сбросим текущее воспроизведение — плейлист сменился.
    stopActiveDeck();
    queueIndex = -1;
    isPlaying = false;
    updateNowPlaying(null);

    renderTracks(tracks);

    chrome.storage.local.set({
      [STORAGE_LAST_PLAYLIST]: {
        id: playlistId,
        tracks,
        savedAt: Date.now(),
      },
    });

    const ok = tracks.filter(t => t.available).length;
    setBarStatus(`загружено треков: ${tracks.length} (доступно: ${ok})`, 'ok');
    updateTransportButtons();
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
    li.dataset.index = String(idx);

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

// Делегированный клик по треку: играть с этого места.
tracksList.addEventListener('click', (e) => {
  const li = e.target.closest('li.track');
  if (!li) return;
  if (li.classList.contains('unavailable')) return;
  const idx = Number(li.dataset.index);
  if (!Number.isFinite(idx)) return;
  playTrackAt(idx);
});

// ====== Утилиты ======
function setBarStatus(text, kind) {
  barStatus.textContent = text;
  barStatus.classList.toggle('error', kind === 'error');
  barStatus.classList.toggle('ok', kind === 'ok');
}

function chromeStorageGet(keys) {
  return new Promise((resolve) => {
    chrome.storage.local.get(keys, resolve);
  });
}
