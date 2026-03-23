/* background.js — service worker
   Handles lifecycle events and cross-tab messaging. */

chrome.runtime.onInstalled.addListener(() => {
  console.log('Stream Recorder installed.');
});

/* Forward stop-recording command from any context */
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'STOP_ALL') {
    chrome.tabs.query({}, tabs => {
      tabs.forEach(tab => {
        chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: () => { window.__streamRecorder?.stop(); }
        }).catch(() => {});
      });
    });
    sendResponse({ ok: true });
    return true;
  }
});
