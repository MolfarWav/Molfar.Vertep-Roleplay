<!-- source: 0c2ff8467612 -->
# Agentes y la forja de agentes

Un agente es un pequeño ayudante que construyes a partir de tarjetas y cables. Lee una parte del chat (antes o después de una respuesta, como prefieras), puede hacerle a un modelo una o varias preguntas breves, guarda sus propias notas y muestra algo: una nota bajo la respuesta, botones para tocar, un medidor, un mapa o una pista para la siguiente respuesta. Ejemplos: tres próximos movimientos sugeridos, un medidor de tensión, un mapa de los lugares visitados. Esta página es para quienes quieren esos extras. El Help tiene tres artículos sobre el editor: "Agent editor: how an agent works", "Agent editor: the cards" y "Agent editor: three ready agents".

## De qué está hecho un agente

Un agente son datos, no código. En el editor es un tablero de **tarjetas** unidas por **cables**:

- una tarjeta **Input** dice qué puede leer el agente (la última respuesta, el historial del chat, la tarjeta del personaje, la persona, la nota del autor, los hechos de Litopys, las entradas del lorebook);
- las tarjetas **Ask the model** hacen una pregunta a un modelo y toman la respuesta como texto libre, sí o no, o unos pocos campos con nombre;
- tarjetas de lógica (una tarjeta If solo se dispara cuando su respuesta cambia a Yes, solo una vez, o con una pausa tras dispararse, y sus reglas pueden preguntar si un valor cambió desde la última ejecución; el registro de ejecución dice por qué respondió) y tarjetas que trabajan en código sin modelo: dados, elegir una línea, cortar o extraer texto;
- una tarjeta **Script**: unas pocas líneas de JavaScript que escribes, con `(input, seed)` de entrada y un objeto simple de salida, con entradas y salidas tipadas. Corre en un entorno aislado del motor (sin reloj, sin internet, sin archivos, unos medio segundo y 16 MB) y necesita un motor de la versión 1.10.1 o posterior; un motor más antiguo hace fallar al agente con un mensaje simple;
- tarjetas para la **memoria** propia del agente (números, texto, sí/no, listas), guardada por chat y aparte del Dashboard;
- una tarjeta **Output** que muestra un resultado: "A note under the reply", "Buttons to tap", un valor de estado, o una pista colocada en el siguiente prompt.

Los **paneles** (medidores, contadores, tablas, un tablero de fichas) muestran lo que el agente guarda; nada en un panel se ejecuta, y sus botones solo ponen texto en la caja de mensaje.

Cuándo se ejecuta es un carril. El archivo del agente indica en qué carril empieza, y cada chat puede pasarlo a otro (la pestaña Agents del chat, o el tablero "Agent sets" del Canvas). Los cuatro carriles:

- **Before the reply**: la respuesta espera al agente, y la pista que deja entra en esa misma respuesta. Manténlo en una o dos preguntas rápidas, porque la espera se suma a cada respuesta. El interruptor Wait de la fila del agente desactiva la espera; entonces el agente corre junto a la respuesta.
- **Beside the reply**: corre al mismo tiempo, no añade espera y no puede poner una pista en la respuesta junto a la que corre (las notas, los botones y los paneles sí funcionan).
- **After the reply**: el carril habitual para notas, rastreadores y medidores.
- **By hand**: corre solo cuando pulsas el botón de ejecutar de su fila.

Además del carril, un agente puede correr en cada N respuestas o solo cuando aparecen palabras elegidas. Las palabras se buscan en los dos últimos mensajes, salvo que el agente indique otra cosa: la pestaña Agent tiene "Look back this many messages" (de 1 a 50) en cuanto hay palabras definidas.

## Agentes listos

Pulsa "New agent" en el tablero Agents del **Canvas** (el elemento **Agents** del riel lo abre). "Empty agent" da una tarjeta Input y una nota. "Start from a ready agent" ofrece diez que funcionan: Next moves, Pacing nudge, Story map, Scene recap, Territory board, Tension meter, Character growth (propone cómo ha cambiado el personaje, para la pestaña Memory de la tarjeta; ver la página de memoria), Repetition guard, Canon guard y Ledger (descritos abajo). Bajo "Drafts" están los agentes que Molfar escribió en tu espacio de trabajo ("Drafts from Molfar").

### Repetition guard, Canon guard y Ledger

Tres agentes listos para problemas con los que se topan las historias largas. Activa cada uno por chat, como cualquier agente, y lee sus permisos antes de concederlos.

- **Repetition guard** evita que un modelo reutilice sus propias palabras. Después de cada respuesta, un script (sin llamada al modelo, así que no cuesta nada en un modelo gratuito) lee las últimas seis respuestas del personaje y encuentra frases de tres a cinco palabras que comparten dos respuestas, y comienzos de frase usados tres veces. Pone como máximo cinco frases en el siguiente prompt: "Do not reuse these phrases from earlier replies: ..." (unos 40 a 80 tokens). Funciona con cirílico igual que con latino. Un chat sin repeticiones no recibe ninguna pista. Lee el historial del chat y ejecuta código.
- **Canon guard** detecta una respuesta que contradice la tarjeta del personaje o los hechos que registró Litopys (aspecto, nombres, lugares, cosas que alguien posee). Cada tres respuestas lee las últimas tres respuestas, la tarjeta y hasta 30 hechos, y consulta al modelo una vez. Cuando encuentra una contradicción, deja una nota bajo la respuesta, que termina con un recordatorio de actualizar el hecho en Litopys si la historia realmente cambió, y un botón sobre el cuadro de mensaje que escribe "(OOC: ...)" con la corrección; tú decides si la envías. Nunca reescribe una respuesta ni cambia una tarjeta o un hecho, y muestra cada problema una sola vez. Necesita un chat de un solo personaje con hechos de Litopys; sin alguno de los dos, no hace nada en silencio.
- **Ledger** lleva los números de los que vive un juego de recursos: dinero, existencias, un tesoro con ingresos por día, cuentas atrás ("llegada en 4 días"). El modelo solo informa de lo que cambió; un script hace todas las sumas y avanza los días. Una tabla aparece en una ventana flotante, y a la siguiente respuesta se le dicen los números reales para que no invente ninguno. Solo números, nunca objetos. Corrige un número tú mismo escribiendo (ledger: gold = 500) o (ledger: remove gold) en tu mensaje; (ledger: timer Castle = 4) y (ledger: gold per day = 50) también funcionan. Consulta al modelo una vez por respuesta, pero solo cuando la respuesta o tu mensaje contiene un dígito, un número en palabras o una palabra de tiempo (día, semana, noche, mañana, en inglés, ucraniano y ruso); una respuesta sin ninguno no cuesta nada, y los números siguen entrando en el prompt. Hasta 12 filas.

## El editor

Los cambios se guardan como borrador un momento después de dejar de escribir. Tres pestañas: Card (la tarjeta seleccionada), Agent (nombre, cuándo se ejecuta, su memoria, paneles) y Try. Una comprobación muestra "Passes the check", el número de problemas y advertencias, y "N model calls per run". No puedes instalar con problemas pendientes. "Export as a file" guarda un archivo que puedes compartir. La hoja "Install and manage agents..." del chat tiene "Install an agent file" para traer uno.

### Las opciones de la tarjeta If

Una tarjeta If responde Yes, No o Unknown según sus reglas, y por sí sola dice Yes en cada ejecución mientras se cumplan las reglas. Bajo las reglas, **When it answers Yes** cambia eso: "Every time" (el predeterminado), "Only when it turns Yes" (se dispara en el paso de no Yes a Yes, y de nuevo solo después de que la respuesta haya vuelto atrás), u "Only once in this chat". **Pause after it fires (runs)** salta tantas ejecuciones del agente después de un Yes, de 0 a 50. Una ejecución es un turno del agente, así que un agente que corre cada tercera respuesta hace que una pausa de 2 dure seis respuestas. Una regla también puede usar "changed since the last run": Yes cuando el valor es distinto al de la última ejecución. En el formulario, cada regla elige **What the rule reads**: un valor que conectas con un cable, un valor del Dashboard, el chat (número de mensajes, quién habló último) o un dado de World DM (Fate, Life o Pacing: si puso una nota en esta respuesta, y cuál fue el resultado). Leer un dado necesita el permiso "Read what the World DM’s dice said for the last reply", y solo funciona con un agente que corre después de la respuesta. Solo se retiene un Yes; No y Unknown siguen saliendo. El agente lo recuerda por chat, y "start over" en el agente lo olvida. La pestaña Try muestra por qué respondió una tarjeta (la regla, el valor que leyó, el resultado) y, cuando retuvo un Yes, qué opción lo retuvo; el registro del agente bajo una respuesta guarda las mismas líneas.

## Prueba

La pestaña Try ejecuta un turno inventado sin tocar nada. Cambias las entradas, y los cables del tablero muestran qué se mueve; sin modelo, cada tarjeta "Ask the model" usa una respuesta de ejemplo que puedes editar. Bajo "A real chat" eliges un chat y pulsas "Fill from this chat" para cargar lo que el agente recibiría de verdad. "Run with the model" pregunta entonces al modelo real con la pregunta real: hasta N llamadas, tokens reales, y nada se guarda en el chat ni en el agente.

Un agente con una tarjeta Script que se queda sin tiempo tres ejecuciones seguidas en un chat queda en paz allí: la pestaña Agents dice que está en pausa (cada ejecución así costaría los 2,5 segundos del script). Arregla el script y pulsa **Run again**; una ejecución que funcione termina la pausa. Las fichas del tablero de territorio son botones: toca una y su lugar va a la caja de mensaje (no se envía nada). Una tarjeta de lista también se puede poner en "Change an entry, or add it if there is none", para que algo dicho dos veces no llene la lista.

## Instalar, permitir, activar en un chat

1. Pulsa "Install" ("Update" para una copia cambiada de un agente instalado; usa "Edit a copy" para modificar uno).
2. Permítelo una vez: "Review permissions", luego "Allow all" o línea por línea. Corre cuando todas las líneas están activas. Una actualización que pide más espera a un nuevo Allow. Una tarjeta Script pide "Run its own small program"; la lista de permisos muestra su código ("Read the code") antes de que lo permitas, y si una actualización cambia el código, el permiso se vuelve a pedir.
3. Añádelo a un chat. En la píldora del encabezado del chat abre la pestaña **Agents**: "In this chat" lista los agentes activos, "Installed" lista el resto (elige uno para añadirlo). Una fila puede volver a ejecutarse ahora, eliminarse o dejar de hacer esperar la respuesta. Un chat nuevo no tiene agentes hasta que añades algunos o eliges un conjunto.

Un **conjunto** es una lista con nombre de agentes ("Save this chat's list as a set"; "Make default" se lo da a los chats nuevos). El tablero "Agent sets" del Canvas muestra el costo en tiempo y en llamadas de cada conjunto, y contiene el interruptor "Agents' notes in chats" que oculta las notas de todos los agentes. El lugar de resultado de cada agente se puede cambiar en la pestaña Agents del chat, entre los lugares que le convienen.

Cada tarjeta "Ask the model" es una llamada por ejecución; el editor muestra el número. "Every Nth reply" divide el costo.

**Cuánto cuesta, antes de activarlo.** La página de permisos y la tarjeta del agente en la hoja Agents muestran una estimación para una ejecución: las llamadas y, más o menos, cuántos tokens entran y, como máximo, cuántos salen. La pestaña Agents añade una línea con el total por respuesta para los agentes activos en el chat, con "Every Nth reply" ya repartido. Se calcula a partir de los archivos de los agentes (la longitud de sus preguntas, lo que leen, sus límites de respuesta), no de tu chat, por eso dice "about": las cifras reales dependen del chat y del modelo. Un agente que no consulta ningún modelo lo indica.

**Dónde va una pista.** Una tarjeta Output de tipo pista ("prompt-insert") tiene "Position in the prompt": después del historial (por defecto, al final del último mensaje del jugador), al principio del prompt del sistema o al final. Una pista en el prompt del sistema pesa más para el modelo, así que mantenla corta. Es el mismo permiso que cualquier pista.
