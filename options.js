// options.js — страница настроек YMix.
// Хранит API-ключ в chrome.storage.local под именем 'ytApiKey'.

const STORAGE_KEY = 'ytApiKey';

const apiKeyInput = document.getElementById('apiKey');
const saveBtn = document.getElementById('saveBtn');
const clearBtn = document.getElementById('clearBtn');
const statusEl = document.getElementById('status');
const toggleShow = document.getElementById('toggleShow');

// При открытии страницы — подтянуть сохранённый ключ, если есть.
chrome.storage.local.get([STORAGE_KEY], (data) => {
  if (data[STORAGE_KEY]) {
    apiKeyInput.value = data[STORAGE_KEY];
    showStatus('ключ загружен из хранилища', 'ok');
  }
});

// Сохранение.
saveBtn.addEventListener('click', () => {
  const value = apiKeyInput.value.trim();
  if (!value) {
    showStatus('поле пустое — нечего сохранять', 'error');
    return;
  }
  // Лёгкая валидация: ключи Google обычно начинаются с "AIza" и довольно длинные.
  // Это не строгая проверка — Google может изменить формат, — просто защита от опечаток.
  if (!/^AIza[\w-]{20,}$/.test(value)) {
    showStatus('похоже, это не ключ Google API (должен начинаться с AIza)', 'error');
    return;
  }
  chrome.storage.local.set({ [STORAGE_KEY]: value }, () => {
    showStatus('сохранено ✓', 'ok');
  });
});

// Очистка.
clearBtn.addEventListener('click', () => {
  chrome.storage.local.remove(STORAGE_KEY, () => {
    apiKeyInput.value = '';
    showStatus('очищено', 'ok');
  });
});

// Кнопка «показать / скрыть» — переключает type input-а.
toggleShow.addEventListener('click', () => {
  if (apiKeyInput.type === 'password') {
    apiKeyInput.type = 'text';
    toggleShow.textContent = 'скрыть';
  } else {
    apiKeyInput.type = 'password';
    toggleShow.textContent = 'показать';
  }
});

function showStatus(text, kind) {
  statusEl.textContent = text;
  statusEl.classList.toggle('error', kind === 'error');
  // Через 3 секунды убираем сообщение, чтобы не висело.
  clearTimeout(showStatus._t);
  showStatus._t = setTimeout(() => {
    statusEl.textContent = '';
    statusEl.classList.remove('error');
  }, 3000);
}
