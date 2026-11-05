<!-- source: c68da6730f1a -->
# Litopys: el registro de la historia

Litopys (la crónica) es la memoria larga de un chat. Lee la historia en segundo plano y escribe un capítulo por cada escena terminada, además de los hechos que la historia ha establecido. Cuando un chat crece más de lo que cabe en la ventana del modelo, el registro lleva la historia hacia adelante. Úsalo en historias largas; no hace falta iniciarlo.

## Capítulos y hechos

- Un **capítulo** dice qué cambió en una escena, no la vuelve a contar. Se escribe cuando empieza la escena siguiente, así que la escena más reciente puede no tener uno todavía. Un lugar nuevo o un salto en el tiempo cierra una escena; también puedes marcar tú mismo un tramo de mensajes como escena desde el menú "More" de un mensaje, bajo Story.
- Un **hecho** es una frase corta que sigue siendo cierta: "Medli esconde sus alas en el mercado." Los hechos tienen un tipo, un peso (Everyday, Important, Key) y quién los conoce. Puedes añadir, editar, fijar o retirar hechos a mano.
- Las **propuestas** son sugerencias de Litopys: fusionar dos hechos, retirar uno, reformular, fijar. Aceptas o rechazas cada una.
- Los **hábitos** que un personaje muestra con claridad también pueden aparecer, y se convierten en hábito tras repetirse en varias escenas.

## Dónde mirar

Pulsa **Record** en el encabezado del chat (en el teléfono, en el Menu) para ver el registro de este chat en un panel lateral. La sección **Library** del riel muestra el registro de cada chat. Tiene dos vistas: Overview (una línea de tiempo, una tarjeta por personaje, propuestas pendientes) y Details, con las pestañas Chapters, Facts, Proposals, Habits y Activity. La pestaña Activity registra lo que hizo Litopys, con Undo cuando es posible. El engranaje ("Litopys settings") define cómo se escribe el registro.

## Qué entra en el prompt

Por defecto, el registro se inserta automáticamente. "Memory size" indica cuántos tokens puede ocupar: Auto por defecto (15% de la ventana del modelo, como mínimo 800 y como máximo 16000), Compact (800 tokens) o Custom, desde 200 hasta 16000. Auto deja que una ventana grande lleve más historia; en un modelo pequeño se queda cerca de 800. Un tamaño que hayas guardado antes se mantiene. Cuando todo cabe, se envía completo; si no, se envían las partes más importantes para la escena. Un modelo pequeño necesita un tamaño pequeño. Con "Chapters and facts" desactivado no hay capítulos ni hechos nuevos y no se añade nada al prompt.

Los mensajes más antiguos solo pueden salir del prompt cuando la ventana está llena, o escena por escena una vez que un capítulo los cubre; el ajuste "Older messages leave the prompt" lo elige.

## Coincidencia por significado

La memoria encuentra hechos y capítulos por palabras. Con un modelo de embeddings, también los encuentra por significado: una pregunta con otras palabras llega igualmente al hecho. La tarjeta **Matching by meaning** (arriba del registro de un chat, y en Canvas > Prompt > Memory) muestra en qué punto está: off, failing, no vectors yet, partly done, done, o made by another model. Configura el modelo una vez en Settings > Memory: por defecto la app usa primero un modelo de tu propio equipo (LM Studio u Ollama), luego una conexión API con clave, y después OpenRouter. Cuando una llamada al modelo de embeddings ha funcionado (al pulsar el botón de la tarjeta, o con una respuesta), el motor completa solo los vectores que faltan en cada chat y en cada archivo del Data Bank, revisando cada pocos minutos. Lo que supere 300 000 tokens espera al botón, y el interruptor **Make vectors by itself** en Settings > Memory lo desactiva. El botón **Embed N items** dice primero cuántos elementos son y cuántos tokens aproximados cuesta, y lo hace en ese momento. Las escenas nuevas vectorizan sus elementos nuevos en cualquier caso. Si cambias el modelo de embeddings, los vectores antiguos no se usan hasta que pulses **Embed again**. El Data Bank tiene su propia tarjeta, **Data Bank by meaning**, arriba de Settings > Data Bank: funciona igual con los pasajes de tus archivos y de los libros instantánea, y un archivo que solo está cubierto en parte dice "7 of 12 by meaning".

## Sugerencias y limpieza

"Suggestions" es "Ask me first" por defecto: cada fijado y cada reescritura espera tu sí. La opción silenciosa aplica fijados y reescrituras de inmediato y los registra en Activity. Retirar y fusionar siempre esperan por ti. "Tidy facts automatically" busca duplicados y contradicciones tras 30 hechos nuevos, con una llamada extra al modelo por cada 60 hechos.

## Reconstruir

"Rebuild from scratch" reescribe los capítulos y hechos a partir de los mensajes en segundo plano, aproximadamente una llamada al modelo cada 30 segundos. Tus hechos propios, editados y fijados, y los capítulos editados se conservan, y el registro actual se usa hasta que el nuevo esté listo. No empieza si ninguna escena se ha cerrado.

Si editas mensajes después de escribirse un capítulo, ese capítulo se marca como obsoleto y se reescribe.

## Relacionado

La tarjeta de un personaje también puede guardar memoria de chats terminados: véase [[memory]]. Los artículos de Help *Litopys: chapters and proposals*, *Facts and proposals* y *Overview vs Details* cubren las pantallas.
