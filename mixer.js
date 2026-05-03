// mixer.js — логика страницы миксера.
// Этап 2: два sandbox-iframe с YouTube-плеерами, общаемся через postMessage.

console.log('YMix mixer page loaded');

// Кэшируем ссылки на iframe-ы по ключу дека.
const frames = {
  a: document.getElementById('frame-a'),
  b: document.getElementById('frame-b'),
};

// Чтобы не слать команды до того, как плеер готов.
const ready = { a: false, b: false };

// ====== Приём сообщений из sandbox-страниц ======
window.addEventListener('message', (event) => {
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

// ====== Отправка команд в sandbox ======
function sendToDeck(deckKey, message) {
  const frame = frames[deckKey];
  if (!frame || !frame.contentWindow) return;
  // '*' — потому что sandbox-страница имеет origin null,
  // и точечно адресовать её по origin не получится.
  frame.contentWindow.postMessage(message, '*');
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
