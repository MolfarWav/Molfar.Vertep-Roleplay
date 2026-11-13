<!-- source: 9bbf7efc4d3f -->
# Personajes, personas y grupos

Todo con lo que juegas vive en cuatro secciones: Characters, Groups, Personas y Marketplace. Esta página dice para qué sirve cada una; los artículos de Help *Your characters*, *The card editor tabs* y *Groups of characters* tienen los detalles.

## Tarjetas

Una tarjeta es un personaje: descripción, personalidad, escenario y un primer mensaje. Una etiqueta escrita como `group: Guild of Ravens` o `faction: Guild of Ravens` también pone al personaje de la tarjeta en ese grupo, así que un hecho de memoria contado al grupo le es conocido ([[litopys]]). La sección Characters muestra tus tarjetas como cuadrícula o lista, con búsqueda, etiquetas, carpetas, favoritos (una estrella) y varios ordenamientos. Abre una tarjeta para editarla. Los cambios quedan en un borrador hasta "Save changes"; salir con cambios sin guardar pregunta primero.

El editor tiene seis pestañas:

- **Core**: el texto de la tarjeta, el diálogo y el saludo.
- **Profile**: la misma descripción dividida en campos estructurados (identidad, apariencia, metas). Cada guardado los vuelve a escribir en el texto de la tarjeta. Una tarjeta de narrador puede describir aquí a todo un reparto.
- **Soul**: cómo reacciona el personaje ante ti, y sus hábitos. Véase [[soul]].
- **Memory**: chats terminados que el personaje recuerda. Véase [[memory]].
- **Lorebook**: libros vinculados a esta tarjeta.
- **More**: colores y voces, sprites, galería, regex, ajustes avanzados.

Una tarjeta puede interpretar varios personajes a la vez (un narrador o director de juego). Bajo Colors, "Voices" da a cada hablante su propio color. Si no listas voces, el chat lo hace por ti: una tarjeta que contiene varios personajes (secciones con el nombre de cada uno) colorea sola las líneas de cada personaje, cada uno con un color distinto, y el color se guarda con el chat. En cualquier otro chat, abre el menú del chat, "Voice colors", y activa el interruptor; "Spread colors" da un color distinto a todos los que no hayas elegido. Esto necesita el dashboard Relationship, que aporta la lista de personajes.

## Cartas de las tarjetas

Una tarjeta que no has jugado durante un tiempo puede escribirte una nota corta con su propia voz. La nota llega a la bandeja (la sección "Waiting on you" de Home, el botón de la bandeja en el riel) como una Carta verde; al abrirla te lleva al chat antiguo, o inicia un chat para una tarjeta que nunca jugaste. Una carta nunca escribe en un chat ni inventa sucesos.

Está **apagado hasta que lo enciendas**. Mientras esté apagado, una tarjeta verde "Let your characters write to you" aparece arriba de la sección Characters y en "Waiting on you" de Home: **Turn on** lo enciende al momento, **Not now** oculta la tarjeta para siempre. Los números (días de inactividad, cartas al día, días entre cartas de una misma tarjeta, el modelo de escritura) y las tarjetas que dejaste de usar están en Characters, More, Cartas de las tarjetas. Las cartas se revisan cada pocas horas mientras la app está abierta: un chat inactivo 14 días, una tarjeta que nunca jugaste durante 14 días, y una tarjeta jugada sin Soul (una vez). Si el modelo de escritura falla tres comprobaciones seguidas (o no hay ninguno configurado), la bandeja muestra un fallo rojo "Letters" con el motivo, y **Open** te lleva a los ajustes de Cartas; una carta que llega, otro modelo o apagar las cartas lo quita.

## Personas

Una persona eres tú: nombre, pronombres, descripción, avatar. El modelo la ve donde el prompt habla del usuario. "Use this persona" la hace tu predeterminada y cambia a ella el chat abierto. Una persona puede llevar sus propios lorebooks y puede bloquearse a personajes elegidos, para que los chats nuevos con ellos empiecen con ella.

## Grupos

Un grupo pone a varios personajes en un mismo chat. "New group" te deja elegir miembros. El editor tiene Overview, Members, Scene, Turns, Lore y Chats. La pestaña Turns decide quién responde: Narrator (una respuesta da voz a todos) o Each in turn. Un grupo nuevo empieza como Narrator.

La pestaña Turns también tiene **How they talk**: **Interrupciones** (Interruptions): los miembros intervienen, hablan encima unos de otros o ignoran una pregunta cuando encaja con su personaje. **Autogoles** (Own goals): los miembros se oponen, negocian o se niegan cuando un plan va contra quienes son, aunque genere tensión contigo. **Involucrar a los callados** (Draw in quiet members): quien lleva un rato sin hablar tiene más oportunidades de responder, y una escena narrada recibe el encargo de incluirlo. Las dos primeras están en Off, Can o Should: Can lo permite cuando encaja con la escena, Should lo espera, y si cada respuesta se convierte en una discusión, vuelve a Can. Los grupos nuevos empiezan con Can y con la opción de involucrar a los callados activada; los grupos antiguos tienen todo desactivado hasta que lo enciendas. El botón Turns del propio chat puede cambiarlos solo para ese chat. En la pestaña Members, abre la sección "In this group" de un miembro para darle una **voice** que solo usa este grupo: hasta dos hábitos de habla (habla en fragmentos, nunca hace preguntas) y hasta cinco frases de muestra. Unas pocas frases enseñan el ritmo mejor que los adjetivos, y personajes distintos deben responder de forma distinta a la misma noticia.

Un grupo no es una tarjeta: eliminar un grupo elimina sus chats, nunca a sus miembros. Los miembros sin color propio reciben colores distintos automáticamente.

## Conseguir tarjetas

- "Import card" acepta archivos PNG o JSON, uno o varios, y enlaza a Chub, RisuRealm, CharaVault, Botbooru o un archivo directo.
- El Marketplace busca en varias fuentes a la vez; abre un resultado para leer la tarjeta completa antes de importarla. Cada fuente tiene su propio orden y filtro de adultos, y algunas necesitan una descarga manual.
- Export escribe un PNG con la tarjeta dentro.
- "With Molfar" en Home (y en Lorebooks) pide a Molfar redactar una tarjeta o un lorebook contigo. Véase [[vertep:molfar]].

## Retratos para tarjetas sin imagen

Una tarjeta sin imagen propia (ninguna, o el avatar por defecto) puede dibujarse. **Una tarjeta:** en el editor de tarjetas, "Draw" bajo el retrato abre un diálogo: eliges el modelo de imagen; un modelo de texto (el modelo de Card tasks) escribe una descripción de la tarjeta, que puedes editar, y el modelo de imagen la dibuja. La imagen va de inmediato a la Galería de la tarjeta, y "Use as portrait" la convierte en el avatar. **Muchas tarjetas:** en Characters, More, "Draw missing portraits (N)" pregunta qué modelo usar y luego las dibuja una tras otra mediante la tarjeta de progreso; Cancel se detiene entre tarjetas, y una tarjeta que falla aparece listada con el motivo.

"Draw with" lista los modelos de imagen de Settings > Images: un ComfyUI o Forge local junto a modelos de API. La primera opción es el modelo de imagen de la app (Extensions > Image generation); una elección aquí se recuerda solo para retratos. Un modelo entrenado con etiquetas recibe una línea de etiquetas, y un modelo de API recibe un párrafo. Una tarjeta con solo un nombre no tiene nada que describir, y el diálogo lo dice. La generación de imágenes debe estar activada (Extensions); los diálogos lo indican y la abren por ti.

## Lo que una tarjeta no guarda

El estado del Dashboard, los capítulos y los hechos pertenecen a cada chat, no a la tarjeta. La memoria de la tarjeta tampoco forma parte de ella y nunca aparece en una exportación. El Soul, en cambio, se guarda en la tarjeta.

Siguiente: [[first-story]] para el primer chat, o [[soul]] para el perfil de reacción.
