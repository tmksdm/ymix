// player-frame.js — страница с одним YouTube-плеером.
// Размещена на GitHub Pages (https://tmksdm.github.io/ymix/), потому что
// в Manifest V3 расширения YouTube IFrame API работать не может.
// Управляется через postMessage от родителя (mixer.html в расширении).

(function () {
  const params = new URLSearchParams(location.search);
  const deckKey = params.get('deck') || 'x';
  const initialVideoId = params.get('video') || '';

  let player = null;

  // Загружаем официальный YT IFrame API. На обычной https-странице это работает штатно.
  const tag = document.createElement('script');
  tag.src = 'https://www.youtube.com/iframe_api';
  document.head.appendChild(tag);

  window.onYouTubeIframeAPIReady = function () {
    player = new YT.Player('player', {
      videoId: initialVideoId,
      playerVars: {
        controls: 1,
        rel: 0,
        playsinline: 1,
        disablekb: 0,
      },
      events: {
        onReady: () => {
          player.setVolume(100);
          sendToParent({ type: 'ready', deck: deckKey });
        },
        onStateChange: (e) => {
          sendToParent({ type: 'state', deck: deckKey, state: e.data });
        },
        onError: (e) => {
          sendToParent({ type: 'error', deck: deckKey, code: e.data });
        },
      },
    });
  };

  // ====== Связь с родителем (mixer.html в расширении) ======
  function sendToParent(msg) {
    // '*' — потому что родитель и эта страница на разных origin-ах
    // (chrome-extension://... и https://tmksdm.github.io). Для безопасности
    // на стороне родителя мы будем фильтровать сообщения по event.origin.
    parent.postMessage(msg, '*');
  }

  window.addEventListener('message', (event) => {
    // Принимаем только команды от родителя на chrome-extension://...
    // Другие фреймы и страницы пускай не вмешиваются.
    if (!event.origin || !event.origin.startsWith('chrome-extension://')) return;

    const msg = event.data;
    if (!msg || typeof msg !== 'object') return;
    if (!player) return;

    switch (msg.type) {
      case 'play':
        player.playVideo();
        break;
      case 'pause':
        player.pauseVideo();
        break;
      case 'setVolume':
        player.setVolume(Number(msg.value) || 0);
        break;
      case 'loadVideo':
        if (msg.videoId) player.loadVideoById(msg.videoId);
        break;
    }
  });
})();
