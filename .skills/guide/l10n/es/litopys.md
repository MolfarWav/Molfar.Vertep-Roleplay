<!-- source: 9004c118e307 -->
# Litopys: el registro de la historia

Litopys (la crónica) es la memoria larga de un chat. Lee la historia en segundo plano y escribe un capítulo por cada escena terminada, más los hechos que la historia ha establecido. Cuando un chat crece demasiado para la ventana del modelo, el registro lleva la historia adelante. Úsalo para historias largas; no necesitas iniciarlo.

## Capítulos y hechos

- Un **capítulo** dice qué cambió en una escena, no un recuento. Se escribe una vez que empieza la escena siguiente, de modo que la escena más reciente puede no tener uno todavía. Un lugar nuevo o un salto en el tiempo cierra una escena; también puedes marcar tú mismo un tramo de mensajes como escena, desde el menú "More" de un mensaje, bajo Story.
- Un **hecho** es una oración corta que sigue siendo cierta: "Medli esconde sus alas en el mercado." Los hechos tienen un tipo, un peso (Everyday, Important, Key) y quién los sabe. Puedes añadir, editar, fijar o retirar hechos a mano.
- Las **propuestas** son sugerencias de Litopys: fusionar dos hechos, retirar uno, reformular, fijar. Aceptas o rechazas cada una.
- Los **hábitos** que un personaje muestra con claridad también pueden aparecer, y se vuelven hábito tras repetirse en varias escenas.

## Dónde mirar

Pulsa **Record** en el encabezado del chat (en el teléfono, en el Menu) para ver el registro de este chat en un panel lateral. La sección **Library** del riel muestra el registro de cada chat. Tiene dos vistas: Overview (una línea de tiempo, una tarjeta por personaje, propuestas pendientes) y Details con las pestañas Chapters, Facts, Proposals, Habits y Activity. La pestaña Activity registra lo que hizo Litopys, con Undo donde es posible. El engranaje ("Litopys settings") fija cómo se escribe el registro.

## Qué entra en el prompt

Por defecto el registro se inserta automáticamente. "Memory size" dice cuántos tokens puede ocupar: Compact (800 tokens) por defecto, Auto (15% de la ventana del modelo, al menos 800) o Custom de 200 hasta 16000. Cuando todo cabe, se envía entero; si no, las partes que más importan para la escena. Un modelo pequeño quiere un tamaño pequeño. "Chapters and facts" apagado significa que no hay capítulos ni hechos nuevos y nada se añade al prompt.

Los mensajes más viejos pueden salir del prompt solo cuando la ventana está llena, o escena por escena una vez que un capítulo los cubre; el ajuste "Older messages leave the prompt" elige.

## Sugerencias y limpieza

"Suggestions" es "Ask me first" por defecto: cada fijado y reescritura espera tu sí. La opción silenciosa aplica fijados y reescrituras de inmediato y los registra en Activity. Retirar y fusionar siempre esperan por ti. "Tidy facts automatically" busca duplicados y contradicciones después de 30 hechos nuevos, a una llamada de modelo extra por cada 60 hechos.

## Reconstruir

"Rebuild from scratch" reescribe los capítulos y hechos a partir de los mensajes en segundo plano, aproximadamente una llamada de modelo cada 30 segundos. Tus hechos propios, editados y fijados, y los capítulos editados se conservan, y el registro actual se usa hasta que el nuevo esté listo. Se niega a empezar si ninguna escena se ha cerrado.

Si editas mensajes después de que un capítulo se escribió, ese capítulo se marca obsoleto y se reescribe.

## Relacionado

La tarjeta de un personaje también puede guardar memoria de chats terminados: véase [[memory]]. Los artículos de Help *Litopys: chapters and proposals*, *Facts and proposals* y *Overview vs Details* cubren las pantallas.
