<!-- source: 22d2bcc1795f -->
# Litopys: el registro de la historia

Litopys (la crónica) es la memoria larga de un chat. Lee la historia en segundo plano y escribe un capítulo por cada escena terminada, además de los hechos que la historia ha establecido. Cuando un chat crece más de lo que cabe en la ventana del modelo, el registro lleva la historia hacia adelante. Úsalo en historias largas; no hace falta iniciarlo.

## Capítulos y hechos

- Un **capítulo** dice qué cambió en una escena, no la vuelve a contar. Se escribe cuando empieza la escena siguiente, así que la escena más reciente puede no tener uno todavía. Un lugar nuevo o un salto en el tiempo cierra una escena; también puedes marcar tú mismo un tramo de mensajes como escena desde el menú "More" de un mensaje, bajo Story.
- Un **hecho** es una frase corta que sigue siendo cierta: "Medli esconde sus alas en el mercado." Los hechos tienen un tipo, un peso (Everyday, Important, Key) y quién los conoce. Puedes añadir, editar, fijar o retirar hechos a mano.

**Un hecho puede conocerlo un grupo entero**, por ejemplo un gremio: en "Known to" escribe `group: Guild of Ravens`, y cada miembro que esté en la escena lo conoce; los demás no. Un grupo existe cuando una tarjeta tiene una etiqueta escrita `group: Guild of Ravens` o `faction: Guild of Ravens` (otras etiquetas no son grupos), o cuando un registro del World DM de tipo Group o Place lista a sus miembros ([[world-dm]]). Cuando un miembro está en la escena, el modelo que escribe los capítulos recibe el grupo y puede usarlo para noticias que todo el grupo supo. Un libro instantánea copia los nombres de los miembros en el momento en que lo guardas.

- Una **creencia** es un hecho del tipo Belief: algo que a un personaje le contaron en una mentira y que aún toma por verdad. Aparece cuando una mentira lleva un tiempo en la lista Said del Dashboard, pertenece a quien la cree, y entra solo en las respuestas de ese personaje. Termina cuando ese personaje se entera de la verdad o cuando quitas la mentira; también puedes terminarla a mano con **Knows the truth now**, lo que además avisa al Dashboard. La vista Memory marca una creencia cuando una entró en una respuesta. Véase [[dashboard]].
- Las **propuestas** son sugerencias de Litopys: fusionar dos hechos, retirar uno, reformular, fijar. Aceptas o rechazas cada una.
- Los **hábitos** que un personaje muestra con claridad también pueden aparecer, y se convierten en hábito tras repetirse en varias escenas.

## Dónde mirar

Pulsa **Record** en el encabezado del chat (en el teléfono, en el Menu) para ver el registro de este chat en un panel lateral. La sección **Library** del riel muestra el registro de cada chat. Tiene dos vistas: Overview (una línea de tiempo, una tarjeta por personaje, propuestas pendientes) y Details, con las pestañas Chapters, Facts, Proposals, Habits, Activity y Settings. La pestaña Activity registra lo que hizo Litopys, con Undo cuando es posible. El engranaje ("Litopys settings") define cómo se escribe el registro.

## Recuerdos palabra por palabra de chats anteriores

Un capítulo es una narración, así que un detalle pequeño (el color de una capa, una promesa exacta) puede faltar. Cuando este chat continúa chats anteriores ([[long-chats]]), activa **Word-for-word memories of earlier chats** en la Library, Litopys settings, bloque "In the prompt". Entonces, cuando lo que se dice comparte varias palabras poco comunes con un pasaje anterior, uno o dos pasajes de los mensajes ORIGINALES entran en el prompt, etiquetados como más antiguos que los hechos. Lee toda la cadena, no solo los tres chats más cercanos, y un personaje solo recibe un pasaje de una escena en la que estuvo. No hace ninguna llamada al modelo; está apagado por defecto y usa como máximo el "Word-for-word budget" de tokens (400 por defecto). Si nada comparte palabras poco comunes suficientes, no se añade nada. La vista Memory y el panel Fired muestran lo que se añadió para la última respuesta; el tablero Prompt del Canvas tiene su propio interruptor para el chat.

## Qué entra en el prompt

Por defecto el registro se inserta automáticamente. "Memory size" indica cuántos tokens puede ocupar: Auto por defecto (15% de la ventana del modelo, al menos 800 y como máximo 16000), Compact (800 tokens) o Custom desde 200 hasta 16000. Auto deja que una ventana grande lleve más historia; en un modelo pequeño se queda cerca de 800. Un tamaño que hayas guardado antes se mantiene igual. Cuando todo cabe, se envía completo; si no, se envían las partes más importantes para la escena. Un modelo pequeño necesita un tamaño pequeño. Con "Chapters and facts" apagado no hay capítulos ni hechos nuevos y no se añade nada al prompt.

Los mensajes más antiguos solo pueden salir del prompt cuando la ventana está llena, o escena por escena una vez que un capítulo los cubre; el ajuste "Older messages leave the prompt" elige cuál: "Only when the window is full" (predeterminado) o "By scenes". [[long-chats]] dice cuál conviene.

## Coincidencia por significado

La memoria encuentra hechos y capítulos por palabras. Con un modelo de embeddings, también los encuentra por significado: una pregunta con otras palabras llega igualmente al hecho. La tarjeta **Matching by meaning** (arriba del registro de un chat, y en Canvas > Prompt > Memory) muestra en qué punto está: off, failing, no vectors yet, partly done, done, o made by another model. Configura el modelo una vez en Settings > Memory: por defecto la app usa primero un modelo de tu propio equipo (LM Studio u Ollama), luego una conexión de API con clave, y después OpenRouter. Cuando una llamada al modelo de embeddings ha funcionado (con un clic en el botón de la tarjeta, o con una respuesta), el motor completa solo los vectores que faltan en cada chat y en cada archivo del Data Bank, revisando cada pocos minutos; lo que supere 300 000 tokens espera al botón, y el interruptor **Make vectors by itself** en Settings > Memory lo apaga. El botón **Embed N items** indica primero cuántos elementos son y cuántos tokens aproximados cuesta, y lo hace en ese momento. Las escenas nuevas vectorizan sus elementos nuevos de todos modos. Si cambias el modelo de embeddings, los vectores antiguos no se usan hasta que pulses **Embed again**. El Data Bank tiene su propia tarjeta, **Data Bank by meaning**, arriba de Settings > Data Bank: funciona igual con los pasajes de tus archivos y de los libros instantánea, y un archivo que solo está cubierto en parte dice "7 of 12 by meaning".

## Ajustes de un chat

La pestaña **Settings** del registro de un chat (en el panel lateral Record y en la Library, junto a Activity) configura Litopys solo para este chat: la escena más corta y la más larga, cuántos mensajes recientes se quedan palabra por palabra (o cuántos mensajes directos quedan tras las escenas, cuando los mensajes antiguos salen "By scenes"), la forma en que los mensajes antiguos salen del prompt, y cuántos hechos puede tener fijados un personaje. Un campo que dejas vacío sigue el "Litopys settings" del engranaje y muestra ese valor como "Library: N". Un valor se guarda al salir del campo. "Use the Library settings" los borra todos. Un chat con cambios de escena frecuentes va bien con una escena más corta baja, por ejemplo 3: una escena corta recibe así su propio capítulo. Los capítulos ya escritos se conservan; usa Rebuild para reescribirlos con las nuevas longitudes.

## Sugerencias y limpieza

"Suggestions" tiene tres opciones. "Ask me first": cada sugerencia espera tu sí. "Only risky ones" (el predeterminado en una instalación nueva): las sugerencias rutinarias se aplican al momento, se registran en Activity con un Undo, y solo esperan las arriesgadas, cada una con el motivo: una fusión que diría a más personas un hecho que solo algunas conocían, un cambio a un hecho que fijaste, escribiste, editaste o marcaste como key, un cambio duradero o una creencia, y un hecho nuevo que puede contradecir uno que fijaste. El mismo motivo aparece en la Inbox. "Apply pins and rewrites quietly": solo pasan los fijados y las reescrituras; retirar y fusionar esperan por ti. "Tidy facts automatically" busca duplicados y contradicciones después de 30 hechos nuevos, con una llamada extra al modelo por cada 60 hechos.

## Reconstruir

"Rebuild from scratch" reescribe los capítulos y hechos a partir de los mensajes en segundo plano, aproximadamente una llamada al modelo cada 30 segundos. Tus hechos propios, editados y fijados, y los capítulos editados se conservan, y el registro actual se usa hasta que el nuevo esté listo. No empieza si ninguna escena se ha cerrado.

Si editas mensajes después de escribirse un capítulo, ese capítulo se marca como obsoleto y se reescribe.

## Relacionado

La tarjeta de un personaje también puede guardar memoria de chats terminados: véase [[memory]]. Los artículos de Help *Litopys: chapters and proposals*, *Facts and proposals* y *Overview vs Details* cubren las pantallas.
