import { LANGUAGES, getLanguage } from './alphabets.js';
import { speak, unlockSpeech, isSpeechSupported, hasVoiceFor } from './speech.js';
import { EyeSource, PointerSource, DwellSelector } from './gaze.js';

const $ = (sel) => document.querySelector(sel);

// ---------- Persistent settings ----------
const SETTINGS_KEY = 'gaze-speller-settings';
const defaults = { langId: null, mode: 'eye', dwellMs: 1500, rate: 0.9, showDot: true, showCamera: false };
const settings = { ...defaults, ...safeParse(localStorage.getItem(SETTINGS_KEY)) };
function safeParse(s) {
  try {
    return JSON.parse(s) || {};
  } catch {
    return {};
  }
}
function saveSettings() {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

// ---------- State ----------
let language = getLanguage(settings.langId);
let word = []; // array of letters
let source = null; // EyeSource | PointerSource | null
let eye = null; // EyeSource instance (kept so calibration survives screen changes)
let calibrating = false;

const dwell = new DwellSelector({
  dot: $('#gaze-dot'),
  isAllowed: (el) => {
    const top = document.querySelector('.overlay.open') || document.querySelector('.screen.active');
    return !!top && top.contains(el);
  },
  onSelect: (el) => handleAction(el, { viaGaze: true }),
});
dwell.dwellMs = settings.dwellMs;

// ---------- Screens & overlays ----------
function showScreen(id) {
  document.querySelectorAll('.screen').forEach((s) => s.classList.toggle('active', s.id === id));
  document.body.classList.toggle('on-board', id === 'screen-board');
}
function openOverlay(id) {
  document.getElementById(id).classList.add('open');
}
function closeOverlay(id) {
  document.getElementById(id).classList.remove('open');
}

let toastTimer;
function toast(msg, ms = 3500) {
  const t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), ms);
}

// ---------- Language screen ----------
function renderLanguages() {
  const list = $('#language-list');
  list.innerHTML = '';
  for (const l of LANGUAGES) {
    const b = document.createElement('button');
    b.className = 'lang-btn key';
    b.dataset.action = 'pick-lang';
    b.dataset.lang = l.id;
    b.dataset.gaze = '';
    b.setAttribute('role', 'listitem');
    b.innerHTML = `<span class="native"></span><span class="english"></span><span class="sample"></span>`;
    b.querySelector('.native').textContent = l.nativeName;
    b.querySelector('.english').textContent = l.name;
    const sample = b.querySelector('.sample');
    sample.textContent = l.letters.slice(0, 3).join(' ');
    sample.dir = l.dir;
    if (l.id === settings.langId) b.style.borderColor = 'var(--accent)';
    list.appendChild(b);
  }
  const radio = document.querySelector(`input[name="mode"][value="${settings.mode}"]`);
  if (radio) radio.checked = true;
}

document.querySelectorAll('input[name="mode"]').forEach((r) =>
  r.addEventListener('change', () => {
    settings.mode = r.value;
    saveSettings();
  }),
);

async function pickLanguage(id) {
  unlockSpeech();
  language = getLanguage(id);
  settings.langId = id;
  saveSettings();
  document.documentElement.lang = language.lang;
  word = [];
  renderBoard();
  speak(language.nativeName, language.lang, { rate: settings.rate });

  if (isSpeechSupported() && !hasVoiceFor(language.lang)) {
    toast(`No ${language.name} voice is installed on this device. Letters may be read with another voice.`, 6000);
  }

  if (settings.mode === 'eye') {
    if (eye?.started) {
      eye.setVideoVisible(settings.showCamera);
      showScreen('screen-board');
      startDwell(eye);
    } else {
      await beginCalibration();
    }
  } else {
    stopEye();
    if (settings.mode === 'pointer') {
      if (!(source instanceof PointerSource)) {
        source?.stop();
        source = new PointerSource();
        source.onPoint((x, y) => dwell.feed(x, y));
        await source.start();
        document.addEventListener('pointerleave', () => dwell.clearPoint());
      }
      startDwell(source);
    } else {
      source?.stop();
      source = null;
      dwell.stop();
    }
    showScreen('screen-board');
  }
}

function startDwell(src) {
  source = src;
  dwell.staleMs = src instanceof PointerSource ? Infinity : 600;
  // A pointer stops emitting when still, so averaging would freeze on a stale mix.
  dwell.smoothing = src instanceof PointerSource ? 1 : 8;
  document.body.classList.toggle('hide-dot', !settings.showDot);
  dwell.setEnabled(true);
  dwell.start();
}

function stopEye() {
  if (eye) {
    eye.stop();
    eye = null;
  }
  if (source instanceof EyeSource) source = null;
  dwell.stop();
}

// ---------- Calibration ----------
async function beginCalibration() {
  showScreen('screen-calibrate');
  dwell.stop();
  $('#cal-setup').hidden = false;
  $('#cal-dot').hidden = true;
  $('#cal-progress').hidden = true;
  const status = $('#cal-status');
  const startBtn = $('#cal-start');
  startBtn.disabled = true;
  $('#cal-skip').hidden = true;
  status.textContent = 'Starting camera… allow camera access when asked.';

  try {
    if (!eye) {
      eye = new EyeSource();
      eye.onPoint((x, y) => {
        if (!calibrating) dwell.feed(x, y);
      });
    }
    await eye.start();
    eye.setVideoVisible(true);
    status.textContent = 'Camera ready. Line up your face, then press Start.';
    startBtn.disabled = false;
    // WebGazer keeps training data between visits; let returning users skip.
    $('#cal-skip').hidden = !localStorage.getItem('gaze-speller-calibrated');
  } catch (err) {
    console.error(err);
    status.textContent = `${err.message} You can tap letters instead.`;
    eye?.stop();
    eye = null;
  }
}

const CAL_POINTS = [
  [0.1, 0.1], [0.5, 0.1], [0.9, 0.1],
  [0.1, 0.5], [0.5, 0.5], [0.9, 0.5],
  [0.1, 0.9], [0.5, 0.9], [0.9, 0.9],
  // second pass on the centre and letter area for extra accuracy
  [0.3, 0.35], [0.7, 0.35], [0.3, 0.7], [0.7, 0.7],
];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function runCalibration() {
  if (!eye?.started) return;
  calibrating = true;
  eye.clearCalibration();
  eye.setVideoVisible(false);
  $('#cal-setup').hidden = true;
  const dot = $('#cal-dot');
  const progress = $('#cal-progress');
  dot.hidden = false;
  progress.hidden = false;

  const settleMs = 700;
  const sampleMs = 1300;
  const everyMs = 60;

  for (let i = 0; i < CAL_POINTS.length; i++) {
    const [fx, fy] = CAL_POINTS[i];
    const x = Math.round(fx * window.innerWidth);
    const y = Math.round(fy * window.innerHeight);
    dot.style.left = `${x}px`;
    dot.style.top = `${y}px`;
    dot.style.setProperty('--s', '1.3');
    progress.textContent = `Look at the dot (${i + 1} of ${CAL_POINTS.length})`;
    await sleep(settleMs);
    dot.style.setProperty('--s', '0.7');
    const end = performance.now() + sampleMs;
    while (performance.now() < end) {
      eye.train(x, y);
      await sleep(everyMs);
    }
  }

  dot.hidden = true;
  progress.hidden = true;
  calibrating = false;
  localStorage.setItem('gaze-speller-calibrated', '1');
  finishCalibration();
}

function finishCalibration() {
  eye.setVideoVisible(settings.showCamera);
  showScreen('screen-board');
  startDwell(eye);
  speak(language.ui.prompt, language.lang, { rate: settings.rate });
}

// ---------- Board ----------
function renderBoard() {
  $('#board-lang').textContent = language.nativeName;
  $('#board-prompt').textContent = language.ui.prompt;
  $('#read-btn span').textContent = language.ui.read;
  $('#confirm-title').textContent = language.ui.correct;
  const wordEl = $('#word');
  wordEl.dir = language.dir;
  wordEl.dataset.placeholder = '…';
  $('#confirm-word').dir = language.dir;

  const grid = $('#letter-grid');
  grid.innerHTML = '';
  grid.dir = language.dir;
  for (const letter of language.letters) {
    const b = document.createElement('button');
    b.className = 'letter key';
    b.dataset.gaze = '';
    b.dataset.action = 'letter';
    b.dataset.letter = letter;
    b.textContent = letter;
    b.setAttribute('aria-label', letter);
    grid.appendChild(b);
  }
  layoutGrid();
  renderWord();
}

/** Pick a column count that makes the letter keys as large as possible. */
function layoutGrid() {
  const grid = $('#letter-grid');
  const n = language.letters.length;
  const { width, height } = grid.getBoundingClientRect();
  if (!width || !height) return;
  const gap = 8;
  let best = { cols: 6, size: 0 };
  for (let cols = 3; cols <= 12; cols++) {
    const rows = Math.ceil(n / cols);
    const w = (width - gap * (cols - 1)) / cols;
    const h = (height - gap * (rows - 1)) / rows;
    const size = Math.min(w, h);
    if (size > best.size) best = { cols, size };
  }
  grid.style.setProperty('--cols', best.cols);
  grid.style.setProperty('--letter-size', `${Math.max(18, Math.round(best.size * 0.5))}px`);
}

function renderWord() {
  const el = $('#word');
  el.innerHTML = '';
  if (language.joined) {
    // Connected scripts (Arabic) must stay in one text run so letters join.
    if (word.length) {
      const s = document.createElement('span');
      s.textContent = word.join('');
      el.appendChild(s);
    }
    $('#read-btn').disabled = word.length === 0;
    return;
  }
  for (const ch of word) {
    const s = document.createElement('span');
    s.className = 'ch';
    s.textContent = ch;
    el.appendChild(s);
  }
  $('#read-btn').disabled = word.length === 0;
}

function flashLetter(letter) {
  const f = $('#letter-flash');
  f.textContent = letter;
  f.classList.remove('show');
  void f.offsetWidth; // restart animation
  f.classList.add('show');
}

function spokenWord() {
  // Speak lowercase so engines read a word instead of spelling an acronym.
  return word.join('').toLocaleLowerCase(language.lang);
}

function addLetter(letter) {
  word.push(letter);
  renderWord();
  flashLetter(letter);
  speak(letter, language.lang, { rate: settings.rate });
}

async function readWord() {
  if (!word.length) {
    speak(language.ui.prompt, language.lang, { rate: settings.rate });
    return;
  }
  $('#confirm-word').textContent = word.join('');
  $('#confirm-actions').hidden = false;
  $('#confirm-celebrate').hidden = true;
  openOverlay('confirm');
  // Give the student a moment before confirm buttons can be stared at.
  dwell.setEnabled(false);
  await speak(spokenWord(), language.lang, { rate: settings.rate * 0.9 });
  dwell.setEnabled(true);
}

async function confirmYes() {
  $('#confirm-actions').hidden = true;
  $('#confirm-celebrate').hidden = false;
  dwell.setEnabled(false);
  await sleep(1600);
  closeOverlay('confirm');
  word = [];
  renderWord();
  dwell.setEnabled(true);
}

// ---------- Settings ----------
function initSettingsUi() {
  const dwellIn = $('#dwell');
  const rateIn = $('#rate');
  dwellIn.value = (settings.dwellMs / 1000).toFixed(1);
  $('#dwell-out').textContent = dwellIn.value;
  rateIn.value = settings.rate;
  $('#rate-out').textContent = rateIn.value;
  $('#show-dot').checked = settings.showDot;
  $('#show-camera').checked = settings.showCamera;
  document.body.classList.toggle('hide-dot', !settings.showDot);

  dwellIn.addEventListener('input', () => {
    settings.dwellMs = Math.round(parseFloat(dwellIn.value) * 1000);
    dwell.dwellMs = settings.dwellMs;
    $('#dwell-out').textContent = dwellIn.value;
    saveSettings();
  });
  rateIn.addEventListener('input', () => {
    settings.rate = parseFloat(rateIn.value);
    $('#rate-out').textContent = rateIn.value;
    saveSettings();
  });
  $('#show-dot').addEventListener('change', (e) => {
    settings.showDot = e.target.checked;
    document.body.classList.toggle('hide-dot', !settings.showDot);
    saveSettings();
  });
  $('#show-camera').addEventListener('change', (e) => {
    settings.showCamera = e.target.checked;
    eye?.setVideoVisible(settings.showCamera);
    saveSettings();
  });
}

// ---------- Actions (shared by taps and gaze dwell) ----------
function handleAction(el, { viaGaze = false } = {}) {
  const action = el.dataset.action;
  switch (action) {
    case 'pick-lang':
      pickLanguage(el.dataset.lang);
      break;
    case 'letter':
      addLetter(el.dataset.letter);
      break;
    case 'delete':
      if (word.length) {
        word.pop();
        renderWord();
      }
      break;
    case 'clear':
      word = [];
      renderWord();
      break;
    case 'read':
      readWord();
      break;
    case 'confirm-again':
      speak(spokenWord(), language.lang, { rate: settings.rate * 0.9 });
      break;
    case 'confirm-yes':
      confirmYes();
      break;
    case 'confirm-no':
      closeOverlay('confirm');
      break;
    case 'back':
      closeOverlay('settings');
      renderLanguages();
      showScreen('screen-language');
      if (settings.mode !== 'eye') dwell.stop();
      break;
    case 'open-settings':
      openOverlay('settings');
      break;
    case 'close-settings':
      closeOverlay('settings');
      break;
    case 'recalibrate':
      closeOverlay('settings');
      settings.mode = 'eye';
      saveSettings();
      beginCalibration();
      break;
    case 'cal-start':
      runCalibration();
      break;
    case 'cal-skip':
      finishCalibration();
      break;
    case 'use-touch':
      settings.mode = 'touch';
      saveSettings();
      stopEye();
      showScreen('screen-board');
      break;
    default:
      return;
  }
  if (viaGaze && navigator.vibrate) navigator.vibrate(30);
}

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (el && !el.disabled) handleAction(el);
});

window.addEventListener('resize', () => requestAnimationFrame(layoutGrid));
window.addEventListener('orientationchange', () => setTimeout(layoutGrid, 300));
new ResizeObserver(() => layoutGrid()).observe($('#letter-grid'));

document.addEventListener('visibilitychange', () => {
  if (document.hidden) eye?.pause();
  else eye?.resume();
});

// ---------- PWA ----------
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch((e) => console.warn('SW registration failed', e));
  });
}

let deferredInstall = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredInstall = e;
  const hint = $('#install-hint');
  hint.hidden = false;
  hint.innerHTML = '';
  const btn = document.createElement('button');
  btn.className = 'btn';
  btn.textContent = '📲 Install app';
  btn.addEventListener('click', async () => {
    deferredInstall.prompt();
    await deferredInstall.userChoice;
    deferredInstall = null;
    hint.hidden = true;
  });
  hint.appendChild(btn);
});

const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
if (isIos && !standalone) {
  const hint = $('#install-hint');
  hint.hidden = false;
  hint.textContent = 'Tip: tap Share, then "Add to Home Screen" to install.';
}

// ---------- Boot ----------
renderLanguages();
initSettingsUi();
if (!isSpeechSupported()) toast('This browser cannot speak. Letters and words will only be shown.', 6000);
