# Gaze Speller

A progressive web app for spelling words with your eyes. It works on phones, tablets, and computers.

## How it works

1. The student opens the app and sees a list of languages.
2. They choose one, and that language's alphabet appears.
3. They think of a word, then stare at each letter in turn. A letter is chosen after the stare time (1.5 s by default). While they stare, the key fills up yellow. When the letter is chosen, it appears large on screen, is added to the word, and the app says it out loud.
4. When all the letters are in, they press **Read my word**. The app reads the whole word out loud.
5. The student confirms with **Yes** (the word is cleared for the next one) or **No** (they go back and can fix it with ⌫). **Again** repeats the word. These buttons also work by staring.

To spell a double letter (like the "LL" in "ball"), keep staring at the same key. It is chosen again after another stare time.

### Ways to choose letters

| Mode | What it uses | Who it's for |
| --- | --- | --- |
| 👀 With my eyes | Front camera + [WebGazer.js](https://webgazer.cs.brown.edu/) eye tracking, then a 13-point look-only calibration | Students spelling by gaze |
| 🖱️ Hover and hold | Mouse, trackpad, or head-pointer moves the cursor; holding still on a key chooses it | Head-mouse users, and testing on a desktop |
| 👆 Tap letters | Plain taps | Helpers and students who can touch |

Calibration needs no taps. The student follows a dot with their eyes. Calibration data is saved on the device, so on the next visit they can press **Use saved calibration**.

### Languages

English, Spanish, French, German, Portuguese, Italian, Greek, Russian, Arabic (RTL, joined letters), and Hebrew (RTL). Add more in `js/alphabets.js`.

Speech uses the device's built-in text-to-speech (Web Speech API). If no voice is installed for the chosen language, the app shows a notice. On iOS and Android, extra voices can be added in the system settings. Words are spoken in lowercase so the engine reads the word instead of spelling it out like an acronym.

### Settings (⚙️)

Stare time (0.6–3 s), speaking speed, show/hide the gaze dot, show/hide the camera preview, recalibrate, and change language.

## Run it

It's static files with no build step. The camera only works on **HTTPS** (or `localhost`).

```bash
cd gaze-speller
npx serve .            # or: python3 -m http.server 8080
# open http://localhost:8080
```

To use it on a phone, deploy the folder to any HTTPS static host (GitHub Pages, Netlify, Cloudflare Pages, Vercel). Then open it on the phone and install it:
- **Android / Chrome**: use the "📲 Install app" button or the browser menu → *Install app*.
- **iPhone / iPad (Safari)**: Share → *Add to Home Screen*.

## Offline

`sw.js` caches the app shell when it installs. It also caches the WebGazer script and its face-model files the first time eye tracking loads. After one online session with eye mode, the app works offline. Tap and hover modes work offline right away.

## Files

```
index.html             screens: language → calibration → board, plus confirm/settings overlays
css/styles.css         mobile-first layout, dwell progress fill, animations
js/app.js              app flow, board rendering, actions, settings, PWA install
js/alphabets.js        languages, alphabets, translated prompts
js/gaze.js             EyeSource (WebGazer), PointerSource, DwellSelector
js/speech.js           speechSynthesis wrapper with voice picking
sw.js                  service worker (offline caching)
manifest.webmanifest   PWA manifest
icons/                 SVG + generated PNG icons (node scripts/make-icons.mjs)
```

## Limitations

- Webcam eye tracking is far less precise than a dedicated eye tracker. Expect roughly 100–200 px of error, and more on small phone screens or in poor light. The keys are as large as the screen allows, a gaze that lands in a gap snaps to the nearest key, and short glances away are ignored. Even so, results are best on a tablet in landscape with the device held still (a stand helps). Recalibrate if the dot drifts.
- WebGazer is licensed under GPLv3. Check that this fits how you plan to distribute the app; Brown University offers a commercial license.
