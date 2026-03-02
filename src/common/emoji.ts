/* TYPES */

type EmojiEntry = { shortcode: string, emoji?: string };

/* DATA */

const SHORTCODES: Record<string, string> = {
  '+1': '👍',
  '-1': '👎',
  100: '💯',
  1234: '🔢',
  '8ball': '🎱',
  alien: '👽',
  ambulance: '🚑',
  angry: '😠',
  anguished: '😧',
  apple: '🍎',
  arrow_backward: '◀️',
  arrow_double_down: '⏬',
  arrow_double_up: '⏫',
  arrow_down: '⬇️',
  arrow_down_small: '🔽',
  arrow_forward: '▶️',
  arrow_left: '⬅️',
  arrow_lower_left: '↙️',
  arrow_lower_right: '↘️',
  arrow_right: '➡️',
  arrow_up: '⬆️',
  arrow_up_down: '↕️',
  arrow_up_small: '🔼',
  arrow_upper_left: '↖️',
  arrow_upper_right: '↗️',
  astonished: '😲',
  avocado: '🥑',
  baby: '👶',
  ballot_box_with_check: '☑️',
  banana: '🍌',
  bangbang: '‼️',
  battery: '🔋',
  beer: '🍺',
  bell: '🔔',
  birthday: '🎂',
  blush: '😊',
  boom: '💥',
  bread: '🍞',
  broken_heart: '💔',
  bug: '🐛',
  bulb: '💡',
  calendar: '📅',
  camera: '📷',
  candy: '🍬',
  cat: '🐱',
  checkered_flag: '🏁',
  cherries: '🍒',
  chestnut: '🌰',
  clap: '👏',
  clinking_glasses: '🥂',
  closed_lock_with_key: '🔐',
  cloud: '☁️',
  coffee: '☕',
  confetti_ball: '🎊',
  confused: '😕',
  construction: '🚧',
  cookie: '🍪',
  cry: '😢',
  crystal_ball: '🔮',
  dancing_women: '👯',
  dart: '🎯',
  dash: '💨',
  diamonds: '♦️',
  disappointed: '😞',
  dizzy: '💫',
  dizzy_face: '😵',
  dog: '🐶',
  droplet: '💧',
  earth_africa: '🌍',
  earth_americas: '🌎',
  earth_asia: '🌏',
  egg: '🥚',
  envelope: '✉️',
  euro: '💶',
  exploding_head: '🤯',
  eyes: '👀',
  face_with_cowboy_hat: '🤠',
  facepalm: '🤦',
  feather: '🪶',
  file_folder: '📁',
  fire: '🔥',
  fist: '✊',
  flag_us: '🇺🇸',
  flash_on: '📸',
  floppy_disk: '💾',
  flower_playing_cards: '🎴',
  flushed: '😳',
  four_leaf_clover: '🍀',
  frog: '🐸',
  gem: '💎',
  ghost: '👻',
  gift: '🎁',
  globe_with_meridians: '🌐',
  grape: '🍇',
  green_circle: '🟢',
  green_heart: '💚',
  grin: '😁',
  grinning: '😀',
  guitar: '🎸',
  hammer: '🔨',
  hammer_and_wrench: '🛠️',
  handshake: '🤝',
  heart: '❤️',
  heartbeat: '💓',
  heartpulse: '💗',
  heart_eyes: '😍',
  hibiscus: '🌺',
  heavy_check_mark: '✔️',
  honey_pot: '🍯',
  hourglass: '⌛',
  hourglass_flowing_sand: '⏳',
  hushed: '😯',
  icecream: '🍦',
  information_source: 'ℹ️',
  interrobang: '⁉️',
  jack_o_lantern: '🎃',
  key: '🔑',
  keyboard: '⌨️',
  kiwi_fruit: '🥝',
  laptop: '💻',
  joy: '😂',
  keycap_ten: '🔟',
  lemon: '🍋',
  lightning: '⚡',
  lips: '👄',
  lipstick: '💄',
  kissing_heart: '😘',
  laugh: '😆',
  laughing: '😆',
  lock: '🔒',
  loudspeaker: '📢',
  magnet: '🧲',
  mail: '📫',
  mask: '😷',
  memo: '📝',
  microphone: '🎤',
  microscope: '🔬',
  money_mouth_face: '🤑',
  moneybag: '💰',
  moon: '🌙',
  muscle: '💪',
  mushroom: '🍄',
  musical_note: '🎵',
  nail_care: '💅',
  no_entry_sign: '🚫',
  notebook: '📓',
  notes: '🎶',
  ok: '🆗',
  ok_hand: '👌',
  orange: '🍊',
  orange_circle: '🟠',
  orange_heart: '🧡',
  open_hands: '👐',
  package: '📦',
  page_facing_up: '📄',
  palm_tree: '🌴',
  panda_face: '🐼',
  pencil: '📝',
  penguin: '🐧',
  phone: '☎️',
  pizza: '🍕',
  point_down: '👇',
  point_left: '👈',
  point_right: '👉',
  point_up: '☝️',
  poop: '💩',
  popcorn: '🍿',
  pray: '🙏',
  purple_heart: '💜',
  question: '❓',
  question_mark: '❓',
  rabbit: '🐰',
  rainbow: '🌈',
  raised_hands: '🙌',
  recycle: '♻️',
  relieved: '😌',
  repeat: '🔁',
  grey_question: '❔',
  grey_exclamation: '❕',
  exclamation: '❗',
  ring: '💍',
  red_circle: '🔴',
  revolving_hearts: '💞',
  rocket: '🚀',
  rose: '🌹',
  satellite: '📡',
  see_no_evil: '🙈',
  screaming: '😱',
  seedling: '🌱',
  shamrock: '☘️',
  shield: '🛡️',
  ship: '🚢',
  skull: '💀',
  sleepy: '😪',
  smile: '😄',
  smiley: '😃',
  smiley_cat: '😺',
  snowflake: '❄️',
  soccer: '⚽',
  sob: '😭',
  spaceship: '🚀',
  sparkle: '❇️',
  sparkles: '✨',
  spiral_notepad: '🗒️',
  star2: '🌟',
  star: '⭐',
  strawberry: '🍓',
  sun_with_face: '🌞',
  sunglasses: '😎',
  sunrise: '🌅',
  tada: '🎉',
  tangerine: '🍊',
  thinking: '🤔',
  ticket: '🎫',
  toilet: '🚽',
  tomato: '🍅',
  tools: '🛠️',
  trash: '🗑️',
  thumbsdown: '👎',
  thumbsup: '👍',
  tadaa: '🎉',
  triumph: '😤',
  trophy: '🏆',
  turtle: '🐢',
  unicorn: '🦄',
  unlock: '🔓',
  up: '🆙',
  vampire: '🧛',
  violin: '🎻',
  warning: '⚠️',
  wave: '👋',
  watermelon: '🍉',
  white_check_mark: '✅',
  white_circle: '⚪',
  white_heart: '🤍',
  wind_chime: '🎐',
  wink: '😉',
  woman_technologist: '👩‍💻',
  worried: '😟',
  x: '❌',
  yellow_circle: '🟡',
  yellow_heart: '💛',
  yell: '🗣️',
  zzz: '💤'
};

const GITHUB_ONLY_SHORTCODES = [
  'accessibility',
  'atom',
  'basecamp',
  'basecampy',
  'bowtie',
  'copilot',
  'dependabot',
  'electron',
  'feelsgood',
  'fishsticks',
  'finnadie',
  'fu',
  'goberserk',
  'godmode',
  'hurtrealbad',
  'metal',
  'neckbeard',
  'octocat',
  'rage1',
  'rage2',
  'rage3',
  'rage4',
  'shipit',
  'suspect',
  'trollface'
];

let cachedEntries: EmojiEntry[] | undefined;
let cachedLookup: Record<string, EmojiEntry> | undefined;

/* HELPERS */

const getGemojiEntries = (): EmojiEntry[] => {

  try {
    const moduleExports = require ( 'gemoji' ),
          entries = moduleExports?.gemoji || moduleExports?.default || moduleExports;

    if ( !Array.isArray ( entries ) ) return [];

    const normalized: EmojiEntry[] = [];

    for ( let index = 0, length = entries.length; index < length; index++ ) {
      const entry = entries[index],
            names = Array.isArray ( entry?.names ) ? entry.names : [];

      for ( let nameIndex = 0, namesLength = names.length; nameIndex < namesLength; nameIndex++ ) {
        const shortcode = String ( names[nameIndex] || '' ).trim ().toLowerCase ();

        if ( !shortcode ) continue;

        normalized.push ({
          shortcode,
          emoji: entry?.emoji ? String ( entry.emoji ) : undefined
        });
      }
    }

    return normalized;
  } catch ( error ) {
    return [];
  }

};

const getEntries = (): EmojiEntry[] => {

  if ( cachedEntries ) return cachedEntries;

  const lookup: Record<string, EmojiEntry> = {};

  Object.keys ( SHORTCODES ).forEach ( shortcode => {
    const normalizedShortcode = shortcode.toLowerCase ();

    lookup[normalizedShortcode] = {
      shortcode: normalizedShortcode,
      emoji: SHORTCODES[shortcode]
    };
  });

  GITHUB_ONLY_SHORTCODES.forEach ( shortcode => {
    const normalizedShortcode = shortcode.toLowerCase ();

    if ( lookup[normalizedShortcode] ) return;

    lookup[normalizedShortcode] = {
      shortcode: normalizedShortcode
    };
  });

  getGemojiEntries ().forEach ( entry => {
    lookup[entry.shortcode] = entry;
  });

  cachedLookup = lookup;
  cachedEntries = Object.keys ( lookup )
    .sort ()
    .map ( shortcode => lookup[shortcode] );

  return cachedEntries;

};

const getLookup = (): Record<string, EmojiEntry> => {

  if ( cachedLookup ) return cachedLookup;

  getEntries ();

  return cachedLookup || {};

};

/* EMOJI */

const Emoji = {

  get ( shortcode: string ): string | undefined {

    return getLookup ()[String ( shortcode || '' ).toLowerCase ()]?.emoji;

  },

  replaceShortcodes ( text: string, shouldSkip?: ( index: number, content: string ) => boolean ): string {

    return text.replace ( /:([a-z0-9_+\-]+):/gi, ( match, shortcode, index, content ) => {
      if ( shouldSkip && shouldSkip ( index, content ) ) return match;

      return Emoji.get ( shortcode ) || match;
    });

  },

  getSuggestions ( query: string = '', limit: number = 25 ): EmojiEntry[] {

    const normalizedQuery = String ( query || '' ).toLowerCase (),
          entries = getEntries (),
          startsWithMatches = entries.filter ( entry => entry.shortcode.startsWith ( normalizedQuery ) ),
          includesMatches = normalizedQuery ? entries.filter ( entry => !entry.shortcode.startsWith ( normalizedQuery ) && entry.shortcode.includes ( normalizedQuery ) ) : [];

    return startsWithMatches.concat ( includesMatches ).slice ( 0, Math.max ( 0, limit ) );

  },

  getAllShortcodes (): string[] {

    return getEntries ().map ( entry => entry.shortcode );

  }

};

/* EXPORT */

export default Emoji;
