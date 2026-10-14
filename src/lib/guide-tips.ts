// The guide's registry: every tip and tour of the Roleplay app. Data only; the logic is
// in guide.ts. A tip's `target` is a `data-guide` attribute somewhere in the UI.
// A new feature that users decide with gets a tip here with `since` = the release that
// ships it, so What's new points it out once.

import type { Tip, Tour } from './guide'

/** This build's version: keep equal to manifest.json (a test checks it). */
export const APP_VERSION = '4.46.0'

export const TIPS: Tip[] = [
  // What's new
  {
    id: 'new.prompt-board',
    since: '4.44.0',
    target: 'canvas.board-prompt',
    open: { view: 'canvas', board: 'links' },
    title: { en: 'Prompt board', uk: 'Полотно промпта' },
    body: {
      en: 'See every part of a chat’s request to the model with its tokens, and switch parts off for that chat only. The preset and the card stay as they are.',
      uk: 'Усі частини запиту чату до моделі з токенами. Будь-яку частину можна вимкнути лише для цього чату: пресет і картка не змінюються.',
    },
  },
  {
    id: 'new.history-filter',
    since: '4.44.0',
    target: 'prompt.history',
    open: { view: 'canvas', board: 'prompt' },
    title: { en: 'History filter', uk: 'Фільтр історії' },
    body: {
      en: 'On the Chat history card: send only the last messages, only yours or only the character’s, and leave out thinking blocks.',
      uk: 'На картці «Історія чату»: надсилати лише останні повідомлення, лише ваші чи лише персонажа, і без блоків роздумів.',
    },
  },
  {
    id: 'new.links-shelf',
    since: '4.44.0',
    target: 'canvas.shelf',
    open: { view: 'canvas', board: 'links' },
    title: { en: 'Chats beside the board', uk: 'Чати біля полотна' },
    body: {
      en: 'The links board starts empty. Drag a chat from this list onto it, or put it there with all its linked chats.',
      uk: 'Полотно зв’язків починається порожнім. Перетягніть чат із цього списку або додайте його разом з усіма пов’язаними чатами.',
    },
  },
  {
    id: 'new.quick-moves',
    since: '4.45.0',
    target: 'composer.options',
    open: { view: 'chat' },
    title: { en: 'Quick moves', uk: 'Швидкі дії' },
    body: {
      en: 'Once a draft wraps, Continue, Write for me and Another sit right under it, with a button for the big editor. The same moves are always in this + menu (Continue, Impersonate, Regenerate).',
      uk: 'Коли чернетка переноситься на новий рядок, під нею з’являються Continue, Write for me та Another і кнопка великого редактора. Ті самі дії завжди є в меню + (Continue, Impersonate, Regenerate).',
    },
  },
  {
    id: 'new.guide',
    since: '4.46.0',
    target: 'nav.settings',
    open: { view: 'settings' },
    title: { en: 'Tours', uk: 'Тури' },
    body: {
      en: 'The first time you open a section, a short tour shows what is there. Turn tours off or play them again in Settings, Guide.',
      uk: 'Коли ви вперше відкриваєте розділ, короткий тур показує, що в ньому є. Вимкнути тури чи пройти їх знову можна в Налаштуваннях, розділ «Гайд».',
    },
  },

  // Canvas, chat links
  {
    id: 'tour.canvas.boards',
    target: 'canvas.boards',
    title: { en: 'Two boards', uk: 'Два полотна' },
    body: {
      en: 'Chat links shows which chat continues which. Prompt shows what one chat sends to the model.',
      uk: 'Зв’язки чатів показують, який чат продовжує який. Промпт показує, що один чат надсилає моделі.',
    },
  },
  {
    id: 'tour.canvas.shelf',
    target: 'canvas.shelf',
    title: { en: 'Your chats', uk: 'Ваші чати' },
    body: {
      en: 'Chats not on the board wait here. Drag one onto the board, or use + to put it there.',
      uk: 'Тут чати, яких ще немає на полотні. Перетягніть чат на полотно або натисніть +.',
    },
  },
  {
    id: 'tour.canvas.board',
    target: 'canvas.board',
    title: { en: 'Link chats', uk: 'Зв’язуйте чати' },
    body: {
      en: 'Drag a wire from one chat’s bottom dot to another’s top dot: the second continues the first and gets the earlier story as backstory. Dashed wires are branches forked from a message.',
      uk: 'Протягніть дріт від нижньої точки одного чату до верхньої точки іншого: другий продовжить перший і отримає попередню історію як передісторію. Пунктир означає гілки, відкладені від повідомлення.',
    },
  },
  {
    id: 'tour.canvas.mode',
    target: 'canvas.mode',
    title: { en: 'Edit or view', uk: 'Редагувати чи переглядати' },
    body: {
      en: 'View mode only looks: nothing moves by accident. On a phone, the List lets you pick what each chat continues.',
      uk: 'У режимі перегляду нічого не зсунеться випадково. На телефоні у Списку можна вибрати, що продовжує кожен чат.',
    },
  },

  // Canvas, prompt
  {
    id: 'tour.prompt.chat',
    target: 'prompt.chat',
    title: { en: 'Pick a chat', uk: 'Виберіть чат' },
    body: {
      en: 'The board shows what this chat sends to the model with its next reply.',
      uk: 'Полотно показує, що цей чат надішле моделі з наступною відповіддю.',
    },
  },
  {
    id: 'tour.prompt.part',
    target: 'prompt.part',
    title: { en: 'Parts of the request', uk: 'Частини запиту' },
    body: {
      en: 'Each card is one part: preset sections, card fields, persona, lorebooks, history. The switch turns it off for this chat only.',
      uk: 'Кожна картка — одна частина: розділи пресету, поля картки, персона, лорбуки, історія. Перемикач вимикає її лише для цього чату.',
    },
  },
  {
    id: 'tour.prompt.total',
    target: 'prompt.total',
    title: { en: 'What the model gets', uk: 'Що отримає модель' },
    body: {
      en: 'Everything that stays on, in order, with the total tokens. Useful on small context windows.',
      uk: 'Усе ввімкнене, по порядку, і загальна кількість токенів. Корисно для моделей із малим контекстом.',
    },
  },
  {
    id: 'tour.prompt.details',
    target: 'prompt.details',
    title: { en: 'Why it is there', uk: 'Чому це там' },
    body: {
      en: 'Details list what was taken and why something was left out, and show the text itself.',
      uk: 'Деталі показують, що взято, чому щось пропущено, і сам текст.',
    },
  },

  // Composer
  {
    id: 'tour.composer.input',
    target: 'composer.input',
    title: { en: 'Your turn', uk: 'Ваш хід' },
    body: {
      en: 'Write what your character says or does. Type / for commands and shortcuts.',
      uk: 'Напишіть, що каже чи робить ваш персонаж. Введіть / для команд і швидких відповідей.',
    },
  },
  {
    id: 'tour.composer.options',
    target: 'composer.options',
    title: { en: 'More moves', uk: 'Більше дій' },
    body: {
      en: 'Regenerate or continue the last reply, let the model write your message (Impersonate), open the big editor, send an image.',
      uk: 'Перегенерувати чи продовжити останню відповідь, доручити моделі ваше повідомлення (Impersonate), відкрити великий редактор, надіслати зображення.',
    },
  },
  {
    id: 'tour.composer.send',
    target: 'composer.send',
    title: { en: 'Send', uk: 'Надіслати' },
    body: {
      en: 'While a reply is being written, this button stops it.',
      uk: 'Поки відповідь пишеться, ця кнопка її зупиняє.',
    },
  },
]

export const TOURS: Tour[] = [
  {
    id: 'canvas.links',
    place: 'canvas.links',
    steps: ['tour.canvas.boards', 'tour.canvas.shelf', 'tour.canvas.board', 'tour.canvas.mode'],
  },
  {
    id: 'canvas.prompt',
    place: 'canvas.prompt',
    steps: ['tour.prompt.chat', 'tour.prompt.part', 'tour.prompt.total', 'tour.prompt.details'],
  },
  {
    id: 'composer',
    place: 'chat',
    steps: ['tour.composer.input', 'tour.composer.options', 'tour.composer.send'],
  },
]
