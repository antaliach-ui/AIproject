// Thin wrapper around the Web Speech API (speechSynthesis).

const synth = typeof window !== 'undefined' ? window.speechSynthesis : null;
let voices = [];

function loadVoices() {
  if (!synth) return;
  voices = synth.getVoices();
}

if (synth) {
  loadVoices();
  synth.addEventListener?.('voiceschanged', loadVoices);
}

export function isSpeechSupported() {
  return !!synth && typeof SpeechSynthesisUtterance !== 'undefined';
}

function pickVoice(lang) {
  if (!voices.length) loadVoices();
  const lower = lang.toLowerCase();
  const base = lower.split('-')[0];
  return (
    voices.find((v) => v.lang.toLowerCase() === lower && v.localService) ||
    voices.find((v) => v.lang.toLowerCase() === lower) ||
    voices.find((v) => v.lang.toLowerCase().replace('_', '-').startsWith(base)) ||
    null
  );
}

export function hasVoiceFor(lang) {
  return !!pickVoice(lang);
}

/**
 * Speak text in the given language.
 * @param {string} text
 * @param {string} lang BCP-47 tag
 * @param {{rate?: number, interrupt?: boolean}} [opts]
 * @returns {Promise<void>} resolves when speech ends (or immediately if unsupported)
 */
export function speak(text, lang, { rate = 0.9, interrupt = true } = {}) {
  return new Promise((resolve) => {
    if (!isSpeechSupported() || !text) return resolve();
    if (interrupt) synth.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang;
    u.rate = rate;
    const voice = pickVoice(lang);
    if (voice) u.voice = voice;
    // Some browsers never fire onend; use a safety timeout.
    const timeout = setTimeout(resolve, 1500 + text.length * 250);
    const done = () => {
      clearTimeout(timeout);
      resolve();
    };
    u.onend = done;
    u.onerror = done;
    synth.speak(u);
  });
}

/** Call from a user gesture so iOS Safari allows later speech. */
export function unlockSpeech() {
  if (!isSpeechSupported()) return;
  const u = new SpeechSynthesisUtterance(' ');
  u.volume = 0;
  synth.speak(u);
}
