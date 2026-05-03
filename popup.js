document.getElementById('openMixer').addEventListener('click', () => {
  chrome.tabs.create({
    url: chrome.runtime.getURL('mixer.html')
  });
  window.close();
});
