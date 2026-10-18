// The guide's registry: every tip and tour of the Roleplay app. Data only; the logic is
// in guide.ts. A tip's `target` is a `data-guide` attribute somewhere in the UI.
// A new feature that users decide with gets a tip here with `since` = the release that
// ships it, so What's new points it out once.

import type { Tip, Tour } from './guide'

/** This build's version: keep equal to manifest.json (a test checks it). */
export const APP_VERSION = '4.53.0'

export const TIPS: Tip[] = [
  // What's new
  {
    id: 'new.prompt-board',
    since: '4.44.0',
    target: 'canvas.board-prompt',
    open: { view: 'canvas', board: 'links' },
    help: 'canvas',
    keywords: { en: 'prompt context tokens request preset what is sent', uk: 'промпт контекст токени запит пресет що надсилається' },
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
    help: 'canvas',
    keywords: { en: 'history last messages context limit thinking reasoning', uk: 'історія останні повідомлення контекст обмеження роздуми' },
    title: { en: 'History filter', uk: 'Фільтр історії' },
    body: {
      en: 'Select the Chat history card, then in Details choose: only the last N messages, whose messages (everyone’s, only the player’s, only the character’s), and whether to send thinking blocks. Desktop only.',
      uk: 'Виберіть картку «Історія чату», потім у «Деталях» оберіть: лише останні N повідомлень, чиї повідомлення (усіх, лише гравця чи лише персонажа) і чи надсилати блоки роздумів. Лише на комп’ютері.',
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
    help: 'chat',
    keywords: { en: 'continue impersonate regenerate write for me another', uk: 'продовжити імперсонація перегенерувати написати за мене ще' },
    title: { en: 'Quick moves', uk: 'Швидкі дії' },
    body: {
      en: 'Once a draft wraps, Continue, Write for me and Another sit right under it, with a button for the big editor (on a phone only Write for me and the big editor). The same moves are always in this + menu (Continue, Impersonate, Regenerate).',
      uk: 'Коли чернетка переноситься на новий рядок, під нею з’являються Continue, Write for me та Another і кнопка великого редактора (на телефоні лише Write for me і великий редактор). Ті самі дії завжди є в меню + (Continue, Impersonate, Regenerate).',
    },
  },
  {
    id: 'new.guide',
    since: '4.46.0',
    target: 'nav.settings',
    open: { view: 'settings' },
    help: 'help',
    keywords: { en: 'guide tutorial walkthrough replay what is new', uk: 'гайд підказки навчання повторити що нового' },
    title: { en: 'Tours', uk: 'Тури' },
    body: {
      en: 'The first time you open a section, a short tour shows what is there. Turn tours off or play them again in Settings, Guide.',
      uk: 'Коли ви вперше відкриваєте розділ, короткий тур показує, що в ньому є. Вимкнути тури чи пройти їх знову можна в Налаштуваннях, розділ «Гайд».',
    },
  },

  {
    // The report form is the shell's, outside this frame: no element to point at. The
    // shell's own tour (guide step 3) highlights it.
    id: 'new.report-bug',
    since: '4.46.0',
    help: 'help',
    keywords: { en: 'bug problem error broken crash feedback issue', uk: 'баг помилка проблема зламалось збій відгук' },
    title: { en: 'Something broke?', uk: 'Щось зламалося?' },
    body: {
      en: 'Report a bug is in the account menu (top right) and at the bottom of the start page where you pick an app. With “Ask Molfar first” in it, Molfar looks for the cause and tries a fix you can test; a fix that works can go to GitHub when you send it.',
      uk: '«Повідомити про помилку» є в меню облікового запису (праворуч угорі) і внизу стартової сторінки, де вибирають застосунок. Кнопка «Спершу спитайте Мольфара» там передає опис Мольфару: він шукає причину й пробує виправлення, яке ви перевіряєте; робоче виправлення можна надіслати на GitHub.',
    },
  },

  // Canvas, chat links
  {
    id: 'tour.canvas.boards',
    target: 'canvas.boards',
    title: { en: 'Two boards', uk: 'Два полотна' },
    body: {
      en: 'Chat links shows which chat continues which. Prompt shows what one chat sends to the model. On a phone, the List lets you pick what each chat continues.',
      uk: 'Зв’язки чатів показують, який чат продовжує який. Промпт показує, що один чат надсилає моделі. На телефоні у Списку можна вибрати, що продовжує кожен чат.',
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
    open: { view: 'canvas', board: 'links' },
    help: 'canvas',
    keywords: { en: 'link chats continue backstory sequel branch wire', uk: 'зв’язати чати продовження передісторія гілка' },
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
      en: 'View mode only looks: nothing moves by accident.',
      uk: 'У режимі перегляду нічого не зсунеться випадково.',
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
    open: { view: 'canvas', board: 'prompt' },
    help: 'canvas',
    keywords: { en: 'switch off part section card persona lorebook history', uk: 'вимкнути частина розділ картка персона лорбук історія' },
    title: { en: 'Parts of the request', uk: 'Частини запиту' },
    body: {
      en: 'Each card is one part: preset sections, card fields, persona, lorebooks. Most have a switch that turns the part off for this chat only. History has no switch (filter it in Details), and parts the preset or a condition already leaves out have none.',
      uk: 'Кожна картка — одна частина: розділи пресету, поля картки, персона, лорбуки. Більшість має перемикач, що вимикає частину лише для цього чату. В «Історії» перемикача немає (її фільтрують у деталях), як і в частин, які пресет чи умова вже виключили.',
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
      en: 'Press this to send. While a reply is being written, the same spot becomes a stop button.',
      uk: 'Натисніть, щоб надіслати. Поки відповідь пишеться, це місце стає кнопкою зупинки.',
    },
  },
  // ── What's new: World DM (#52)
  {
    id: 'new.world-dm',
    since: '4.53.0',
    target: 'menu.tools',
    open: { view: 'chat', panel: 'chat-menu' },
    title: { en: 'A game master for the world', uk: 'Майстер гри для світу' },
    body: {
      en: 'Chat menu → World DM: pick a level. Chronicler keeps the story’s people and places in the chat’s own lorebook; from Living world up the world moves and events reach the next reply. Off by default.',
      uk: 'Меню чату → «Майстер світу»: оберіть рівень. «Літописець» записує людей і місця історії у власний лорбук чату; від «Живого світу» світ рухається, а події потрапляють у наступну відповідь. Типово вимкнений.',
    },
  },
  // ── What's new: the inbox
  {
    id: 'new.inbox',
    since: '4.52.0',
    target: 'nav.inbox',
    open: { view: 'home' },
    title: { en: 'Everything waiting on you, in one place', uk: 'Усе, що чекає на вас, в одному місці' },
    body: {
      en: 'Inbox lists the chats with Library suggestions and the cards with proposed souls. Click a row to decide there. On a phone it is the first row under More.',
      uk: 'Вхідні показують чати з пропозиціями Бібліотеки та картки із запропонованими душами. Натисніть рядок, щоб вирішити на місці. На телефоні це перший рядок у «More».',
    },
  },
  // ── What's new: a Profile for every character of a narrator card
  {
    id: 'new.profile-cast',
    since: '4.51.0',
    target: 'characters.title',
    open: { view: 'characters', list: 'characters' },
    title: { en: 'Several characters in one Profile', uk: 'Кілька персонажів в одному Профілі' },
    body: {
      en: 'Open a card → Profile → Add character: a narrator card can describe its whole cast, each with the same fields. Description and Personality get one part per character.',
      uk: 'Відкрийте картку → Профіль → Add character: картка оповідача може описати всю свою трупу, кожного з тими самими полями. Опис і Особистість отримують окрему частину на кожного.',
    },
  },
  // ── What's new: image prompts as tags
  {
    id: 'new.image-prompt-style',
    since: '4.50.0',
    target: 'nav.extensions',
    open: { view: 'home' },
    title: { en: 'Image prompts as tags', uk: 'Промпти картинок тегами' },
    body: {
      en: 'Tools → Image Generation → Prompt style: models on ComfyUI or Forge now get Danbooru tags instead of a paragraph. Auto picks by the model; you can choose yourself.',
      uk: 'Інструменти → Image Generation → Prompt style: моделі на ComfyUI чи Forge тепер отримують теги Danbooru замість абзацу. Auto обирає за моделлю, можна обрати й самому.',
    },
  },
  // ── What's new: Molfar and option hints
  {
    id: 'new.molfar',
    since: '4.48.0',
    target: 'nav.presets',
    open: { view: 'home' },
    title: { en: 'A second built-in preset: Molfar', uk: 'Другий вбудований пресет: Molfar' },
    body: {
      en: 'Molfar sits next to FRANKENX in Presets: pick it for a chat and set its options in Choices. Every option of both now says what it does.',
      uk: 'Molfar стоїть поруч із FRANKENX у Пресетах: оберіть його для чату й налаштуйте у «Вибір». Кожен варіант обох тепер пояснює, що робить.',
    },
  },
  // ── What's new: the help list itself
  {
    id: 'new.help',
    since: '4.47.0',
    target: 'nav.help',
    open: { view: 'home' },
    title: { en: 'Help', uk: 'Довідка' },
    body: {
      en: 'The ? in the menu opens short answers about what the app can do. Search it, and press Show me to see the place.',
      uk: 'Знак ? у меню відкриває короткі відповіді про те, що вміє застосунок. Шукайте в ньому й натискайте «Показати», щоб побачити місце.',
    },
  },

  // ── Help list: in a chat
  {
    id: 'help.swipes',
    target: 'chat.swipes',
    open: { view: 'chat' },
    help: 'chat',
    title: { en: 'Other versions of a reply', uk: 'Інші варіанти відповіді' },
    body: {
      en: 'Under the newest reply, the arrows flip between its versions (swipes). The right arrow on the last version asks the model for a new one, and the counter opens the list.',
      uk: 'Під найновішою відповіддю стрілки перемикають її варіанти (свайпи). Права стрілка на останньому варіанті просить у моделі новий, а лічильник відкриває список.',
    },
    keywords: { en: 'swipe regenerate reroll retry alternative version', uk: 'свайп перегенерувати ще раз альтернативна версія' },
  },
  {
    id: 'help.edit-message',
    target: 'chat.actions',
    open: { view: 'chat' },
    help: 'chat',
    title: { en: 'Edit a message', uk: 'Змінити повідомлення' },
    body: {
      en: 'Under a message, press Edit to change its text, then Save. The buttons appear when you point at a message; on a touch screen they are always there.',
      uk: 'Під повідомленням натисніть «Редагувати», щоб змінити текст, і збережіть. Кнопки з’являються, коли навести на повідомлення; на сенсорному екрані вони завжди видні.',
    },
    keywords: { en: 'rewrite fix change text', uk: 'переписати виправити текст' },
  },
  {
    id: 'help.regen-hint',
    target: 'composer.options',
    open: { view: 'chat' },
    help: 'chat',
    title: { en: 'Redo a reply with a hint', uk: 'Переробити відповідь з підказкою' },
    body: {
      en: 'In the + menu, “Regenerate with a hint…” redoes the last reply and lets you say what to change. The hint goes to the model for that one reply and is not saved in the chat.',
      uk: 'У меню + пункт «Перегенерувати з підказкою…» переробляє останню відповідь і дає написати, що змінити. Підказка йде моделі лише для цієї відповіді й не зберігається в чаті.',
    },
    keywords: { en: 'guidance steer direction instruction regenerate', uk: 'напрямок інструкція перегенерувати' },
  },
  {
    id: 'help.message-menu',
    target: 'chat.actions',
    open: { view: 'chat' },
    help: 'chat',
    title: { en: 'More on every message', uk: 'Ще дії для кожного повідомлення' },
    body: {
      en: 'The More button under a message holds Copy text, Translate, Speak, Bookmark, Fork here, Generation data, Prompt peek, Hide from AI, Move up and down, and Delete.',
      uk: 'Кнопка «Ще» під повідомленням: копіювати текст, перекласти, озвучити, додати закладку, розгалужити тут, дані генерації, підглянути промпт, сховати від ШІ, посунути вгору чи вниз, видалити.',
    },
    keywords: { en: 'copy translate speak tts bookmark hide delete move exclude', uk: 'копіювати переклад озвучення закладка сховати видалити перемістити' },
  },
  {
    id: 'help.branch',
    target: 'chat.actions',
    open: { view: 'chat' },
    help: 'chat',
    title: { en: 'Try another turn without losing this one', uk: 'Спробувати інший поворот, не втрачаючи цей' },
    body: {
      en: 'Fork here, in a message’s More menu, starts a new chat from that message and leaves the original unchanged. Branches in the chat menu lists this chat’s forks, its siblings and its parent.',
      uk: '«Розгалужити тут» у меню «Ще» повідомлення створює новий чат із цього місця, а оригінал лишається незмінним. «Branches» у меню чату показує розгалуження цього чату, його суміжні гілки та батьківський чат.',
    },
    keywords: { en: 'fork branch checkpoint what if timeline copy chat', uk: 'гілка форк розгалуження що якби копія чату' },
  },
  {
    id: 'help.peek',
    target: 'chat.actions',
    open: { view: 'chat' },
    help: 'chat',
    title: { en: 'See what the model received', uk: 'Побачити, що отримала модель' },
    body: {
      en: 'Prompt peek in a message’s More menu shows the request behind that reply, and Generation data shows its model, tokens, cost and time. Presets and the Canvas show the same for the next reply.',
      uk: 'Пункт «Підглянути промпт» у меню «Ще» показує запит, з якого з’явилась відповідь, а «Дані генерації» — модель, токени, вартість і час. У Пресетах і на Canvas те саме видно для наступної відповіді.',
    },
    keywords: { en: 'prompt context tokens debug request cost', uk: 'промпт контекст токени налагодження запит вартість' },
  },
  {
    id: 'help.slash',
    open: { view: 'chat', panel: 'reference' },
    help: 'chat',
    title: { en: 'Commands and macros', uk: 'Команди й макроси' },
    body: {
      en: 'Type / in the message box to see the commands, such as /continue, /impersonate, /regenerate and your own shortcuts. Macros like {{char}}, {{user}} and {{roll:d20}} are filled in by the app. The reference lists them all.',
      uk: 'Введіть / у полі повідомлення, щоб побачити команди: /continue, /impersonate, /regenerate і ваші швидкі відповіді. Макроси на кшталт {{char}}, {{user}} і {{roll:d20}} застосунок підставляє сам. Усі вони є в довіднику команд.',
    },
    keywords: { en: 'slash help macros variables dice roll sillytavern', uk: 'слеш команди макроси змінні кубик' },
  },
  {
    id: 'help.chat-menu',
    target: 'chat.menu',
    open: { view: 'chat', panel: 'chat-menu' },
    help: 'chat',
    title: { en: 'The chat menu', uk: 'Меню чату' },
    body: {
      en: 'The three dots at the top of a chat (the Menu button on a phone) hold Author’s note, Lorebook activity, Story record, Convert to group, Branches, Bookmarks and Display settings, then Start new chat, Delete messages and Manage chat files.',
      uk: 'Три крапки вгорі чату (кнопка Menu на телефоні): Author’s note, активність лорбуків, запис історії, Convert to group, Branches, Bookmarks, Display settings, а нижче Start new chat, Delete messages і Manage chat files.',
    },
    keywords: { en: 'author note bookmarks branches background display convert group delete export import chat files', uk: 'нотатка автора закладки гілки фон відображення група видалити експорт імпорт файли чату' },
  },
  {
    id: 'help.switcher',
    target: 'chat.switch',
    open: { view: 'chat', narrowPanel: 'chat-menu' },
    help: 'chat',
    title: { en: 'Preset, persona and model of a chat', uk: 'Пресет, персона й модель чату' },
    body: {
      en: 'The pill at the top of a chat (inside the Menu on a phone) switches the preset, your persona and the model for this chat. A change applies from the next reply.',
      uk: 'Плашка вгорі чату (на телефоні в меню Menu) перемикає пресет, вашу персону й модель для цього чату. Зміна діє з наступної відповіді.',
    },
    keywords: { en: 'model preset persona switch connection api', uk: 'модель пресет персона перемкнути підключення' },
  },

  // ── Help list: story and memory
  {
    id: 'help.dashboard',
    target: 'dash.constellation',
    open: { view: 'chat', panel: 'dashboard' },
    help: 'story',
    title: { en: 'Scene dashboard', uk: 'Дашборд сцени' },
    body: {
      en: 'With the dashboard plugin on, it keeps who is present, how each character feels about you and what they know; by default it reads the story after each reply. To open it, click a portrait in the chat and choose Dashboard.',
      uk: 'Коли плагін дашборду ввімкнений, він веде облік: хто присутній, як кожен персонаж ставиться до вас і що знає; за замовчуванням він читає історію після кожної відповіді. Щоб відкрити його, клацніть портрет у чаті й виберіть «Дашборд».',
    },
    keywords: { en: 'relationship stats attitude trust mood scene state sensor constellation', uk: 'стосунки ставлення довіра настрій стан сцени сенсор сузірʼя' },
  },
  {
    id: 'help.threads',
    target: 'dash.threads',
    open: { view: 'chat', panel: 'dashboard' },
    help: 'story',
    title: { en: 'Story threads', uk: 'Сюжетні лінії' },
    body: {
      en: 'Threads are open questions or promises that drive the story. You can add your own, mark one resolved or reopen it. Only a limited number can be open at once.',
      uk: 'Сюжетні лінії — це відкриті питання чи обіцянки, що ведуть історію. Можна додавати свої, позначати вирішеними й відкривати знову. Відкритими одночасно може бути лише обмежена кількість.',
    },
    keywords: { en: 'plot quest goal promise open question', uk: 'сюжет квест ціль обіцянка питання' },
  },
  {
    id: 'help.notebook',
    target: 'dash.notebook',
    open: { view: 'chat', panel: 'dashboard' },
    help: 'story',
    title: { en: 'What a character knows about you', uk: 'Що персонаж знає про вас' },
    body: {
      en: 'The notebook lists what a character knows and how: saw it, heard it, or guesses. You can add a note, edit one, pin it or mark it important or everyday, and remove it or bring it back.',
      uk: 'Записник показує, що персонаж знає і звідки: бачив, чув чи здогадується. Можна додати нотатку, змінити її, закріпити чи позначити як важливу або буденну, видалити й повернути.',
    },
    keywords: { en: 'memory knowledge secrets blind spot knows', uk: 'памʼять знання таємниці сліпа пляма знає' },
  },
  {
    id: 'help.nudge',
    target: 'story.nudge',
    open: { view: 'chat' },
    help: 'story',
    title: { en: 'Push the story on', uk: 'Підштовхнути історію' },
    body: {
      en: 'The Story, move button next to Send (with the dashboard plugin) arms a one-time nudge: press it, then Send (an empty box works), and the next reply moves the story on. The arrow beside it picks one open thread to pull on. On a phone it is an icon. The nudge is not saved in the chat.',
      uk: 'Кнопка «Історія, рухайся» біля «Надіслати» (з плагіном дашборду) готує одноразовий поштовх: натисніть її, потім «Надіслати» (порожнє поле теж підходить), і наступна відповідь зрушить історію. Стрілка поруч дає вибрати одну відкриту сюжетну лінію. На телефоні це лише значок. У чаті поштовх не зберігається.',
    },
    keywords: { en: 'nudge advance plot continue without message', uk: 'поштовх рухати сюжет без повідомлення' },
  },
  {
    id: 'help.soul',
    target: 'soul.chars',
    open: { view: 'chat', panel: 'editor', tab: 'soul' },
    help: 'story',
    title: { en: 'Soul of a character', uk: 'Душа персонажа' },
    body: {
      en: 'A soul describes how a character reacts to you: how they feel at the start (romantic, ally, neutral or hostile), their traits and what triggers events. The dashboard uses it, and traits are fixed once you save.',
      uk: 'Душа описує, як персонаж реагує на вас: ставлення на старті (романтичне, союзник, нейтральне чи вороже), риси й те, що запускає події. Її використовує дашборд, а риси фіксуються після збереження.',
    },
    keywords: { en: 'personality rating psychology attitude traits class', uk: 'особистість оцінка психологія ставлення риси клас' },
  },
  {
    id: 'help.soul-rate',
    target: 'soul.rate',
    open: { view: 'chat', panel: 'editor', tab: 'soul' },
    help: 'story',
    title: { en: 'Let a model rate the soul', uk: 'Доручити моделі оцінити душу' },
    body: {
      en: 'Rate now (Rate again for a character that already has a soul) asks a model to propose a soul from the card. The proposal comes with Review, Accept all and Dismiss; Accept all saves it. Save soul is for one character you edited by hand. You can also add a soul by hand.',
      uk: '«Оцінити зараз» (для персонажа, що вже має душу, — «Оцінити знову») просить модель запропонувати душу за карткою. Пропозиція має кнопки «Переглянути», «Прийняти всі» й «Відхилити»; «Прийняти всі» зберігає її. «Зберегти душу» — для одного персонажа, якого ви змінили вручну. Душу можна додати й вручну.',
    },
    keywords: { en: 'auto rate generate propose', uk: 'автоматично оцінити згенерувати запропонувати' },
  },
  {
    id: 'help.library',
    target: 'litopys.title',
    open: { view: 'litopys' },
    help: 'story',
    title: { en: 'Library: the story record', uk: 'Бібліотека: запис історії' },
    body: {
      en: 'Litopys, the chronicler, writes a chapter after each scene closes and keeps facts about the story. The Library lists your chats with what it has written; open one to read, edit or correct it.',
      uk: 'Літопис, літописець, пише розділ після кожної завершеної сцени й веде факти про історію. Бібліотека показує ваші чати з тим, що він написав; відкрийте чат, щоб прочитати чи виправити запис.',
    },
    keywords: { en: 'memory summary litopys chronicler chapters lorebook record', uk: 'памʼять підсумок літопис літописець розділи запис' },
  },
  {
    id: 'help.library-views',
    target: 'lit.mode',
    open: { view: 'litopys' },
    help: 'story',
    title: { en: 'Overview or Details', uk: 'Огляд чи Деталі' },
    body: {
      en: 'Overview shows a chat’s story as a timeline of chapters with its characters beside it. Details shows the same record as tabs: Chapters, Facts, Proposals and Activity. Both edit the same record.',
      uk: '«Огляд» показує історію чату стрічкою розділів із персонажами поруч. «Деталі» — той самий запис вкладками: «Розділи», «Факти», «Пропозиції» та «Журнал». Обидва змінюють один і той самий запис.',
    },
  },
  {
    id: 'help.facts',
    open: { view: 'litopys' },
    help: 'story',
    title: { en: 'Facts and proposals', uk: 'Факти й пропозиції' },
    body: {
      en: 'Facts are things the story has established, each with a type, a weight and who knows it; pin the important ones. Proposals are changes Litopys suggests, such as merge, retire, rewrite or pin: you accept or reject each. Switch to Details to see them as tabs.',
      uk: 'Факти — це те, що історія вже встановила, з типом, вагою й тим, хто це знає; важливі можна закріпити. Пропозиції — зміни, які радить Літопис (обʼєднати, зняти, переписати, закріпити): кожну ви приймаєте чи відхиляєте. Перемкніться на «Деталі», щоб побачити їх вкладками.',
    },
    keywords: { en: 'memory pin facts proposals accept reject retire merge', uk: 'памʼять закріпити факти пропозиції прийняти відхилити' },
  },
  {
    id: 'help.chats-map',
    target: 'lit.map',
    open: { view: 'litopys' },
    help: 'story',
    title: { en: 'Map of chats', uk: 'Мапа чатів' },
    body: {
      en: 'The map shows which chats continue which, and it is view-only. A chat linked to an earlier one carries that story over as backstory. To change links, press “Edit links on the canvas”.',
      uk: 'Мапа показує, який чат продовжує який, і призначена лише для перегляду. Чат, повʼязаний із попереднім, отримує його історію як передісторію. Щоб змінити звʼязки, натисніть «Змінити зв\'язки на полотні».',
    },
    keywords: { en: 'link continue backstory sequel previous chat graph', uk: 'звʼязати продовження передісторія попередній чат граф' },
  },
  {
    id: 'help.story-record',
    target: 'menu.tools',
    open: { view: 'chat', panel: 'chat-menu' },
    help: 'story',
    title: { en: 'Story record of this chat', uk: 'Запис історії цього чату' },
    body: {
      en: 'Story record in the chat menu opens the Library record of this chat in a side panel: chapters, facts and proposals, with an option to rebuild it from scratch.',
      uk: '«Запис історії» в меню чату відкриває запис цього чату з Бібліотеки в бічній панелі: розділи, факти й пропозиції, а також перебудову з нуля.',
    },
    keywords: { en: 'memory summary litopys rebuild', uk: 'памʼять підсумок літопис перебудувати' },
  },
  {
    id: 'help.world-dm',
    target: 'menu.tools',
    open: { view: 'chat', panel: 'chat-menu' },
    help: 'story',
    title: { en: 'World DM', uk: 'Майстер світу' },
    body: {
      en: 'World DM in the chat menu switches on a game master for this chat. It keeps the people and places of the story in the chat’s own lorebook, and from Living world up it moves the world and brings events into the next reply. It is off until you pick a level.',
      uk: '«Майстер світу» в меню чату вмикає майстра гри для цього чату. Він записує людей і місця історії у власний лорбук чату, а від рівня «Живий світ» рухає світ і приносить події в наступну відповідь. Поки не оберете рівень, він вимкнений.',
    },
    keywords: { en: 'dm game master gm world lorebook events fronts chaos director', uk: 'майстер гри дм світ лорбук події фронти хаос режисер' },
  },
  {
    id: 'help.author-note',
    target: 'menu.tools',
    open: { view: 'chat', panel: 'chat-menu' },
    help: 'story',
    title: { en: 'Author’s note', uk: 'Нотатка автора' },
    body: {
      en: 'Author’s note in the chat menu is text added to the request for this chat, at a depth you choose (messages from the end) and with a role. Use it to steer the scene.',
      uk: 'Author’s note у меню чату — текст, який додається до запиту для цього чату на обраній глибині (повідомлень від кінця) і з обраною роллю. Ним зручно скеровувати сцену.',
    },
    keywords: { en: 'authors note a/n steer instruction depth', uk: 'нотатка автора інструкція глибина' },
  },

  // ── Help list: characters and groups
  {
    id: 'help.characters',
    target: 'characters.title',
    open: { view: 'characters', list: 'characters' },
    help: 'characters',
    title: { en: 'Your characters', uk: 'Ваші персонажі' },
    body: {
      en: 'Search, filter by tag and open a card to edit it. Sorting is on desktop. To favorite a card, use ⋯ on its tile (or the star in the editor); favorites appear in the quick-chat strip at the top.',
      uk: 'Шукайте, фільтруйте за тегами й відкривайте картку для редагування. Сортування є на комп’ютері. Щоб додати картку в обрані, скористайтеся ⋯ на її плитці (або зіркою в редакторі); обрані потрапляють на смугу швидкого чату вгорі.',
    },
    keywords: { en: 'cards bots list tags favorites sort', uk: 'картки боти список теги обрані сортування' },
  },
  {
    id: 'help.import',
    target: 'characters.import',
    open: { view: 'characters', list: 'characters' },
    help: 'characters',
    title: { en: 'Import cards', uk: 'Імпорт карток' },
    body: {
      en: 'Import brings in PNG or JSON character cards from files, or from a link (Chub, RisuRealm, CharaVault or a direct file link). On a phone it is in the ⋮ menu.',
      uk: 'Імпорт додає картки персонажів у PNG чи JSON з файлів або за посиланням (Chub, RisuRealm, CharaVault чи пряме посилання на файл). На телефоні він у меню ⋮.',
    },
    keywords: { en: 'chub png json card tavern import risu janitor download', uk: 'chub png json картка імпорт завантажити' },
  },
  {
    id: 'help.card-editor',
    target: 'editor.tabs',
    open: { view: 'chat', panel: 'editor', tab: 'core' },
    help: 'characters',
    title: { en: 'The card editor', uk: 'Редактор картки' },
    body: {
      en: 'A card has tabs: core, profile, dialogue and soul; lorebook and regex; colors, sprites, gallery and voice; and advanced. The Chat button starts a conversation with the card.',
      uk: 'У картки є вкладки: core, profile, dialogue і soul; lorebook і regex; colors, sprites, gallery і voice; а також advanced. Кнопка «Chat» починає розмову з карткою.',
    },
    keywords: { en: 'card edit description greeting first message sprites voice', uk: 'картка редагувати опис привітання перше повідомлення спрайти голос' },
  },
  {
    id: 'help.groups',
    target: 'characters.switch',
    open: { view: 'characters', list: 'groups' },
    help: 'characters',
    title: { en: 'Groups', uk: 'Групи' },
    body: {
      en: 'The switch at the top of Characters flips between Characters and Groups. A group puts several characters into one chat. Create one with the group button in the toolbar; its editor has Overview, Members, Scene, Turns, Lore and Chats.',
      uk: 'Перемикач угорі розділу «Персонажі» змінює список: персонажі чи групи. Група збирає кількох персонажів в один чат. Створіть її кнопкою групи на панелі угорі; у редакторі є вкладки: огляд, учасники, сцена, черги, книги, чати.',
    },
    keywords: { en: 'multi character party ensemble group chat', uk: 'кілька персонажів компанія ансамбль груповий чат' },
  },
  {
    id: 'help.group-turns',
    open: { view: 'characters', list: 'groups' },
    help: 'characters',
    title: { en: 'Who answers in a group', uk: 'Хто відповідає в групі' },
    body: {
      en: 'In a group’s Turns tab, Generation mode is either Narrator (one reply voices everyone) or Each in turn. Who answers (by name and talkativeness, in order, or only the member you pick) applies to Each in turn. “Keep the scene going on its own” lets members keep talking without your messages.',
      uk: 'На вкладці «Черги» групи «Режим генерації» — це «Оповідач» (одна відповідь озвучує всіх) або «По черзі». «Хто відповідає» (за іменем і балакучістю, по порядку чи лише обраний вами учасник) стосується режиму «По черзі». «Сцена йде сама» дозволяє учасникам говорити далі без ваших повідомлень.',
    },
    keywords: { en: 'narrator turn order talkativeness auto mode', uk: 'оповідач черга балакучість авто режим' },
  },
  {
    id: 'help.persona',
    target: 'nav.personas',
    open: { view: 'personas' },
    help: 'characters',
    title: { en: 'Your persona', uk: 'Ваша персона' },
    body: {
      en: 'A persona is who you play: name, pronouns and description. “Use this persona” makes it your default and switches the open chat to it. To start new chats with it for certain characters, set Binding mode to “Lock to character” and tick those characters.',
      uk: 'Персона — це ви в грі: імʼя, займенники й опис. Кнопка «Use this persona» робить її типовою й перемикає на неї відкритий чат. Щоб нові чати з певними персонажами починались із неї, оберіть Binding mode «Lock to character» і позначте цих персонажів.',
    },
    keywords: { en: 'user profile me player self', uk: 'профіль користувача я гравець' },
  },
  {
    id: 'help.marketplace',
    target: 'nav.marketplace',
    open: { view: 'marketplace' },
    help: 'characters',
    title: { en: 'Find new cards', uk: 'Знайти нові картки' },
    body: {
      en: 'The Marketplace searches character cards on several sites, such as Chub and RisuRealm. Open a result to read it, then import it into your characters.',
      uk: 'Маркет шукає картки персонажів на кількох сайтах, зокрема Chub і RisuRealm. Відкрийте результат, прочитайте його й імпортуйте до своїх персонажів.',
    },
    keywords: { en: 'chub risu browse download cards store', uk: 'chub risu огляд завантажити картки магазин' },
  },

  // ── Help list: world and lorebooks
  {
    id: 'help.lorebooks',
    target: 'lorebooks.title',
    open: { view: 'lorebooks' },
    help: 'world',
    title: { en: 'Lorebooks', uk: 'Лорбуки' },
    body: {
      en: 'A lorebook is a set of entries about your world. An entry joins the request when its keywords show up in the chat, or always if you set it so. Create or import books here and link them to a card in its lorebook tab.',
      uk: 'Лорбук — набір записів про ваш світ. Запис потрапляє в запит, коли в чаті зʼявляються його ключові слова, або завжди, якщо ви так налаштували. Створюйте чи імпортуйте книги тут і привʼязуйте їх до картки на вкладці lorebook.',
    },
    keywords: { en: 'world info lore book wi keys entries sillytavern', uk: 'світ інфо лор книга ключі записи' },
  },
  {
    id: 'help.lore-global',
    target: 'lore.global',
    open: { view: 'lorebooks', detail: true },
    help: 'world',
    title: { en: 'Global lorebook', uk: 'Глобальний лорбук' },
    body: {
      en: 'The Global switch adds a book to every chat, whichever character or persona is in it. Leave it off to use the book only where a card or chat links it.',
      uk: 'Перемикач «Глобальна» додає книгу в кожен чат, хоч би який персонаж чи персона там були. Вимкніть його, щоб книга працювала лише там, де її привʼязано до картки чи чату.',
    },
    keywords: { en: 'everywhere all chats always world info', uk: 'скрізь усі чати завжди' },
  },
  {
    id: 'help.lore-test',
    target: 'lore.test',
    open: { view: 'lorebooks', detail: true },
    help: 'world',
    title: { en: 'Test triggers', uk: 'Перевірити тригери' },
    body: {
      en: 'Paste a message to see which entries of a book would fire and why, or what was held back. Lorebook activity in the chat menu shows the same for the chat you have open.',
      uk: 'Вставте повідомлення, щоб побачити, які записи книги спрацюють і чому, а що буде стримано. «Активність лорбуків» у меню чату показує те саме для відкритого чату.',
    },
    keywords: { en: 'keywords not firing debug why activation scan', uk: 'ключові слова не спрацьовує налагодження чому активація' },
  },

  // ── Help list: setup
  {
    id: 'help.presets',
    target: 'presets.title',
    open: { view: 'presets' },
    help: 'setup',
    title: { en: 'Presets', uk: 'Пресети' },
    body: {
      en: 'A preset is the set of instructions and settings the model gets with every reply. Pick one for a chat from its top pill, or make one the default for new chats. Stock presets are read-only: create an editable copy.',
      uk: 'Пресет — набір інструкцій і налаштувань, які модель отримує з кожною відповіддю. Виберіть його для чату на верхній плашці або зробіть типовим для нових чатів. Стандартні пресети лише для читання: створіть редаговану копію.',
    },
    keywords: { en: 'prompt template instruct system prompt sillytavern', uk: 'промпт шаблон системний промпт' },
  },
  {
    id: 'help.preset-tabs',
    target: 'presets.tabs',
    open: { view: 'presets', detail: true },
    help: 'setup',
    title: { en: 'Inside a preset', uk: 'Усередині пресету' },
    body: {
      en: 'Prompt manager lists the parts of the instructions, each can be switched off. Samplers are generation settings such as temperature. Shaping is how the chat is packed for the endpoint. Utility prompts, Variables and Regex complete it. Prompt peek shows the final request.',
      uk: '«Prompt manager» — частини інструкцій, кожну можна вимкнути. «Samplers» — налаштування генерації, як-от температура. «Shaping» — як чат пакується для сервера. Ще є Utility prompts, Variables і «Регекс». «Prompt peek» показує підсумковий запит.',
    },
    keywords: { en: 'samplers temperature top p sections regex variables utility', uk: 'семплери температура секції змінні регекс' },
  },
  {
    id: 'help.shortcuts',
    target: 'shortcuts.new',
    open: { view: 'quickreplies' },
    help: 'setup',
    title: { en: 'Shortcuts', uk: 'Швидкі відповіді' },
    body: {
      en: 'A shortcut is a ready-made message on a button above the message box. Make sets of them here; each can send at once or insert into the box, and can run by itself on an event. The bar stays hidden until you switch on Shortcuts in the composer’s + menu (and the set’s Show in composer). Enabled sets also work as / commands.',
      uk: 'Швидка відповідь — готове повідомлення на кнопці над полем введення. Тут ви складаєте набори; кожна може надсилатись одразу або вставлятись у поле й може запускатись сама за подією. Смуга прихована, доки ви не ввімкнете «Shortcuts» у меню + біля поля введення (і «Show in composer» у наборі). Увімкнені набори також працюють як команди з /.',
    },
    keywords: { en: 'quick replies qr buttons canned messages', uk: 'швидкі відповіді кнопки готові повідомлення' },
  },
  {
    id: 'help.tools',
    target: 'nav.extensions',
    open: { view: 'extensions' },
    help: 'setup',
    title: { en: 'Tools', uk: 'Інструменти' },
    body: {
      en: 'Tools collects regex scripts, translation, image generation, voice (TTS), the Data Bank for files, backgrounds, MCP and plugins.',
      uk: '«Інструменти» збирають regex-скрипти, переклад, генерацію зображень, озвучення (TTS), Data Bank для файлів, фони, MCP і плагіни.',
    },
    keywords: { en: 'regex translation tts image generation data bank mcp plugins extensions', uk: 'регекс переклад озвучення зображення банк даних плагіни розширення' },
  },
  {
    id: 'help.settings',
    target: 'nav.settings',
    open: { view: 'settings' },
    help: 'setup',
    title: { en: 'Settings', uk: 'Налаштування' },
    body: {
      en: 'Settings hold appearance (language, font, width, scale), chat behavior, streaming, themes, custom CSS, Import and your data. Import takes presets, characters, regex, lorebooks, chat JSONL and a backup zip. Models and connections are set up in the Settings of the shell around this app.',
      uk: 'У налаштуваннях: вигляд (мова, шрифт, ширина, масштаб), поведінка чату, стрімінг, теми, власний CSS, Import і ваші дані. Import приймає пресети, персонажів, regex, лорбуки, чати у JSONL і zip-резервну копію. Моделі та підключення налаштовуються в «Налаштуваннях» оболонки навколо цього застосунку.',
    },
    keywords: { en: 'theme font language dark light css import sillytavern api key model connection', uk: 'тема шрифт мова темна світла css імпорт api ключ модель підключення' },
  },

  // ── Help list: help
  {
    id: 'help.molfar',
    target: 'home.ask',
    open: { view: 'home' },
    help: 'help',
    title: { en: 'Ask Molfar', uk: 'Запитай Мольфара' },
    body: {
      en: 'Ask Molfar on Home is the built-in assistant: it works in your workshop on characters, dashboards and plugins. Try a request like “character from a description”, “my own dashboard” or “Litopys review”. In Lorebooks, the With Molfar button builds a lorebook with you.',
      uk: '«Запитай Мольфара» на Головній — вбудований помічник: він працює у вашій майстерні над персонажами, дашбордами й плагінами. Спробуйте запити на кшталт «персонаж з опису», «свій дашборд» чи «огляд Літопису». У Лорбуках кнопка «З Мольфаром» створює лорбук разом із вами.',
    },
    keywords: { en: 'assistant agent ai helper build create', uk: 'помічник агент створити допомога' },
  },

  // ── Tour steps that are not help items
  {
    id: 'tour.menu.tools',
    target: 'menu.tools',
    title: { en: 'Tools for this chat', uk: 'Інструменти чату' },
    body: {
      en: 'Author’s note, Lorebook activity, Story record, Convert to group, Branches, Bookmarks and Display settings for this chat.',
      uk: 'Author’s note, активність лорбуків, запис історії, Convert to group, Branches, Bookmarks і Display settings для цього чату.',
    },
  },
  {
    id: 'tour.menu.manage',
    target: 'menu.manage',
    title: { en: 'The chat as a whole', uk: 'Чат загалом' },
    body: {
      en: 'Start a new chat with this character, delete many messages at once, or manage the chat files: rename, export and import.',
      uk: 'Почати новий чат із цим персонажем, видалити багато повідомлень одразу або керувати файлами чату: перейменувати, експортувати й імпортувати.',
    },
  },
  {
    id: 'tour.dash.constellation',
    target: 'dash.constellation',
    title: { en: 'Constellation', uk: 'Сузірʼя' },
    body: {
      en: 'The Constellation names how this character feels about you, for example Friendship or Romance. Further out means warmer.',
      uk: 'Сузірʼя називає, як цей персонаж ставиться до вас, наприклад «Дружба» чи «Романтика». Чим далі від центру, тим тепліше.',
    },
  },
  {
    id: 'tour.dash.settings',
    target: 'dash.settings',
    title: { en: 'Dashboard settings', uk: 'Налаштування панелі' },
    body: {
      en: 'Choose how the state is updated (after each reply, inside the reply, or by hand), which model reads the story and what goes into the prompt.',
      uk: 'Тут обирають, як оновлюється стан (після кожної відповіді, всередині відповіді чи вручну), яка модель читає історію і що потрапляє в промпт.',
    },
  },
  {
    id: 'tour.soul.attitude',
    target: 'soul.attitude',
    title: { en: 'Attitude at the start', uk: 'Ставлення на старті' },
    body: {
      en: 'The class says how the character treats you when the story starts, and the start values (from -20 to +20) say where each feeling begins. The story moves them from there.',
      uk: 'Клас каже, як персонаж ставиться до вас на початку історії, а стартові значення (від -20 до +20) — з чого починається кожне почуття. Далі їх рухає історія.',
    },
  },
  {
    id: 'tour.soul.save',
    target: 'soul.save',
    title: { en: 'Save the soul', uk: 'Зберегти душу' },
    body: {
      en: 'Changes you make by hand count after Save soul (Accept all saves a proposal for you). Changing traits affects the next turns of every chat with this card.',
      uk: 'Зміни, які ви робите вручну, діють після «Зберегти душу» («Прийняти всі» зберігає пропозицію за вас). Зміна рис впливає на наступні ходи в усіх чатах із цією карткою.',
    },
  },
  {
    id: 'tour.lit.settings',
    target: 'lit.settings',
    title: { en: 'How the record is written', uk: 'Як пишеться запис' },
    body: {
      en: 'The gear sets whether chapters are written and placed in the prompt automatically, how many tokens the record may take, and which model writes it.',
      uk: 'Шестерня налаштовує, чи пишуться розділи й чи додаються до промпту автоматично, скільки токенів може займати запис і яка модель його пише.',
    },
  },
  {
    id: 'tour.chars.switch',
    target: 'characters.switch',
    title: { en: 'Characters or Groups', uk: 'Персонажі чи групи' },
    body: {
      en: 'Flip between your single characters and your groups, which put several characters into one chat.',
      uk: 'Перемикайтесь між окремими персонажами й групами, які збирають кількох персонажів в один чат.',
    },
  },
  {
    id: 'tour.groups.list',
    target: 'characters.title',
    title: { en: 'Your groups', uk: 'Ваші групи' },
    body: {
      en: 'Open a group to edit its members, scene and turns. The ⋯ on a tile starts a new chat with the group.',
      uk: 'Відкрийте групу, щоб змінити учасників, сцену й черги. Знак ⋯ на плитці починає новий чат із групою.',
    },
  },
  {
    id: 'tour.groups.create',
    target: 'groups.create',
    title: { en: 'Make a group', uk: 'Створити групу' },
    body: {
      en: 'Pick at least two characters; the name is optional. The group opens as a chat. How they answer is set later in the group’s editor, Turns tab.',
      uk: 'Виберіть щонайменше двох персонажів; назва не обов’язкова. Група відкриється як чат. Як вони відповідають, налаштовується потім у редакторі групи, на вкладці «Черги».',
    },
  },
  {
    id: 'tour.lore.new',
    target: 'lore.new',
    title: { en: 'A new lorebook', uk: 'Новий лорбук' },
    body: {
      en: 'The + makes an empty book. You can also import a book from a file, or ask Molfar to build one with you.',
      uk: 'Плюс створює порожню книгу. Також можна імпортувати книгу з файлу або попросити Мольфара зробити її разом із вами.',
    },
  },
  {
    id: 'tour.preset.peek',
    target: 'presets.peek',
    title: { en: 'Prompt peek', uk: 'Підглянути промпт' },
    body: {
      en: 'Shows the final request this preset builds for a chat, so you can see what the model really gets.',
      uk: 'Показує підсумковий запит, який цей пресет складає для чату, тож видно, що модель справді отримує.',
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
  {
    id: 'chat.menu',
    place: 'chat.menu',
    steps: ['tour.menu.tools', 'tour.menu.manage', 'help.switcher'],
  },
  {
    id: 'dashboard',
    place: 'dashboard',
    steps: ['tour.dash.constellation', 'help.threads', 'help.notebook', 'tour.dash.settings'],
  },
  {
    id: 'soul',
    place: 'soul',
    steps: ['help.soul', 'help.soul-rate', 'tour.soul.attitude', 'tour.soul.save'],
  },
  {
    id: 'litopys',
    place: 'litopys',
    steps: ['help.library', 'help.library-views', 'help.chats-map', 'tour.lit.settings'],
  },
  {
    id: 'characters',
    place: 'characters',
    steps: ['help.characters', 'help.import', 'tour.chars.switch'],
  },
  {
    id: 'groups',
    place: 'groups',
    steps: ['tour.groups.list', 'tour.groups.create'],
  },
  {
    id: 'lorebooks',
    place: 'lorebooks',
    steps: ['help.lorebooks', 'tour.lore.new', 'help.lore-global', 'help.lore-test'],
  },
  {
    id: 'presets',
    place: 'presets',
    steps: ['help.presets', 'help.preset-tabs', 'tour.preset.peek'],
  },
]
