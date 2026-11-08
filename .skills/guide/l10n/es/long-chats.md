<!-- source: 49838714a096 -->
# Chats largos y costo en tokens

Un chat que dura semanas crece, y cada respuesta envía más de él al modelo. Esta página es para quien ve sus respuestas lentas o caras, o cuyo modelo olvida el inicio de la historia.

## El botón Request size

Por defecto se envía todo el chat mientras la ventana tenga espacio. En una ventana grande el costo sigue creciendo, así que el encabezado del chat tiene un botón **Request size** junto a las herramientas de la historia (en el teléfono: en el Menu). Muestra cuántos tokens envió la última solicitud, el prompt completo tal como lo contó el proveedor, y qué modelo lo recibió. Púlsalo para ver el modelo, su ventana y tu límite. Es verde azulado por debajo de tres cuartos del límite, ámbar desde ahí, y rojo con un signo de advertencia por encima. El tablero Prompt del Canvas enumera cada parte de una solicitud ([[canvas]]).

Cuando una respuesta empuja la solicitud más allá del límite, se abre un aviso:

- **Yes, continue in a new chat** crea el siguiente chat al momento y lo abre.
- **Not now** oculta el aviso para este chat hasta que la solicitud haya crecido a la mitad. Cerrarlo cuenta como Not now.
- **Send finished scenes as chapters instead** aparece cuando Litopys está activo (sección siguiente).

El límite está al pie del aviso, y en la Library, engranaje "Litopys settings", bloque "In the prompt", "Warn me when a request gets big": 60% de la ventana del modelo (predeterminado), un tamaño que escribas (100k) o elijas (de 16k a 500k), o nunca. Un chat que ya pasó del límite muestra el botón rojo y ningún aviso, hasta que una nueva respuesta lo haga crecer.

El registro tiene su propio tamaño. En el mismo bloque, "Memory size" es Auto por defecto: 15% de la ventana del modelo, entre 800 y 16000 tokens. "Compact" lo deja en 800.

## Los interruptores que recortan el costo

En el mismo bloque, "Older messages leave the prompt" tiene dos opciones:

- **Only when the window is full** (predeterminado): cada mensaje se envía mientras quepa.
- **By scenes**: en cuanto un capítulo contiene una escena, la escena se reemplaza por el capítulo. Solo quedan palabra por palabra los últimos mensajes ("Direct messages after the scenes", 2 o más). La escena más nueva aún no tiene capítulo, así que se envía completa.

"By scenes" cuesta algo de detalle: un capítulo es una narración, así que un modelo débil puede perder un pequeño detalle. Fija un hecho que nunca debe perderse ([[litopys]]). Otros recortes:

- Tablero Prompt del Canvas, tarjeta de historial, Details: enviar solo los últimos N mensajes (en el escritorio, solo ese chat).
- Bajar "Memory size" a Compact, o apagar "Chapters and facts".

## Empezar un chat nuevo y conservar la historia

En una pausa natural, un chat nuevo que continúa el anterior empieza con un prompt pequeño y aun así sabe lo que pasó.

1. En el chat, abre "More" y elige **Continue in a new chat**, o pulsa Yes en el aviso.
2. El chat nuevo se crea al momento y se abre. Conserva el preset y sus elecciones, la persona, el modelo, el conjunto de agentes, el orden de turnos de un grupo y el mundo del World DM.
3. Recibe la historia anterior como trasfondo, dentro del "Backstory budget". Los tres chats anteriores más cercanos se leen completos: capítulos, hechos y puntos de inflexión. Los chats más antiguos de una cadena larga no se descartan: viajan en una sola parte condensada (véase abajo). Los mensajes antiguos no se envían.

El chat anterior pasa luego al Archive por sí solo (sección siguiente). El enlace es el que dibuja el Canvas, y el Canvas puede cambiarlo después: véase [[canvas]]. Para elegir otro chat anterior, inicia un chat desde el personaje y usa el menú **Continues** en el paso "New chat with".

El chat nuevo se abre con el saludo inicial de la tarjeta; "Edit the first message" te deja seguir donde se detuvo la historia.

## Una historia de muchos chats

Una historia puede continuar en muchos chats. Los tres chats anteriores más cercanos aportan sus capítulos, arcos y hechos como antes. Cada chat más antiguo entra en una sola parte **far**, colocada primero: sus puntos de inflexión, los hechos fijados y clave, y una línea por cada arco. La parte se construye con lo que Litopys ya escribió, sin llamadas extra al modelo, y ocupa por defecto el 18% del Backstory budget (Library, Litopys settings, "In the prompt", **Share for the far chats**, de 5 a 40). **Turning points shown** en el mismo bloque fija cuántos viajan en una respuesta a lo largo de toda la historia (12 por defecto). Si el presupuesto es corto, los chats más antiguos pierden primero sus líneas, y los puntos de inflexión, al final. En **What this chat carries** tiene su propia fila, "Far backstory, chats 1-2", para que veas que los primeros chats se conservaron y no se perdieron. Una cadena corta no tiene parte far. Sube el Backstory budget si una historia larga se siente escasa.

Una parte condensada descarta pequeños detalles (el color de una capa); los recuerdos palabra por palabra de más abajo los recuperan.

## Archivar una historia terminada

Una historia que has terminado puede pasar al **Archive**. Es un estado del chat, no un traslado: el chat se queda donde está, así que su memoria, sus enlaces en el Canvas y cualquier libro hecho a partir de él siguen funcionando.

- En Chats, elige un chat y pulsa **Archive** (el botón ámbar de su panel), o marca varios con Select. Dentro de un chat está en el menú bajo "Manage chat".
- Un chat archivado sale de la lista y de Home. La fila ámbar **Archive** bajo los filtros los abre; **Back to chats** regresa.
- Se abre en solo lectura: puedes leer, copiar, bifurcar desde un mensaje, exportar y ver su Dashboard y su Library, pero no enviar, deslizar, editar ni borrar. Su lugar al pie ofrece **Continue in a new chat**. **Unarchive** (en su panel o en el aviso) lo vuelve normal.
- La confirmación ofrece **Archive and continue** cuando ningún chat continúa este todavía.
- **Pasa solo** cuando un chat se convierte en el chat anterior de otro: un enlace en el Canvas, Continue in a new chat, el aviso de arriba, o una elección en "Continues". Un aviso con Undo lo dice. Las ramas no son continuaciones y se quedan como están. Apágalo en la Library, engranaje "Litopys settings", "Archive the earlier chat when it is continued".
- Un chat de 100 mensajes o más que lleva una semana sin movimiento recibe una pequeña etiqueta "Long chat · archive?" en la lista y una pista en su panel. No se archiva nada por ti.

Para qué sirve: el chat anterior ya no cambia, así que su memoria se mantiene estable, y un chat nuevo que lo continúa lo lee como una historia terminada ([[litopys]]).

## Detalles que los capítulos dejaron fuera

Un capítulo es una narración, así que un pequeño detalle de un chat anterior puede haber desaparecido. En la Library, Litopys settings, "In the prompt", el interruptor **Word-for-word memories of earlier chats** (activado por defecto) permite que un chat que continúa otros recupere uno o dos pasajes de los mensajes originales cuando lo que se dice comparte palabras poco comunes con ellos ([[litopys]]). El chat anterior se indexa cuando pasa al Archive. Coincide por palabras, así que un detalle contado con otras palabras no se encuentra; el interruptor experimental **Also find old chapters by meaning** (apagado) reduce un poco esa brecha cuando usas embeddings: encuentra el capítulo por significado, pero un pasaje sigue necesitando una palabra poco común propia.

## Guardar una historia como libro

En la Library, Litopys, "Save as a book" copia los capítulos, arcos y hechos de un chat al estante del Data Bank para los chats que elijas: véase [[memory]].

## Revisar lo que recibió el modelo

Si un personaje olvida algo, abre Canvas > Prompt y cambia de "Parts" a "Memory": muestra qué hechos entraron y cuáles se dejaron fuera, y por qué. El botón **Fired** del encabezado del chat lo muestra para la última respuesta y para todo el chat.
