<!-- source: 36f23a51ff05 -->
# El Dashboard de la escena

El Dashboard es un panel junto al chat que sigue la escena: quién está presente, qué siente cada personaje por ti, qué lleva puesto y qué sabe, los hilos abiertos de la historia. Es para quien quiere que la historia recuerde relaciones y detalles entre respuestas. El artículo de Help *Scene dashboard* enumera sus campos.

## Qué sigue

Ábrelo haciendo clic en un retrato del chat y eligiendo Dashboard. El panel lateral tiene cuatro pestañas: **Person** (actitud, ánimo y estado, atuendo y cosas), **Here** (lugar, clima, quién está presente), **Quests** (los hilos abiertos: principales, secundarios, cotidianos) y **Notes** (el cuaderno: qué sabe un personaje, y si lo vio, lo oyó o lo adivinó). La "Constellation" indica cómo se sitúa un personaje ante ti, por ejemplo Friendship o Romance. Un número en una pestaña cuenta los cambios desde tu última respuesta (rojo cuando algo bajó). La vista amplia también tiene un Journal con el pensamiento y los recuerdos de un personaje. En el teléfono, el mismo contenido se abre como hoja.

**Una persona listada dos veces.** Si el Dashboard muestra a la misma persona con dos nombres (digamos "Sina" y "Sina Rose"), abre uno de ellos y usa el pequeño botón de personas en el encabezado de Person, luego "Same person as..." y elige el otro. Antes se te pregunta: las notas, el historial y las cosas pasan a la persona que elegiste, sus números de relación se mantienen, el nombre se convierte en otro nombre suyo, y no se puede deshacer. El Dashboard también sugiere por sí mismo duplicados probables: una caja en la parte superior de la pestaña Person (y una etiqueta "Possible duplicate" en "Since your last reply") dice "X may be the same person as Y" con el motivo. "Merge into Y" hace lo mismo que el menú; "Different people" las mantiene separadas y el Dashboard deja de sugerir ese par. El mismo menú tiene "Remove from the Dashboard" para un nombre que simplemente está mal.

Los números (confianza, comodidad, atracción, respeto, afecto y más) los calcula el código a partir de los eventos que informa un modelo, y se inclinan según el [[soul]] de cada personaje. El estado se guarda por mensaje, de modo que un deslizamiento o un mensaje borrado nunca deja números obsoletos.

El botón "Story, move" junto a Send arma un empujón de una sola vez para la siguiente respuesta; su flecha elige una misión abierta o un giro.

## Qué cambió, en el chat

Bajo la respuesta más reciente, una línea discreta dice lo que el Dashboard registró para ella: "Changed: Ada · trust fell, mood calm → tense, +2". Tócala para desplegar las mismas fichas de la fila "Since your last reply" del Dashboard; una ficha abre la pestaña correspondiente del Dashboard (en el teléfono, su hoja inferior). Las respuestas anteriores no muestran nada, y la línea espera mientras se escribe una respuesta o el Dashboard aún se actualiza. Para ocultarla, desactiva "Show what changed under the newest reply" en Settings > Chat Behavior.

## Vínculos entre personajes

El sensor anota cómo se relacionan dos personajes que no son tú, como un papel de una palabra y una calidez de una palabra ("rival, cold"). La solicitud de la respuesta lleva hasta cuatro de estos en una sola línea corta, solo para las personas de la escena. La respuesta de un personaje recibe solo los vínculos en los que participa; un narrador recibe primero los vínculos de las personas de las que trata el turno.

## Lo que dijo un personaje, y las mentiras

Bajo el cuaderno de una persona, la lista **Said** guarda las cosas fuertes que dijo y a las que se atiene: un juramento, una amenaza, una confesión, una orden. Una mentira también se guarda ahí, oculta hasta que eliges "Show hidden".

Cuando un personaje miente delante de otros, ellos la toman por verdad. Sus siguientes respuestas tratan eso como algo que les contaron y no tienen motivo para dudar, hasta que la historia muestre lo contrario. Solo se engaña a quienes estaban en la escena, y solo en sus propias respuestas: si otro habla, no repite la mentira.

Abre una mentira y verás **Believe it:** con un botón por cada persona que aún la cree. Pulsa un nombre cuando esa persona se haya enterado. El menú de la fila también tiene **This was a lie** para una afirmación que el sensor no marcó como mentira (las personas de la escena entonces la creen), y **Not a lie** cuando el sensor se equivocó. El sensor termina la creencia por sí mismo cuando una respuesta muestra que la verdad sale a la luz. Quitar la mentira de la lista quita con ella cada creencia.

> El narrador da voz a todos en una respuesta, así que siempre conoce la verdad. Esto solo impide que un personaje actúe según lo que sabe otro personaje.

## Cuándo se actualiza

El botón "Settings" dentro del Dashboard abre su configuración; la pestaña Sensor tiene el modo:

- **Sensor** (predeterminado): después de cada respuesta, un modelo lee los mensajes nuevos e informa lo que pasó.
- **Fast: inside the story reply**: para modelos potentes. El modelo de la historia escribe el informe él mismo al final de su respuesta, sin llamada aparte, y añade algunos tokens a cada respuesta. Si lo omite, se ejecuta el sensor habitual.
- **Manual**: se actualiza solo cuando pulsas "Refresh".

## Qué cuesta

En modo Sensor, una llamada de modelo extra por respuesta, con el "Sensor model" (el modelo del chat si lo dejas vacío). Basta un modelo pequeño y barato. Lee los mensajes nuevos completos (hasta unos 12000 caracteres en conjunto; una respuesta más larga pierde solo la parte central), y el código marca primero las frases que parecen ropa, vestirse o un beso y las señala al modelo, de modo que una falda nombrada una vez en medio de una respuesta larga aún llega al atuendo. Si una tarjeta de personaje tiene una línea "Attire:", el sensor la recibe también como referencia para la redacción exacta de una prenda que el texto menciona (nunca añade una prenda que el texto no muestra). Lo que un personaje viste y sostiene se guarda como una lista de objetos; una prenda que se rasga o se ensucia sigue siendo un solo objeto. Cada cosa conserva una identidad allí donde vaya: puesta, quitada junto a la puerta, entregada a otra persona. Las cosas dejadas en un lugar se quedan allí: cuando la historia vuelve al café, la taza sigue en la mesa. Cuando la historia no ha mostrado durante unos seis turnos lo que alguien lleva puesto, se le pide al modelo de escritura que lo mencione, brevemente. Para añadir palabras de un idioma que el escaneo no conoce, ponlas en `data/dashboard/lexicon.json` (`{"wear": ["..."], "touch": ["..."]}`); `{"off": true}` apaga el escaneo. El Dashboard también añade un "Prompt insert" breve a lo que lee el modelo de la historia, para que los personajes sepan dónde están: puedes apagarlo y fijar "Tokens per character". "What the model sees" en la configuración muestra el inserto.

## Cómo apagarlo

No hay un interruptor de apagado separado en las pantallas listadas aquí. Pon el modo en "Manual" y nunca llamará a un modelo por sí solo. Para quitarlo del todo, desactiva el plugin Dashboard en el botón Plugins de Molfar Vertep; Tools > Plugins en Roleplay solo lista lo que corre. Apaga "Prompt insert" si quieres que quede fuera de la solicitud.

## Relacionado

[[soul]] lo alimenta; [[litopys]] usa sus notas; [[memory]] lo compara con las otras clases de memoria.
