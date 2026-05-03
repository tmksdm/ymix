// mixer.js — логика страницы миксера.
// Этап 2: два iframe-а с github.io, общаемся через postMessage.

console.log('YMix mixer page loaded');

// Должно совпадать с origin страниц-плееров (github.io).
const PLAYER_ORIGIN = 'https://tmksdm.github.io';

const frames = {
  a: document.getElementById('frame-a'),
  b: document.getElementById('frame-b'),
};

const ready = { a: false, b: false };

// ====== Приём сообщений из плееров ======
window.addEventListener('message', (event) => {
  // Безопасность: принимаем только сообщения от наших страниц на github.io.
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

// ====== Отправка команд в плееры ======
function sendToDeck(deckKey, message) {
  const frame = frames[deckKey];
  if (!frame || !frame.contentWindow) return;
  // targetOrigin: точно адресуем github.io — браузер не доставит сообщение,
  // если в iframe внезапно загрузилась чужая страница.
  frame.contentWindow.postMessage(message, PLAYER_ORIGIN);
}

// ====== Кнопки Play/Pause ======
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

// ====== Утилиты ======
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
