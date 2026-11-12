// Alphabet definitions per language.
// `lang` is the BCP-47 tag used for speech synthesis.
// `dir` is the text direction used for the spelled word.

const LATIN = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

export const LANGUAGES = [
  {
    id: 'en',
    name: 'English',
    nativeName: 'English',
    lang: 'en-US',
    dir: 'ltr',
    letters: LATIN,
    ui: { prompt: 'Look at a letter to choose it', read: 'Read my word', correct: 'Is this your word?' },
  },
  {
    id: 'es',
    name: 'Spanish',
    nativeName: 'Español',
    lang: 'es-ES',
    dir: 'ltr',
    letters: [...'ABCDEFGHIJKLMN'.split(''), 'Ñ', ...'OPQRSTUVWXYZ'.split('')],
    ui: { prompt: 'Mira una letra para elegirla', read: 'Leer mi palabra', correct: '¿Es tu palabra?' },
  },
  {
    id: 'fr',
    name: 'French',
    nativeName: 'Français',
    lang: 'fr-FR',
    dir: 'ltr',
    letters: [...LATIN, 'É', 'È', 'Ê', 'À', 'Ç'],
    ui: { prompt: 'Regarde une lettre pour la choisir', read: 'Lire mon mot', correct: 'Est-ce ton mot ?' },
  },
  {
    id: 'de',
    name: 'German',
    nativeName: 'Deutsch',
    lang: 'de-DE',
    dir: 'ltr',
    letters: [...LATIN, 'Ä', 'Ö', 'Ü', 'ß'],
    ui: { prompt: 'Schau auf einen Buchstaben', read: 'Wort vorlesen', correct: 'Ist das dein Wort?' },
  },
  {
    id: 'pt',
    name: 'Portuguese',
    nativeName: 'Português',
    lang: 'pt-BR',
    dir: 'ltr',
    letters: [...LATIN, 'Á', 'Â', 'Ã', 'Ç', 'É', 'Ê', 'Í', 'Ó', 'Õ', 'Ú'],
    ui: { prompt: 'Olhe para uma letra para escolher', read: 'Ler minha palavra', correct: 'Esta é a sua palavra?' },
  },
  {
    id: 'it',
    name: 'Italian',
    nativeName: 'Italiano',
    lang: 'it-IT',
    dir: 'ltr',
    letters: [...LATIN, 'À', 'È', 'Ì', 'Ò', 'Ù'],
    ui: { prompt: 'Guarda una lettera per sceglierla', read: 'Leggi la mia parola', correct: 'È la tua parola?' },
  },
  {
    id: 'el',
    name: 'Greek',
    nativeName: 'Ελληνικά',
    lang: 'el-GR',
    dir: 'ltr',
    letters: 'ΑΒΓΔΕΖΗΘΙΚΛΜΝΞΟΠΡΣΤΥΦΧΨΩ'.split(''),
    ui: { prompt: 'Κοίτα ένα γράμμα για να το διαλέξεις', read: 'Διάβασε τη λέξη μου', correct: 'Είναι αυτή η λέξη σου;' },
  },
  {
    id: 'ru',
    name: 'Russian',
    nativeName: 'Русский',
    lang: 'ru-RU',
    dir: 'ltr',
    letters: 'АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯ'.split(''),
    ui: { prompt: 'Посмотри на букву, чтобы выбрать её', read: 'Прочитай моё слово', correct: 'Это твоё слово?' },
  },
  {
    id: 'ar',
    name: 'Arabic',
    nativeName: 'العربية',
    lang: 'ar-SA',
    dir: 'rtl',
    joined: true,
    letters: 'ابتثجحخدذرزسشصضطظعغفقكلمنهوي'.split(''),
    ui: { prompt: 'انظر إلى حرف لاختياره', read: 'اقرأ كلمتي', correct: 'هل هذه كلمتك؟' },
  },
  {
    id: 'he',
    name: 'Hebrew',
    nativeName: 'עברית',
    lang: 'he-IL',
    dir: 'rtl',
    letters: 'אבגדהוזחטיכלמנסעפצקרשת'.split(''),
    ui: { prompt: 'הסתכל על אות כדי לבחור אותה', read: 'הקרא את המילה שלי', correct: 'זו המילה שלך?' },
  },
];

export function getLanguage(id) {
  return LANGUAGES.find((l) => l.id === id) || LANGUAGES[0];
}
