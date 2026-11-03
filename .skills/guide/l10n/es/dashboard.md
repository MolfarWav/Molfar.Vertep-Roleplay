<!-- source: 6095bc511c69 -->
# El Dashboard de la escena

El Dashboard es un panel junto al chat que sigue la escena: quién está presente, qué siente cada personaje por ti, qué lleva puesto y qué sabe, los hilos abiertos de la historia. Es para quien quiere que la historia recuerde relaciones y detalles entre respuestas. El artículo de Help *Scene dashboard* enumera sus campos.

## Qué sigue

Ábrelo haciendo clic en un retrato del chat y eligiendo Dashboard. El panel lateral tiene cuatro pestañas: **Person** (actitud, ánimo y estado, atuendo y cosas), **Here** (lugar, clima, quién está presente), **Quests** (los hilos abiertos: principal, secundario, cotidiano) y **Notes** (el cuaderno: qué sabe un personaje, y si lo vio, oyó o adivinó). La "Constellation" nombra cómo se sitúa un personaje ante ti, por ejemplo Friendship o Romance. Un número en una pestaña cuenta los cambios desde tu última respuesta (rojo cuando algo cayó). La vista amplia también tiene un Journal con el pensamiento y los recuerdos de un personaje. En el teléfono el mismo contenido se abre como hoja.

Los números (confianza, comodidad, atracción, respeto, afecto y más) los calcula el código a partir de los eventos que un modelo informa, y se inclinan por el [[soul]] de cada personaje. El estado se guarda por mensaje, de modo que un deslizamiento o un mensaje eliminado nunca deja números obsoletos.

El botón "Story, move" junto a Send arma un empujón de una sola vez para la siguiente respuesta; su flecha elige una misión abierta o un giro.

## Cuándo se actualiza

El botón "Settings" dentro del Dashboard abre su configuración; la pestaña Sensor tiene el modo:

- **Sensor** (predeterminado): después de cada respuesta, un modelo lee los mensajes nuevos e informa qué pasó.
- **Fast: inside the story reply**: para modelos fuertes. El modelo de la historia escribe el informe él mismo al final de su respuesta, sin llamada aparte, añadiendo algunos tokens a cada respuesta. Si omite el informe, corre el sensor habitual.
- **Manual**: se actualiza solo cuando pulsas "Refresh".

## Qué cuesta

En modo Sensor, una llamada de modelo extra por respuesta, en el "Sensor model" (el modelo del chat si lo dejas vacío). Basta un modelo pequeño y barato. El Dashboard también añade un "Prompt insert" corto a lo que lee el modelo de la historia, para que los personajes sepan cómo están: puedes apagarlo y fijar "Tokens per character". "What the model sees" en la configuración muestra el inserto.

## Cómo apagarlo

No hay un interruptor de apagado separado en las pantallas aquí listadas. Pon el modo en "Manual" y nunca llama a un modelo por sí solo. Para eliminarlo del todo, desactiva el plugin Dashboard en el botón Plugins de Molfar Vertep; Tools > Plugins en Roleplay solo lista lo que se ejecuta. Apaga "Prompt insert" si quieres que quede fuera de la solicitud.

## Relacionado

[[soul]] lo alimenta; [[litopys]] usa sus notas; [[memory]] lo compara con las otras clases de memoria.
