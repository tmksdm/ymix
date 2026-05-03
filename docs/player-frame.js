// player-frame.js — страница с одним YouTube-плеером.
// Управляется через postMessage от родителя (mixer.html).
// Запускается внутри <iframe sandbox="allow-scripts allow-same-origin ...">.

(function () {
  const params = new URLSearchParams(location.search);
  const deckKey = params.get('deck') || 'x';
  const initialVideoId = params.get('video') || '';

  let player = null;

  // Грузим IFrame API ЛОКАЛЬНО — внешние скрипты в MV3 запрещены.
  // Сам этот скрипт-загрузчик дальше подтянет нужный плеер с youtube.com/embed/...
  // и тот тоже будет работать благодаря frame-src в манифесте.
  const tag = document.createElement('script');
  tag.src = 'vendor/youtube-iframe-api.js';
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

  function sendToParent(msg) {
    parent.postMessage(msg, '*');
  }

  window.addEventListener('message', (event) => {
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
