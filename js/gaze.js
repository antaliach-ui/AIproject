// Gaze input: an eye-tracking source (WebGazer, front camera) or a pointer
// source (mouse / head-mouse / finger drag), plus a dwell selector that turns
// "staring at a target for N ms" into a selection.

const WEBGAZER_URLS = [
  'https://webgazer.cs.brown.edu/webgazer.js',
  'https://cdn.jsdelivr.net/npm/webgazer/dist/webgazer.js',
];

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.async = true;
    s.onload = resolve;
    s.onerror = () => {
      s.remove();
      reject(new Error(`Failed to load ${src}`));
    };
    document.head.appendChild(s);
  });
}

async function loadWebGazer() {
  if (window.webgazer) return window.webgazer;
  let lastErr;
  for (const url of WEBGAZER_URLS) {
    try {
      await loadScript(url);
      if (window.webgazer) return window.webgazer;
    } catch (e) {
      lastErr = e;
    }
  }
  console.error(lastErr);
  throw new Error('Could not load eye tracking. Connect to the internet once so it can be downloaded.');
}

export class EyeSource {
  constructor() {
    this.listener = null;
    this.started = false;
    this.wg = null;
  }

  onPoint(fn) {
    this.listener = fn;
  }

  async start() {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('Camera access is not available. Open the app over HTTPS in a modern browser.');
    }
    const wg = await loadWebGazer();
    this.wg = wg;
    if (this.started) {
      wg.resume();
      return;
    }
    wg.params.showVideoPreview = true;
    wg.params.showFaceOverlay = true;
    wg.params.showFaceFeedbackBox = true;
    wg.params.showGazeDot = false;
    if (wg.params.camConstraints) {
      wg.params.camConstraints = { video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } } };
    }
    wg.setRegression('ridge')
      .saveDataAcrossSessions(true)
      .setGazeListener((data) => {
        if (data && this.listener) this.listener(data.x, data.y);
      });
    await new Promise((resolve, reject) => {
      let failed = false;
      wg.begin(() => {
        failed = true;
        reject(new Error('Camera permission was denied or no camera was found.'));
      })
        .then(() => !failed && resolve())
        .catch(reject);
    });
    wg.showPredictionPoints(false);
    if (typeof wg.applyKalmanFilter === 'function') wg.applyKalmanFilter(true);
    this.started = true;
    this.setVideoVisible(true);
  }

  setVideoVisible(visible) {
    const wg = this.wg;
    if (!wg) return;
    wg.showVideoPreview?.(visible);
    wg.showFaceOverlay?.(visible);
    wg.showFaceFeedbackBox?.(visible);
    document.body.classList.toggle('camera-visible', visible);
  }

  /** Feed a known (x, y) look target to the model. */
  train(x, y) {
    if (!this.wg) return;
    // recordScreenPosition(x, y, eventType) is the documented training hook.
    this.wg.recordScreenPosition?.(x, y, 'click');
  }

  clearCalibration() {
    this.wg?.clearData?.();
  }

  pause() {
    if (this.started) this.wg?.pause();
  }

  resume() {
    if (this.started) this.wg?.resume();
  }

  stop() {
    if (this.started) {
      try {
        this.wg?.end();
      } catch (_) {
        /* ignore */
      }
      this.started = false;
    }
    document.body.classList.remove('camera-visible');
  }
}

export class PointerSource {
  constructor() {
    this.listener = null;
    this.handler = (e) => this.listener?.(e.clientX, e.clientY);
  }
  onPoint(fn) {
    this.listener = fn;
  }
  async start() {
    window.addEventListener('pointermove', this.handler, { passive: true });
    window.addEventListener('pointerdown', this.handler, { passive: true });
  }
  pause() {}
  resume() {}
  stop() {
    window.removeEventListener('pointermove', this.handler);
    window.removeEventListener('pointerdown', this.handler);
  }
}

/**
 * Turns a stream of (x, y) points into dwell selections on elements with
 * a `data-gaze` attribute.
 */
export class DwellSelector {
  constructor({ onSelect, isAllowed, dot }) {
    this.onSelect = onSelect;
    this.isAllowed = isAllowed || (() => true);
    this.dot = dot;
    this.dwellMs = 1500;
    this.graceMs = 250; // tolerate short glances away (jitter)
    this.cooldownMs = 500; // pause after a selection before the next one can start
    this.snapRadius = 70; // px: snap to the nearest target when gaze lands in a gap
    this.smoothing = 8; // number of samples in the moving average
    // Eye trackers stream points constantly, so silence means "lost face".
    // Pointers only report movement, so a still pointer is still valid.
    this.staleMs = 600;
    this.samples = [];
    this.lastPointAt = 0;
    this.point = null;
    this.current = null;
    this.startAt = 0;
    this.lastSeenAt = 0;
    this.running = false;
    this.enabled = true;
    this.loop = this.loop.bind(this);
  }

  feed(x, y) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    this.samples.push([x, y]);
    if (this.samples.length > this.smoothing) this.samples.shift();
    const n = this.samples.length;
    let sx = 0;
    let sy = 0;
    for (const [px, py] of this.samples) {
      sx += px;
      sy += py;
    }
    this.point = { x: sx / n, y: sy / n };
    this.lastPointAt = performance.now();
  }

  start() {
    if (this.running) return;
    this.running = true;
    requestAnimationFrame(this.loop);
  }

  stop() {
    this.running = false;
    this.clearCurrent();
    if (this.dot) this.dot.hidden = true;
  }

  /** Forget the last point (e.g. pointer left the window). */
  clearPoint() {
    this.point = null;
    this.samples = [];
  }

  setEnabled(enabled) {
    this.enabled = enabled;
    if (!enabled) this.clearCurrent();
  }

  clearCurrent() {
    if (this.current) {
      this.current.classList.remove('gazing');
      this.current.style.removeProperty('--dwell');
    }
    this.current = null;
  }

  hitTest(x, y) {
    const el = document.elementFromPoint(x, y);
    const direct = el?.closest?.('[data-gaze]');
    if (direct && this.isAllowed(direct) && !direct.disabled) return direct;

    // Snap to the nearest allowed target within snapRadius.
    let best = null;
    let bestDist = this.snapRadius;
    for (const t of document.querySelectorAll('[data-gaze]')) {
      if (t.disabled || !this.isAllowed(t)) continue;
      const r = t.getBoundingClientRect();
      if (!r.width || !r.height) continue;
      const dx = Math.max(r.left - x, 0, x - r.right);
      const dy = Math.max(r.top - y, 0, y - r.bottom);
      const d = Math.hypot(dx, dy);
      if (d < bestDist) {
        bestDist = d;
        best = t;
      }
    }
    return best;
  }

  loop(now) {
    if (!this.running) return;
    requestAnimationFrame(this.loop);

    const fresh = this.point && now - this.lastPointAt < this.staleMs;
    if (this.dot) {
      this.dot.hidden = !fresh;
      if (fresh) this.dot.style.transform = `translate(${this.point.x}px, ${this.point.y}px)`;
    }
    if (!this.enabled) return;

    const hit = fresh ? this.hitTest(this.point.x, this.point.y) : null;

    if (hit && hit === this.current) {
      this.lastSeenAt = now;
    } else if (now - this.lastSeenAt > this.graceMs || !this.current) {
      // Switch target.
      this.clearCurrent();
      if (hit) {
        this.current = hit;
        this.startAt = now;
        this.lastSeenAt = now;
        hit.classList.add('gazing');
      }
    }

    if (!this.current) return;
    const progress = Math.max(0, Math.min(1, (now - this.startAt) / this.dwellMs));
    this.current.style.setProperty('--dwell', progress.toFixed(3));

    if (progress >= 1) {
      const target = this.current;
      target.classList.add('dwell-fired');
      setTimeout(() => target.classList.remove('dwell-fired'), 400);
      // Restart the timer after a cooldown so the same letter can be chosen
      // again (double letters) only by continuing to stare.
      this.startAt = now + this.cooldownMs;
      this.current.style.setProperty('--dwell', '0');
      this.onSelect(target);
    }
  }
}
