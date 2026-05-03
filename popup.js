document.getElementById('openMixer').addEventListener('click', () => {
  chrome.tabs.create({
    url: chrome.runtime.getURL('mixer.html')
  });
  window.close();
});

document.getElementById('openOptions').addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
  window.close();
});
