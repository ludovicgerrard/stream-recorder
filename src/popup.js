let selectedIndex = null;
let timerInterval = null;
let startTime = null;

const list      = document.getElementById('video-list');
const btnScan   = document.getElementById('btn-scan');
const btnRecord = document.getElementById('btn-record');
const btnStop   = document.getElementById('btn-stop');
const status    = document.getElementById('status');
const recDot    = document.getElementById('rec-dot');
const recTimer  = document.getElementById('rec-timer');

/* ── helpers ── */
function setStatus(msg, type = '') {
  status.textContent = msg;
  status.className = 'statusbar' + (type ? ' ' + type : '');
}

function formatTime(ms) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  return String(m).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
}

function startTimer() {
  startTime = Date.now();
  recTimer.style.display = 'block';
  timerInterval = setInterval(() => {
    recTimer.textContent = formatTime(Date.now() - startTime);
  }, 500);
}

function stopTimer() {
  clearInterval(timerInterval);
  recTimer.style.display = 'none';
  recTimer.textContent = '00:00';
}

async function getCurrentTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

/* ── scan page for videos ── */
btnScan.addEventListener('click', async () => {
  btnScan.disabled = true;
  setStatus('Scanning…', 'info');
  selectedIndex = null;
  btnRecord.disabled = true;

  const tab = await getCurrentTab();

  let videos = [];
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        return Array.from(document.querySelectorAll('video')).map((v, i) => ({
          index:    i,
          src:      v.src || v.currentSrc || '',
          duration: v.duration,
          paused:   v.paused,
          width:    v.videoWidth,
          height:   v.videoHeight,
          readyState: v.readyState
        }));
      }
    });
    videos = results[0].result || [];
  } catch(e) {
    setStatus('Cannot access this page', 'err');
    btnScan.disabled = false;
    return;
  }

  btnScan.disabled = false;

  if (!videos.length) {
    list.innerHTML = `<div class="empty">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" display="block" style="margin:0 auto 6px">
        <rect x="2" y="7" width="15" height="10" rx="2"/><path d="M17 9.5l5-3v11l-5-3V9.5z"/>
      </svg>No videos found on this page</div>`;
    setStatus('No videos detected', 'err');
    return;
  }

  list.innerHTML = '';
  videos.forEach(v => {
    const isLive = !isFinite(v.duration) || v.duration === 0;
    const res    = v.width && v.height ? `${v.width}×${v.height}` : 'unknown res';
    const srcShort = v.src
      ? (v.src.startsWith('blob:') ? 'blob (MSE stream)' : v.src.split('/').pop().slice(0, 30))
      : 'no src';

    const item = document.createElement('div');
    item.className = 'video-item';
    item.dataset.index = v.index;
    item.innerHTML = `
      <div class="vi-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <rect x="2" y="7" width="15" height="10" rx="2"/>
          <path d="M17 9.5l5-3v11l-5-3V9.5z"/>
        </svg>
      </div>
      <div class="vi-info">
        <div class="vi-name">Video ${v.index + 1} — ${res}</div>
        <div class="vi-meta">${srcShort}</div>
      </div>
      <div class="vi-badge ${isLive ? 'live' : ''}">${isLive ? 'LIVE' : 'VOD'}</div>`;

    item.addEventListener('click', () => {
      document.querySelectorAll('.video-item').forEach(el => el.classList.remove('selected'));
      item.classList.add('selected');
      selectedIndex = v.index;
      btnRecord.disabled = false;
      setStatus(`Video ${v.index + 1} selected`);
    });

    list.appendChild(item);
  });

  setStatus(`Found ${videos.length} video${videos.length > 1 ? 's' : ''}`, 'ok');
});

/* ── start recording ── */
btnRecord.addEventListener('click', async () => {
  if (selectedIndex === null) return;

  const fmt     = document.getElementById('fmt').value;
  const quality = parseInt(document.getElementById('quality').value);
  const tab     = await getCurrentTab();

  setStatus('Starting recorder…', 'info');
  btnRecord.disabled = true;
  btnStop.disabled   = false;
  btnScan.disabled   = true;
  recDot.classList.add('recording');
  startTimer();

  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files:  ['src/recorder.js']
    });

    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: (idx, mimeType, bitsPerSecond) => {
        window.__streamRecorder?.stop();
        const video = document.querySelectorAll('video')[idx];
        if (!video) { alert('Video element not found.'); return; }

        const stream = video.captureStream ? video.captureStream()
                     : video.mozCaptureStream ? video.mozCaptureStream()
                     : null;

        if (!stream) { alert('captureStream() not supported on this video.'); return; }

        const mime = MediaRecorder.isTypeSupported(mimeType) ? mimeType : 'video/webm';
        const rec  = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: bitsPerSecond });
        const chunks = [];

        rec.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };
        rec.onstop = () => {
          const blob = new Blob(chunks, { type: mime });
          const url  = URL.createObjectURL(blob);
          const a    = document.createElement('a');
          a.href     = url;
          a.download = 'recording_' + Date.now() + '.webm';
          document.body.appendChild(a);
          a.click();
          setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 3000);
          window.__streamRecorder = null;
        };

        rec.start(1000);
        window.__streamRecorder = rec;
      },
      args: [selectedIndex, fmt, quality]
    });

    setStatus('Recording…', 'ok');
  } catch(e) {
    setStatus('Error: ' + e.message, 'err');
    resetUI();
  }
});

/* ── stop recording ── */
btnStop.addEventListener('click', async () => {
  const tab = await getCurrentTab();
  setStatus('Saving file…', 'info');

  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => { window.__streamRecorder?.stop(); }
    });
    setStatus('Download started!', 'ok');
  } catch(e) {
    setStatus('Error stopping: ' + e.message, 'err');
  }

  resetUI();
});

function resetUI() {
  btnRecord.disabled = false;
  btnStop.disabled   = true;
  btnScan.disabled   = false;
  recDot.classList.remove('recording');
  stopTimer();
}

/* ── restore state if recording was already started ── */
chrome.storage.session?.get('recState', data => {
  if (data?.recState === 'recording') {
    recDot.classList.add('recording');
    btnStop.disabled   = false;
    btnRecord.disabled = true;
    setStatus('Recording in progress…', 'ok');
  }
});
