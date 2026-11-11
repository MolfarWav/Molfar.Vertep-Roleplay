<!-- source: f156e3f1ac93 -->
# World DM

El World DM es un director de juego para el mundo de un chat. Después de las respuestas lee la historia y guarda las personas, lugares y cosas que encuentra en el propio lorebook del chat, llamado el libro de mundo. En niveles más altos también mueve el mundo y envía eventos a la escena. Úsalo cuando quieras que el mundo se sienta vivo y coherente.

## Niveles

Ábrelo desde "World" en el encabezado del chat (en el teléfono, Menu, luego World), o desde la sección **World** del riel. Elige qué hace el DM:

- **Off**: sin eventos y sin dados. El libro de mundo aún se llena con la historia: cuando la escena nombra un lugar o cosa nueva, una llamada pequeña pregunta al DM model si lo registra.
- **Chronicler**: solo registra, y no añade eventos propios.
- **Living world**: facciones y amenazas se mueven fuera de escena. Las noticias pueden llegar a los personajes como rumor; nada se fuerza.
- **Director**: trae ganchos, complicaciones y visitantes a la escena, y la siguiente respuesta debe usarlos.
- **Antagonist**: consecuencias y presión dirigidas a lo que les importa a los personajes.
- **Total chaos**: cualquier cosa puede pasar, sea cual sea el género. Nunca reescribe la historia y espera a que terminen las escenas explícitas.

Por defecto el DM ya está activo en el nivel Chronicler en un chat de historia, desde su primera respuesta (no en un chat cuyas tarjetas son todas asistentes). Apágalo en el Overview de la hoja World si no lo quieres.

## Qué hace en cada turno

Se ejecuta después de las respuestas, cada N respuestas ("Run after every N replies"), o de inmediato con "World turn". Lee los mensajes nuevos y escribe o retira registros en el libro de mundo: personas, lugares, cosas y quién las tiene. Puedes dar a un registro de tipo Group o Place **Members** (las personas que pertenecen) en la pestaña World book; un hecho contado a ese grupo en Litopys es entonces conocido por cada uno de ellos ([[litopys]]). El DM no rellena Members por sí mismo. Desde Living world hacia arriba también mueve frentes y relojes, y puede preparar un evento que se añade a la siguiente respuesta. Con **Code** moviendo los relojes (World > Profiles > Options), cada N respuestas el código tira un d6 por cada frente: 1-2 nada, 3-4 un paso, 5-6 un paso y al DM se le dice que las noticias de ese frente pueden llegar a la historia. Dados opcionales (hoja World, Dice, desde Living world hacia arriba, apagados por defecto): antes de una respuesta, el código tira 2d6 y le dice al modelo cómo resulta una acción incierta, como Hint o Binding. La opción **Pacing check, %** (Dice details, apagada por defecto) añade una segunda tirada oculta para los momentos en que el personaje del usuario da un paso hacia la cercanía: qué tan bien sale depende de la comodidad, la confianza y el afecto del personaje, según el Dashboard, y el modelo lo interpreta como no preparado, dudoso, aceptando con nervios, o acogedor. Nunca bloquea una respuesta y nunca menciona los dados.

Cuesta una llamada de modelo extra cuando toca, en el "DM model (all chats)"; basta un modelo pequeño y barato. Una ejecución fallida se muestra en la hoja y en la Inbox, y el DM lee los mismos mensajes de nuevo la próxima vez.

Un perfil que juega desde un mazo de eventos muestra "New deck" cuando el mazo se agota. Al modelo se le piden de 8 a 12 eventos; si vuelven menos, el mazo se conserva tal como llegó y una advertencia dice que llegó corto, para que puedas construirlo de nuevo.

## Borrar o deslizar una respuesta

Borra una respuesta, o desliza hacia otra, y el DM retira lo que aprendió de la antigua: registros, relojes y un evento en espera vuelven a como estaban, el libro de mundo se vuelve a escribir, y el DM relee la historia desde ahí.

Los registros que cambiaste a mano se conservan, salvo que el DM cambiara después el mismo registro. Un registro que borraste sigue borrado. Borrar mensajes antiguos desde arriba, leer otros deslizamientos de una respuesta anterior y editar el texto de una respuesta no retira nada.

## Pestañas de la sección World

El engranaje junto al título de la lista de World abre **World settings**, en bloques plegables como los ajustes de Litopys: el modelo de juego (con un interruptor para cambiarlo solo para este World, el límite de respuestas y un botón de prueba), el modelo de construcción, el modelo de imagen, el interruptor de fondos y si se te avisa de los fallos. Un bloque plegado muestra en una línea lo que está configurado.

En el chat elegido: Overview (los mismos controles que la hoja), Places (un árbol de lugares, con una imagen de fondo por lugar), World book (leer, escribir, retirar o eliminar registros a mano), Runs (historial, tokens, errores), Start (redactar registros desde tarjetas o una entrevista corta), Backgrounds (planear y dibujar un conjunto de imágenes; con "Change the background by scene" activo, el Dashboard elige la adecuada; con "Draw places that have no picture" también activo (siempre aparece ahí, atenuado hasta que el cambio de escena y la generación de imágenes estén activos), un lugar al que se muda la historia y que no tiene imagen se dibuja en el momento con el modelo de imagen del World y se archiva en la carpeta; "Look of the pictures" acepta unas pocas palabras en inglés (por ejemplo `medieval fantasy, candlelight`) que se añaden a cada fondo dibujado para el chat, a un lugar dibujado en el momento o a un conjunto; el panel Display del chat tiene un enlace aquí). También **Profiles** y **Worlds**.

## Perfiles de mundo

Cada nivel es un perfil incorporado: los cinco guardan los prompts del DM, y puedes abrir uno, cambiar un bloque de prompt y revertirlo al valor por defecto. También puedes crear perfiles propios sobre un nivel. Un chat elige su perfil en la hoja DM. "Saved worlds" guarda los mundos que construiste y en los que inicias chats nuevos; "New world" construye uno antes de cualquier chat, desde tarjetas o una entrevista corta.

Relacionado: [[memory]], [[dashboard]]. Los artículos de Help *World profiles* y *Starting a world* tienen las pantallas.
