<!-- source: 96ce37dc065d -->
# El panel de la escena

El panel es un panel junto al chat que sigue la escena: quién está presente, cómo se siente cada personaje hacia ti, qué llevan puesto y qué saben, los hilos argumentales abiertos. Es para cualquiera que quiera que la historia recuerde relaciones y detalles entre respuestas. El artículo de ayuda *Scene dashboard* enumera sus campos.

## Qué sigue

Ábrelo haciendo clic en un retrato del chat y eligiendo Dashboard. El panel lateral tiene cuatro pestañas: **Person** (actitud, ánimo y estado, atuendo y cosas: qué llevan puesto, qué sostienen y cargan, y qué hay cerca), **Here** (lugar, tiempo, quién está presente), **Quests** (los hilos abiertos: principal, secundario, cotidiano) y **Notes** (el cuaderno: qué sabe un personaje, y si lo vio, lo oyó o lo supuso). La "Constellation" nombra cómo se sitúa un personaje hacia ti, por ejemplo Friendship o Romance. Un número en una pestaña cuenta los cambios desde tu última respuesta (en rojo cuando algo bajó). La vista amplia también tiene un Journal con el pensamiento y los recuerdos de un personaje. En un teléfono el mismo contenido se abre como una hoja.

**Una persona listada dos veces.** Si el panel muestra a la misma persona bajo dos nombres (digamos "Sina" y "Sina Rose"), abre uno de ellos y usa el pequeño botón de personas en el encabezado de Person, luego "Same person as..." y elige el otro. Se te pregunta primero: las notas, el historial y las cosas pasan a la persona que elegiste, sus números de relación se mantienen, el nombre se convierte en otro nombre suyo, y no se puede deshacer. El panel también sugiere posibles duplicados por su cuenta: un cuadro en la parte superior de la pestaña Person (y una etiqueta "Possible duplicate" en "Since your last reply") dice "X may be the same person as Y" con el motivo. "Merge into Y" hace lo mismo que el menú; "Different people" los mantiene separados y el panel deja de sugerir ese par. El mismo menú tiene "Remove from the Dashboard" para un nombre que simplemente está mal.

Un personaje que está en contacto desde otro lugar (un mensaje, una carta, una llamada, un vídeo) se marca así en la línea de la escena, con una frase corta más sobre lo que le llega: por mensaje o carta solo las palabras enviadas; por llamada solo la voz y los sonidos cerca del teléfono; por vídeo solo lo que está en la cámara y lo que se oye cerca de ella. Una acción silenciosa, como poner la tetera al fuego, no la conoce.

Los números (confianza, comodidad, atracción, respeto, afecto, y más) los calcula el código a partir de eventos que reporta un modelo, y se inclinan según el [[soul]] de cada personaje. El estado se guarda por mensaje, así que un swipe o un mensaje borrado nunca deja números obsoletos.

El botón "Story, move" junto a Send prepara un empujón de una sola vez para la próxima respuesta; su flecha elige una misión abierta o un giro.

## Qué cambió, en el chat

Bajo la respuesta más reciente, una línea atenuada dice lo que el panel registró para ella: "Changed: Ada · trust fell, mood calm → tense, +2". Tócala para desplegar las mismas etiquetas que la fila "Since your last reply" del panel; una etiqueta abre la pestaña correspondiente del panel (en un teléfono, su hoja inferior). Las respuestas más antiguas no muestran nada, y la línea espera mientras se escribe una respuesta o el panel todavía se está actualizando. Para ocultarla, desactiva "Show what changed under the newest reply" en Settings > Chat Behavior.

## Vínculos entre personajes

El sensor anota cómo se sitúan entre sí dos personajes que no eres tú, como un rol de una palabra y una calidez de una palabra ("rival, cold"). El prompt de la respuesta lleva hasta cuatro de estos como una línea corta, solo para las personas en la escena. La respuesta propia de un personaje recibe solo los vínculos de los que ese personaje forma parte; un narrador recibe primero los vínculos de las personas de las que trata el turno.

## Qué dijo un personaje, y las mentiras

Bajo el cuaderno de una persona, la lista **Said** guarda las cosas fuertes que dijo y de las que se le responsabiliza: una promesa, una amenaza, una confesión, una orden. Una mentira también se guarda ahí, tapada hasta que elijas "Show hidden".

Cuando un personaje miente delante de otros, los otros lo toman como verdad. Sus siguientes respuestas lo tratan como algo que les dijeron y que no tienen motivo para dudar, hasta que la historia muestre lo contrario. Solo se engaña a las personas que estaban en la escena, y solo en sus propias respuestas: si habla otro, no repite la mentira.

Abre una mentira y verás **Believe it:** con un botón para cada persona que todavía se la cree. Pulsa un nombre cuando esa persona lo haya descubierto. El menú de la fila también tiene **This was a lie** para una afirmación que el sensor no marcó como tal (las personas en la escena entonces se la creen), y **Not a lie** cuando el sensor se equivocó. El sensor termina la creencia por su cuenta cuando una respuesta muestra que sale la verdad. Quitar la mentira de la lista quita con ella todas las creencias.

> El narrador da voz a todos en una sola respuesta, así que siempre sabe la verdad. Esto solo evita que un personaje actúe según lo que sabe otro.

## Cuándo se actualiza

El botón "Settings" dentro del panel abre sus ajustes; la pestaña Sensor tiene el modo:

- **Sensor** (por defecto): después de cada respuesta un modelo lee los mensajes nuevos y reporta lo que pasó.
- **Fast: inside the story reply**: para modelos potentes. El modelo de la historia escribe el reporte él mismo al final de su respuesta, sin una llamada aparte, añadiendo algunos tokens a cada respuesta. Si omite el reporte, se ejecuta el sensor habitual.
- **Manual**: solo se actualiza cuando pulsas "Refresh".

## Qué cuesta

En modo Sensor, una llamada extra al modelo por respuesta, en el "Sensor model" (el modelo del chat si lo dejas vacío). Un modelo barato y pequeño es suficiente. Lee los mensajes nuevos enteros (hasta unos 12000 caracteres en conjunto; una respuesta más larga solo pierde el medio), y el código primero marca las frases que parecen ropa, vestirse o un beso y apunta el modelo hacia ellas, así una falda mencionada una vez en medio de una respuesta larga igual llega al atuendo. Si una tarjeta de personaje tiene una línea "Attire:", también se le muestra al sensor como referencia para la redacción exacta de una prenda que el texto menciona (nunca añade una prenda que el texto no muestra). Lo que un personaje lleva puesto y sostiene se guarda como una lista de objetos; una prenda que se rompe o se ensucia sigue siendo un objeto. Cada cosa mantiene una identidad dondequiera que vaya: puesta, quitada junto a la puerta, entregada a otra persona. Las cosas dejadas en un lugar se quedan ahí: cuando la historia vuelve a la cafetería, la taza sigue en la mesa. Cuando la historia no ha mostrado lo que alguien lleva puesto durante unas seis intervenciones, se le pide al modelo de escritura que lo mencione, brevemente. Para añadir palabras de un idioma que el escaneo no conoce, lístalas en `data/dashboard/lexicon.json` (`{"wear": ["..."], "touch": ["..."]}`); `{"off": true}` apaga el escaneo. El panel también añade un breve "Prompt insert" a lo que lee el modelo de la historia, para que los personajes sepan en qué punto están: puedes desactivarlo y fijar "Tokens per character". "What the model sees" en los ajustes muestra el insert.

## Cómo desactivarlo

No hay un interruptor de apagado aparte en las pantallas aquí listadas. Pon el modo en "Manual" y nunca llama a un modelo por su cuenta. Para quitarlo del todo, desactiva el plugin Dashboard en el botón Plugins de Molfar Vertep; Tools > Plugins en Roleplay solo lista lo que se ejecuta. Desactiva "Prompt insert" si quieres que se quede fuera de la petición.

## Relacionado

[[soul]] lo alimenta; [[litopys]] usa sus notas; [[memory]] lo compara con los otros tipos de memoria.
