/* recorder.js — injected into the page at record-time.
   Guards against double-injection. */
if (!window.__streamRecorderLoaded) {
  window.__streamRecorderLoaded = true;
  window.__streamRecorder = window.__streamRecorder || null;
}
