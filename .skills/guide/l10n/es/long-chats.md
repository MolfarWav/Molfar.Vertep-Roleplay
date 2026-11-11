<!-- source: 67addd68fb05 -->
# Chats largos y coste de tokens

Un chat que dura semanas crece, y cada respuesta envía más de él al modelo. Esta página es para quien tiene respuestas lentas o caras, o cuyo modelo olvida el inicio de la historia.

## El botón "Request size"

Por defecto se envía todo el chat mientras la ventana tenga espacio. En una ventana grande el coste no deja de crecer, así que la cabecera del chat tiene un botón **Request size** junto a las herramientas de la historia (en el móvil: en el Menu). Muestra cuántos tokens envió la última petición, el prompt completo tal como lo contó el proveedor, y qué modelo lo recibió. Púlsalo para ver el modelo, su ventana y tu límite. Está en turquesa por debajo de las tres cuartas partes del límite, en ámbar a partir de ahí, y en rojo con un signo de aviso al superarlo. El tablero Canvas Prompt lista cada parte de una petición ([[canvas]]).

Cuando una respuesta empuja la petición por encima del límite, se abre una ventana emergente:

- **Yes, continue in a new chat** crea el siguiente chat al instante y lo abre.
- **Not now** oculta la ventana emergente para este chat hasta que la petición haya crecido a la mitad. Cerrarla cuenta como Not now.
- **Send finished scenes as chapters instead** aparece cuando Litopys está activado (siguiente sección).

El límite está al final de la ventana emergente, y en la Library, engranaje "Litopys settings", bloque "In the prompt", "Warn me when a request gets big": el 60% de la ventana del modelo (por defecto), un tamaño que escribes (100k) o eliges (de 16k a 500k), o nunca. Un chat que ya pasó el límite muestra el botón rojo y ninguna ventana emergente hasta que una nueva respuesta lo haga crecer.

El registro tiene su propio tamaño. En el mismo bloque, "Memory size" es Auto por defecto: el 15% de la ventana del modelo, entre 800 y 16000 tokens. "Compact" lo mantiene en 800.

## Los interruptores que recortan el coste

En el mismo bloque, "Older messages leave the prompt" tiene dos opciones:

- **Only when the window is full** (por defecto): se envía cada mensaje mientras quepa.
- **By scenes**: en cuanto un capítulo contiene una escena, la escena se sustituye por el capítulo. Solo los últimos mensajes se quedan palabra por palabra ("Direct messages after the scenes", 2 o más). La escena más reciente aún no tiene capítulo, así que se envía entera.

"By scenes" cuesta algo de detalle: un capítulo es un relato, así que un modelo débil puede perder una cosa pequeña. Fija un dato que nunca deba perderse ([[litopys]]). Otros recortes:

- Library, Litopys settings, **Direct messages, by size**: conserva los mensajes más recientes que quepan en un número de tokens (al menos 2 mensajes) en lugar de una cantidad fija. 0 cuenta mensajes ([[litopys]]).
- Library, Litopys settings, **Leave out what a speaker was not present for** ("Groups only" por defecto): una respuesta dicha por un personaje no recibe los mensajes recientes de escenas en las que ese personaje no estuvo ([[litopys]]).
- Canvas Prompt board, tarjeta history, Details: envía solo los últimos N mensajes (escritorio, solo ese chat).
- Baja "Memory size" a Compact, o desactiva "Chapters and facts".

## Empieza un chat nuevo y conserva la historia

En una pausa natural, un chat nuevo que continúa el viejo empieza con un prompt pequeño y aun así sabe lo que pasó.

1. En el chat, abre "More" y elige **Continue in a new chat**, o pulsa Yes en la ventana emergente.
2. El chat nuevo se crea al instante y se abre. Conserva el preset y sus elecciones, la persona, el modelo, el conjunto de agentes, el orden de turnos de un grupo y el mundo del World DM.
3. Recibe la historia antigua como trasfondo, dentro del "Backstory budget". Los tres chats anteriores más cercanos se leen enteros: capítulos, datos y puntos de giro. Los chats más antiguos de una cadena larga no se descartan: viajan en una parte condensada (ver más abajo). Los mensajes viejos no se envían.

El chat anterior pasa entonces al Archive por su cuenta (siguiente sección). El enlace es el que dibuja el Canvas, y el Canvas puede cambiarlo después: ver [[canvas]]. Para elegir otro chat anterior, empieza un chat desde el personaje y usa el menú **Continues** en el paso "New chat with".

El chat nuevo se abre con el primer saludo de la tarjeta; "Edit the first message" te deja continuar donde se detuvo la historia.

## Una historia de muchos chats

Una historia puede seguir durante muchos chats. Los tres chats anteriores más cercanos dan sus capítulos, arcos y datos como antes. Cada chat más antiguo entra en una parte **far**, colocada primero: sus puntos de giro, los datos fijados y clave, y una línea por cada arco. La parte se construye con lo que Litopys ya escribió, sin ninguna llamada extra al modelo, y ocupa el 18% del Backstory budget por defecto (Library, Litopys settings, "In the prompt", **Share for the far chats**, de 5 a 40). **Turning points shown** en el mismo bloque fija cuántos viajan en una respuesta a lo largo de toda la historia (12 por defecto). Si el presupuesto es corto, los chats más antiguos pierden sus líneas primero y los puntos de giro al final. En **What this chat carries** tiene su propia fila, "Far backstory, chats 1-2", para que veas que los primeros chats se conservaron, no se perdieron. Una cadena corta no tiene parte far. Sube el Backstory budget si una historia larga se siente escasa.

Una parte condensada pierde detalles pequeños (el color de una capa); los recuerdos palabra por palabra de abajo los recuperan.

## Archiva una historia terminada

Una historia que ya has terminado puede ir al **Archive**. Es un estado del chat, no un movimiento: el chat se queda donde está, así que su memoria, sus enlaces en el Canvas y cualquier libro hecho a partir de él siguen funcionando.

- En Chats, elige un chat y pulsa **Archive** (el botón ámbar de su panel), o marca varios con Select. En un chat está en el menú, bajo "Manage chat".
- Un chat archivado sale de la lista y de Home. La fila ámbar **Archive** bajo los filtros los abre; **Back to chats** vuelve.
- Se abre en solo lectura: puedes leer, copiar, ramificar desde un mensaje, exportar y mirar su Dashboard y su Library, pero no enviar, deslizar, editar ni borrar. Su lugar al final ofrece **Continue in a new chat**. **Unarchive** (en su panel o en el aviso) lo devuelve a la normalidad.
- La confirmación ofrece **Archive and continue** cuando ningún chat continúa este todavía.
- **Ocurre por sí solo** cuando un chat se convierte en el chat anterior de otro: un enlace en el Canvas, Continue in a new chat, la ventana emergente de arriba, o una elección en "Continues". Un aviso con Undo lo dice. Las ramas no son continuaciones y se quedan como están. Desactívalo en la Library, engranaje "Litopys settings", "Archive the earlier chat when it is continued".
- Un chat de 100 mensajes o más que lleva una semana parado recibe una pequeña etiqueta "Long chat · archive?" en la lista y un aviso en su panel. No se archiva nada por ti.

Por qué molestarse: el chat anterior ya no cambia, así que su memoria se mantiene estable y un chat nuevo que lo continúa lo lee como una historia terminada ([[litopys]]).

## Detalles que los capítulos dejaron caer

Un capítulo es un relato, así que un detalle pequeño de un chat anterior puede desaparecer de él. En la Library, Litopys settings, "In the prompt", el interruptor **Word-for-word memories of earlier chats** (activado por defecto) permite que un chat que continúa a otros recupere uno o dos pasajes de los mensajes originales cuando lo que se dice comparte palabras raras con ellos ([[litopys]]). El chat anterior se indexa cuando pasa al Archive. Coincide con palabras, así que un detalle contado con otras palabras no se encuentra; el interruptor experimental **Also find old chapters by meaning** (desactivado) reduce un poco esa brecha cuando usas embeddings: encuentra el capítulo por significado, pero un pasaje aún necesita una palabra rara propia.

## Guarda una historia como libro

En la Library, Litopys, "Save as a book" copia los capítulos, arcos y datos de un chat en el estante Data Bank para los chats que elijas: ver [[memory]].

## Comprueba qué recibió el modelo

Si un personaje olvida algo, abre Canvas > Prompt y cambia de "Parts" a "Memory": muestra qué datos entraron y cuáles se quedaron fuera, y por qué. El botón **Fired** en la cabecera del chat lo muestra para la última respuesta y para todo el chat.
