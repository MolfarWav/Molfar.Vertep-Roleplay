<!-- source: 49357def2936 -->
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

El DM ve cada registro por su nombre, pero solo lee completos los que tocan los mensajes nuevos: los que nombran, el lugar de la escena y lo que hay allí, las personas de la escena, los registros fijados y las personas que están a punto de volver. Así un libro con muchos registros sigue siendo barato. El DM puede cambiar o retirar cualquier registro de todos modos.

Un perfil que juega desde un mazo de eventos muestra "New deck" cuando el mazo se agota. Al modelo se le piden de 8 a 12 eventos; si vuelven menos, el mazo se conserva tal como llegó y una advertencia dice que llegó corto, para que puedas construirlo de nuevo.

## Personas que vuelven

Un amigo o familiar del lorebook de una tarjeta puede permanecer fuera de la historia durante cien mensajes, porque una entrada solo aparece cuando alguien dice el nombre. El DM hace volver a esas personas. Cuenta las respuestas desde la última vez que la persona estuvo en la escena (con el Dashboard activo, un nombre en el texto solo es una mención y no reinicia la cuenta; un amigo lejano que escribe o llama cuenta como si estuviera en la escena) y, cuando el silencio es largo (unas 15, 30 o 60 respuestas, según **People coming back > How often**; Normal es el valor por defecto en los chats nuevos), indica al modelo de escritura, con firmeza, que la persona debe aparecer en esa respuesta. Una tirada oculta de 2d6, junto con la duración del silencio y el peso de la persona, decide la magnitud del regreso: un mensaje, una llamada con una petición o alguien que llega con noticias. El modelo elige la forma; el DM comprueba que la persona haya aparecido y, si no, lo pide una vez más. Si el modelo de escritura solo menciona a la persona, el registro dice «only mentioned, not on stage» y no hay un segundo intento; tras un regreso de ese tipo, medio o grande, el siguiente llega después de la mitad de la pausa habitual y es al menos medio. Las personas de los lorebooks de las tarjetas se incorporan a la lista con **Take people from the cards' lorebooks** o mediante el interruptor de Start "People from the lorebooks". En el registro de una persona o facción puede establecer Relation, Weight y "Bring back automatically". Para verlo en funcionamiento, active **Show under the reply**: una pequeña marca indica quién volvió, por qué y cómo cayeron los dados; la tarjeta también muestra la lista con el silencio de cada persona y un historial de regresos.

## El libro de mundo y su limpieza

El panel World del chat tiene mosaicos para lo que guarda el DM: **People**, **Places**, **Factions** y **Things**, luego el **Archive** y los **Fronts** y **Runs**. Pulsa un mosaico para abrir el libro de mundo en ese tipo (un mundo construido con Start antes de la historia todavía hace una vez la pregunta de spoilers; un chat ya jugado se abre al instante). El libro es una lista con búsqueda por nombres, claves y texto, chips de color por tipo y tarjetas que pliegan su texto; Edit, Retire, Pin y Delete funcionan como antes. Una cosa puede tener un **reason** (una pista, algo oculto, una promesa, un regalo, un arma, algo por lo que la gente se pelea); el DM lo indica al registrarla, y puedes cambiarlo en el formulario.

Los hechos ya no son registros. Una costumbre, una ley o un trozo de historia pertenece al texto del lugar o de la facción que describe, y lo que la gente sabe o oculta pertenece a Litopys. Un libro que aún tiene notas antiguas muestra un aviso y un mosaico **Old notes**; en cada nota elige **Fold into…** un lugar o una facción (su texto crece con la nota) o **To the Litopys** (un hecho que todos conocen, hasta 300 caracteres).

El libro también se ordena solo. Cada 10 respuestas, una cosa que menos de 3 de las últimas 10 respuestas nombraron, que no pertenece a nadie (no la lleva tu personaje, ni un personaje de la tarjeta, ni una persona del libro, y no está en manos de un personaje en el Dashboard), que no está fijada y que no es una pista, algo oculto ni una promesa, pasa al **Archive**, fuera de la vista del modelo de historia. Vuelve cuando la historia la nombra dos veces, o cuando el DM la nombra de nuevo; también puedes pulsar **Wake**. La tarjeta **Tidying the book** tiene el interruptor, **Tidy now** (una pasada al instante; la primera pasada de un chat solo recoge la lista de cosas) y un registro de cada archivado y cada despertar con la cifra que lo decidió. Las personas, los lugares y las facciones nunca se archivan. Un registro que borras no lo vuelve a escribir el DM, y el DM sabe qué nombres quitaste.

## Borrar o deslizar una respuesta

Borra una respuesta, o desliza hacia otra, y el DM retira lo que aprendió de la antigua: registros, relojes y un evento en espera vuelven a como estaban, el libro de mundo se vuelve a escribir, y el DM relee la historia desde ahí.

Un evento es de un solo uso. El DM comprueba si la historia lo mostró, mirando todo lo que vino después de la respuesta que lo llevaba, también la parte que ya había leído. Si no, el evento se envía una vez más con la siguiente respuesta, salvo que la historia se haya mudado a otro lugar para entonces (un salto en el tiempo, una escena nueva): entonces se deja ir, para que un evento viejo no arrastre la historia hacia atrás.

Los registros que cambiaste a mano se conservan, salvo que el DM cambiara después el mismo registro. Un registro que borraste sigue borrado. Borrar mensajes antiguos desde arriba, leer otros deslizamientos de una respuesta anterior y editar el texto de una respuesta no retira nada.

## Pestañas de la sección World

El engranaje junto al título de la lista de World abre **World settings**, en bloques plegables como los ajustes de Litopys: el modelo de juego (con un interruptor para cambiarlo solo para este World, el límite de respuestas y un botón de prueba), el modelo de construcción, el modelo de imagen, el interruptor de fondos y si se te avisa de los fallos. Un bloque plegado muestra en una línea lo que está configurado.

En el chat elegido: Overview (los mismos controles que la hoja), Places (un árbol de lugares, con una imagen de fondo por lugar), World book (leer, escribir, retirar o eliminar registros a mano), Runs (historial, tokens, errores), Start (redactar registros desde tarjetas o una entrevista corta), Backgrounds (planear y dibujar un conjunto de imágenes; con "Change the background by scene" activo, el Dashboard elige la adecuada; con "Draw places that have no picture" también activo (siempre aparece ahí, atenuado hasta que el cambio de escena y la generación de imágenes estén activos), un lugar al que se muda la historia y que no tiene imagen se dibuja en el momento con el modelo de imagen del World y se archiva en la carpeta; "Look of the pictures" acepta unas pocas palabras en inglés (por ejemplo `medieval fantasy, candlelight`) que se añaden a cada fondo dibujado para el chat, a un lugar dibujado en el momento o a un conjunto; el panel Display del chat tiene un enlace aquí). También **Profiles** y **Worlds**.

## Perfiles de mundo

Cada nivel es un perfil incorporado: los cinco guardan los prompts del DM, y puedes abrir uno, cambiar un bloque de prompt y revertirlo al valor por defecto. También puedes crear perfiles propios sobre un nivel. Un chat elige su perfil en la hoja DM. Los chats nuevos empiezan con el Chronicler a menos que pulses **Make default** en otro perfil (la pestaña Profiles, en la cabecera del perfil): obtiene una etiqueta *Default* y cada chat nuevo empieza con su nivel, sus números y sus prompts; los chats que ya tienes conservan los suyos, y el DM "off" se elige por chat y no puede ser el valor por defecto. "Saved worlds" guarda los mundos que construiste y en los que inicias chats nuevos; "New world" construye uno antes de cualquier chat, desde tarjetas o una entrevista corta.

Relacionado: [[memory]], [[dashboard]]. Los artículos de Help *World profiles* y *Starting a world* tienen las pantallas.
