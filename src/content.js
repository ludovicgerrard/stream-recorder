/* content.js — injected into every page
   Listens for messages from the background/popup and
   reports video elements found on the page. */

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'PING') {
    sendResponse({ status: 'ok' });
    return true;
  }

  if (msg.type === 'GET_VIDEOS') {
    const videos = Array.from(document.querySelectorAll('video')).map((v, i) => ({
      index:      i,
      src:        v.src || v.currentSrc || '',
      duration:   v.duration,
      paused:     v.paused,
      width:      v.videoWidth,
      height:     v.videoHeight,
      readyState: v.readyState
    }));
    sendResponse({ videos });
    return true;
  }

  if (msg.type === 'STOP_RECORDING') {
    if (window.__streamRecorder) {
      window.__streamRecorder.stop();
      window.__streamRecorder = null;
    }
    sendResponse({ stopped: true });
    return true;
  }
});
