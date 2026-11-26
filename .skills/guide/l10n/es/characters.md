<!-- source: 59593d4e7cf8 -->
# Personajes, personas y grupos

Todo con lo que juegas vive en cuatro secciones: Characters, Groups, Personas y Marketplace. Esta página explica para qué sirve cada una; los artículos de ayuda *Your characters*, *The card editor tabs* y *Groups of characters* tienen los detalles.

## Tarjetas

Una tarjeta es un personaje: descripción, personalidad, escenario y un primer mensaje. Una etiqueta escrita `group: Guild of Ravens` o `faction: Guild of Ravens` también incluye al personaje de la tarjeta en ese grupo, así que un dato de memoria contado al grupo es conocido por ellos ([[litopys]]). La sección Characters muestra tus tarjetas como cuadrícula o lista, con búsqueda, etiquetas, carpetas, favoritos (una estrella) y varios órdenes. Abre una tarjeta para editarla. Los cambios se quedan en un borrador hasta "Save changes"; salir con cambios sin guardar pregunta primero.

El editor tiene seis pestañas:

- **Core**: el texto de la tarjeta, el diálogo y el saludo.
- **Profile**: la misma descripción dividida en campos estructurados (identidad, apariencia, objetivos). Cada guardado los escribe de vuelta en el texto de la tarjeta. Una tarjeta de narrador puede describir aquí a todo un reparto. Consulta "La pestaña Profile" más abajo.
- **Soul**: cómo reacciona el personaje ante ti, más sus hábitos. Consulta [[soul]].
- **Memory**: chats terminados que el personaje recuerda. Consulta [[memory]].
- **Lorebook**: libros vinculados a esta tarjeta.
- **More**: colores y voces, sprites (consulta [[sprites]]), galería, regex, ajustes avanzados.

Una tarjeta puede interpretar a varios personajes a la vez (un narrador o director de juego). En Colors, "Voices" da a cada hablante su propio color. Si no indicas ninguna voz, el chat lo hace por ti: una tarjeta que contiene varios personajes (secciones con el nombre de cada uno) colorea por sí sola las líneas de cada personaje, cada uno con un color distinto, guardado con el chat. En cualquier otro chat, abre el menú del chat, "Voice colors", y activa el interruptor; "Spread colors" da un color distinto a cada persona que no hayas elegido. Esto necesita el panel Relationship, que proporciona la lista de personajes. Cuando se pintan las voces, una línea toma el color de quien la dice: el nombre con el que empieza ("Rhea:"), un nombre junto a un verbo de habla ("— No —dice Esh") o un ella o él que señala al único personaje de ese género mencionado antes en la misma respuesta ("— Bien —dice ella"). Un hablante que no está en la lista (alguien de paso, nombrado solo en la historia) recibe un color propio, siempre el mismo, apartado de los colores ya usados. Una línea que no nombra a nadie conserva el color del hablante anterior; antes de que se nombre a alguien, queda el color del tema. Si la historia llama a un personaje con otro nombre que la tarjeta (la tarjeta dice "Afrodita", la historia dice "Ada"), el chat puede listar a dos personas y colorearlas por separado. Dos formas de unirlas: en el panel Relationship abre el menú del personaje y elige "Same person as...", o añade a la tarjeta una línea como "Also called: Ada", para que el nombre se conozca desde la primera respuesta. Una palabra corta entre comillas en medio de una frase ("lo llamó «traición» y se fue") se lee como término, no como habla, y no se colorea. Para ver por qué una línea recibió su color, abre el menú del chat, "Voice colors", y activa "Show who speaks and why": una pequeña marca tras cada cita indica el hablante y la regla.

## La pestaña Profile

La pestaña es un formulario que escribe la Description y la Personality de la tarjeta, que es lo que leen los chats. Se abre con una línea que lo dice, y el interruptor "Free write" debajo: con Free write activado escribes tú la Description y la Personality y los campos dejan de cambiarlas (se conservan, pero los chats no las ven). Aceptar "Structure it" desactiva Free write de nuevo.

Cada sección excepto Identity y Notes tiene un interruptor "In chats". Una sección desactivada conserva sus campos pero no escribe texto, así que los chats no la ven y cada chat lleva menos tokens; "Fill empty" también la salta. Sexuality, Trauma y Circles empiezan desactivadas hasta que las actives o las rellenes.

Hay tres botones bajo el panel "Models", cada uno con el modelo que usa escrito debajo:

- "Structure it" ordena el texto de la tarjeta en los campos. Lee una tarjeta larga por partes.
- "Fill empty" propone valores solo para los campos vacíos. El retrato solo acompaña a los campos de Appearance, hacia el modelo de imagen; todo lo demás va al modelo de texto sin la imagen. Una petición de ambos son dos llamadas y una propuesta que revisar. En una tarjeta más larga que la ventana del modelo, lee las partes que importan para los campos que rellena (el texto de Personality para rasgos, miedos y objetivos, la Description para el aspecto y los antecedentes), y la propuesta dice cuánto de la tarjeta leyó.
- "Read from picture" reescribe los campos de Appearance a partir del retrato o de una imagen que adjuntes. "Rewrite fields that are already filled" está marcado a menos que lo desmarques, y la ventana recuerda tu elección.

"Models" contiene dos elecciones para esta tarjeta, guardadas con "Save changes": el modelo de texto (Structure it, Fill empty, la valoración de Soul) y "Reading the portrait". "Don't send the portrait" mantiene Fill empty solo texto; Read from picture sigue funcionando. Una elección para cada tarjeta está en Roleplay settings, "Card tasks".

## Personas

Una persona eres tú: nombre, pronombres, descripción, avatar. El modelo la ve allí donde el prompt habla del usuario. "Use this persona" la convierte en tu predeterminada y cambia el chat abierto a ella. Una persona puede llevar sus propios lorebooks y puede estar vinculada a personajes concretos, para que los nuevos chats con ellos empiecen con ella. La pestaña Lorebooks de una persona lista los libros que lleva (abre uno, desvincúlalo, añade más desde una lista que puedes buscar, o empieza uno nuevo). Una persona puede tener un libro propio ("New book" en una pestaña vacía lo crea, "Replace" lo cambia): viaja dentro del archivo de la persona, así que Export y Backup lo llevan y al importar el archivo en otro dispositivo vuelve, vinculado. Los libros que solo vincula se quedan en la biblioteca de ese dispositivo; un vínculo cuyo libro falta aparece como una fila "Not in your library" que puedes eliminar. Importar en la pantalla Personas toma una persona de otra app (un nombre y una descripción), una copia de seguridad de varias, o una lista `{ name: description }`; una persona que nombra libros que aún no has importado se importa igualmente, con una nota de cuáles faltan.

## Grupos

Un grupo reúne a varios personajes en un solo chat. "New group" abre un selector (búsqueda, favoritos, etiquetas, orden de intervención); "Next" crea el grupo y abre su editor, donde "Start chat" inicia el primer chat. El editor tiene Overview, Members, Scene, Turns, Direction, Lore y Chats. La pestaña Direction y la barra en un chat grupal se describen en [[direction]]. La pestaña Turns decide quién responde: Narrator (una respuesta habla por todos) o Each in turn. Un grupo nuevo comienza como Narrator.

La pestaña Turns también tiene **How they talk**: **Interruptions** (los miembros interrumpen, hablan unos sobre otros o ignoran una pregunta cuando encaja con su carácter), **Own goals** (los miembros objetan, negocian o se niegan cuando un plan va contra quienes son, aunque eso cree tensión contigo) y **Draw in quiet members** (quien lleva un rato callado tiene más oportunidades de responder, y a una escena narrada se le pide que lo incluya). Las dos primeras son Off, Can o Should: Can lo permite cuando encaja con la escena, Should lo espera, y si cada respuesta se convierte en una discusión, vuelve a Can. Los grupos nuevos empiezan con Can y Draw in activados; los grupos antiguos mantienen todo desactivado hasta que lo actives. El botón Turns del propio chat puede cambiarlos solo para un chat. En la pestaña Members, abre la sección "In this group" de un miembro para darle una **voice** que solo usa este grupo: hasta dos hábitos de habla (habla en fragmentos, nunca hace preguntas) y hasta cinco líneas de ejemplo. Unas pocas líneas enseñan mejor el ritmo que los adjetivos, y distintos personajes deberían responder de forma distinta a la misma noticia.

Un grupo no es una tarjeta: eliminar un grupo elimina sus chats, nunca a sus miembros. Los miembros sin color propio reciben colores distintos automáticamente.

## Conseguir tarjetas

- "Import card" acepta archivos PNG o JSON, uno o varios, y enlaces a Chub, RisuRealm, CharaVault, Botbooru o un archivo directo.
- El Marketplace busca en varias fuentes a la vez; abre un resultado para leer la tarjeta completa antes de importarla. Cada fuente tiene su propio orden y filtro para adultos, y algunas requieren una descarga manual.
- Export escribe un PNG con la tarjeta dentro.
- "With Molfar" en Home (y en Lorebooks) pide a Molfar que redacte una tarjeta o un lorebook contigo. Consulta [[vertep:molfar]].

## Cartas de las tarjetas

Una tarjeta con la que no has jugado desde hace un tiempo puede escribirte una nota breve con su propia voz. La nota llega a la bandeja de entrada ("Waiting on you" de Home, el botón de la bandeja en la barra lateral) como una Letter verde; abrirla te lleva al chat antiguo, o inicia un chat para una tarjeta con la que nunca jugaste. Una carta nunca escribe en un chat ni inventa sucesos.

Está **desactivado hasta que lo actives**. Mientras está desactivado, una tarjeta verde "Let your characters write to you" aparece en la parte superior de la sección Characters y en "Waiting on you" de Home: **Turn on** lo activa al instante, **Not now** oculta la tarjeta para siempre. Los números (días de inactividad, cartas al día, días entre cartas de una misma tarjeta, el modelo de escritura) y las tarjetas que detuviste están en Characters, More, Letters from cards. Las cartas se comprueban cada pocas horas mientras la app está abierta: un chat inactivo durante 14 días, una tarjeta con la que nunca jugaste durante 14 días, y una tarjeta jugada sin Soul (una vez). Si el modelo de escritura falla tres comprobaciones seguidas (o no hay ninguno configurado), la bandeja muestra un fallo "Letters" en rojo con el motivo, y Open te lleva a los ajustes de Letters; una carta que llega, un modelo distinto o desactivar las cartas lo borra.

## Retratos para tarjetas sin uno

Una tarjeta sin imagen propia (nada, o el avatar predeterminado) se puede dibujar. **Una tarjeta:** en el editor de la tarjeta, "Draw" bajo el retrato abre un diálogo: elige el modelo de imagen, un modelo de texto (el modelo de Card tasks) escribe una descripción de la tarjeta, que puedes editar, y el modelo de imagen la dibuja. La imagen va a la Gallery de la tarjeta al instante y "Use as portrait" la convierte en el avatar. **Muchas tarjetas:** Characters, More, "Draw missing portraits (N)" pregunta qué modelo y luego las dibuja una tras otra mediante la tarjeta de progreso; Cancel lo detiene entre tarjetas y una tarjeta que falla se lista con el motivo.

"Draw with" lista los modelos de imagen de Settings > Images: un ComfyUI o Forge local junto a modelos de API. La primera opción es el modelo de imagen propio de la app (Extensions > Image generation); una elección aquí se recuerda solo para retratos. Un modelo entrenado con etiquetas recibe una línea de etiquetas, un modelo de API un párrafo. Una tarjeta que solo tiene un nombre no tiene nada que describir, y el diálogo lo indica. La generación de imágenes debe estar activada (Extensions); los diálogos lo indican y la abren por ti.

## Lo que una tarjeta no contiene

El estado del Dashboard, los capítulos y los hechos pertenecen a cada chat, no a la tarjeta. La pestaña Memory de la tarjeta (hábitos conservados, "How they changed") tampoco forma parte de la tarjeta y nunca aparece en una exportación. El Soul, en cambio, se guarda en la tarjeta.

Siguiente: [[first-story]] para el primer chat, o [[soul]] para el perfil de reacción.
