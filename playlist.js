// playlist.js — работа с YouTube Data API v3.
// Не трогает DOM, только запросы и парсинг. Используется из mixer.js.

(function () {
  const API_BASE = 'https://www.googleapis.com/youtube/v3';

  // ====== Извлечение ID плейлиста из любой строки ======
  // Пользователь может вставить:
  //   - чистый ID:   PLrAXtmRdnEQy6nuLMt9...
  //   - полную ссылку: https://www.youtube.com/playlist?list=PLxxx
  //   - ссылку на видео в плейлисте: https://www.youtube.com/watch?v=...&list=PLxxx
  // Возвращает либо ID, либо null.
  function extractPlaylistId(input) {
    if (!input) return null;
    const s = String(input).trim();

    // Пробуем как URL.
    try {
      const url = new URL(s);
      const list = url.searchParams.get('list');
      if (list) return list;
    } catch (_) {
      // не URL — пойдём дальше как чистый ID
    }

    // ID плейлиста YouTube: префиксы PL, UU, FL, RD, OL, LL и т.д. + длинный хвост.
    // Берём строго [A-Za-z0-9_-], длиной 12+ символов (короче не бывает).
    if (/^[A-Za-z0-9_-]{12,}$/.test(s)) return s;

    return null;
  }

  // ====== Получение всех элементов плейлиста (с пагинацией) ======
  async function fetchPlaylistItems(playlistId, apiKey) {
    const items = [];
    let pageToken = '';
    let safety = 0; // защита от бесконечного цикла

    do {
      const url = new URL(API_BASE + '/playlistItems');
      url.searchParams.set('part', 'snippet,contentDetails,status');
      url.searchParams.set('playlistId', playlistId);
      url.searchParams.set('maxResults', '50');
      url.searchParams.set('key', apiKey);
      if (pageToken) url.searchParams.set('pageToken', pageToken);

      const resp = await fetch(url.toString());
      if (!resp.ok) {
        // Пытаемся достать осмысленную ошибку из тела ответа.
        let detail = '';
        try {
          const j = await resp.json();
          detail = j.error?.message || '';
        } catch (_) {}
        throw new Error(`playlistItems ${resp.status}: ${detail || resp.statusText}`);
      }
      const data = await resp.json();
      items.push(...(data.items || []));
      pageToken = data.nextPageToken || '';
      safety++;
    } while (pageToken && safety < 40); // 40*50 = 2000 видео — потолок

    return items;
  }

  // ====== Получение длительностей пачкой ======
  // На вход массив videoId, на выход — Map<videoId, durationSeconds>.
  async function fetchDurations(videoIds, apiKey) {
    const result = new Map();
    // API videos.list берёт до 50 ID за раз.
    for (let i = 0; i < videoIds.length; i += 50) {
      const chunk = videoIds.slice(i, i + 50);
      const url = new URL(API_BASE + '/videos');
      url.searchParams.set('part', 'contentDetails');
      url.searchParams.set('id', chunk.join(','));
      url.searchParams.set('key', apiKey);

      const resp = await fetch(url.toString());
      if (!resp.ok) {
        let detail = '';
        try {
          const j = await resp.json();
          detail = j.error?.message || '';
        } catch (_) {}
        throw new Error(`videos ${resp.status}: ${detail || resp.statusText}`);
      }
      const data = await resp.json();
      for (const item of (data.items || [])) {
        result.set(item.id, parseIsoDuration(item.contentDetails?.duration));
      }
    }
    return result;
  }

  // ====== Парсер ISO 8601 длительности (PT1H2M3S) -> секунды ======
  function parseIsoDuration(iso) {
    if (!iso) return 0;
    // Поддерживаем часы/минуты/секунды. Дни/недели в YouTube не встречаются.
    const m = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso);
    if (!m) return 0;
    const h = Number(m[1] || 0);
    const min = Number(m[2] || 0);
    const sec = Number(m[3] || 0);
    return h * 3600 + min * 60 + sec;
  }

  // ====== Форматирование секунд -> "M:SS" или "H:MM:SS" ======
  function formatDuration(totalSec) {
    if (!totalSec || totalSec < 0) return '—';
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    const pad = (n) => String(n).padStart(2, '0');
    if (h > 0) return `${h}:${pad(m)}:${pad(s)}`;
    return `${m}:${pad(s)}`;
  }

  // ====== Главная функция: загрузить плейлист и собрать треки ======
  // Возвращает массив объектов:
  //   { videoId, title, channel, thumbUrl, durationSec, available }
  async function loadPlaylist(playlistId, apiKey) {
    const rawItems = await fetchPlaylistItems(playlistId, apiKey);

    // Превращаем в наш формат. Заодно отмечаем недоступные видео
    // (приватные/удалённые — у них privacyStatus !== 'public' либо нет videoId).
    const tracks = rawItems.map((it) => {
      const sn = it.snippet || {};
      const cd = it.contentDetails || {};
      const st = it.status || {};
      const videoId = cd.videoId || sn.resourceId?.videoId || '';
      const thumb =
        sn.thumbnails?.medium?.url ||
        sn.thumbnails?.default?.url ||
        '';
      // Удалённые/приватные обычно имеют title "Private video" / "Deleted video"
      // и privacyStatus !== 'public'. Это не строгий критерий, но рабочий.
      const available = !!videoId &&
        st.privacyStatus !== 'private' &&
        sn.title !== 'Private video' &&
        sn.title !== 'Deleted video';

      return {
        videoId,
        title: sn.title || '(без названия)',
        channel: sn.videoOwnerChannelTitle || sn.channelTitle || '',
        thumbUrl: thumb,
        durationSec: 0,
        available,
      };
    });

    // Дёргаем длительности только для доступных видео.
    const availableIds = tracks.filter(t => t.available).map(t => t.videoId);
    if (availableIds.length > 0) {
      const durMap = await fetchDurations(availableIds, apiKey);
      for (const t of tracks) {
        if (durMap.has(t.videoId)) t.durationSec = durMap.get(t.videoId);
      }
    }

    return tracks;
  }

  // Экспорт.
  window.YMixPlaylist = {
    extractPlaylistId,
    loadPlaylist,
    formatDuration,
  };
})();
