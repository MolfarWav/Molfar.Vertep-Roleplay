<!-- source: ec7d17369d16 -->
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

Además del carril, un agente puede correr en cada N respuestas o solo cuando aparecen palabras elegidas.

## Agentes listos

Pulsa "New agent" en el tablero Agents del **Canvas** (el elemento **Agents** del riel lo abre). "Empty agent" da una tarjeta Input y una nota. "Start from a ready agent" ofrece seis que funcionan: Next moves, Pacing nudge, Story map, Scene recap, Territory board y Tension meter. Bajo "Drafts" están los agentes que Molfar escribió en tu espacio de trabajo ("Drafts from Molfar").

## El editor

Los cambios se guardan como borrador un momento después de dejar de escribir. Tres pestañas: Card (la tarjeta seleccionada), Agent (nombre, cuándo se ejecuta, su memoria, paneles) y Try. Una comprobación muestra "Passes the check", el número de problemas y advertencias, y "N model calls per run". No puedes instalar con problemas pendientes. "Export as a file" guarda un archivo que puedes compartir. La hoja "Install and manage agents..." del chat tiene "Install an agent file" para traer uno.

### Las opciones de la tarjeta If

Una tarjeta If responde Yes, No o Unknown según sus reglas, y por sí sola dice Yes en cada ejecución mientras se cumplan las reglas. Bajo las reglas, **When it answers Yes** cambia eso: "Every time" (el predeterminado), "Only when it turns Yes" (se dispara en el paso de no Yes a Yes, y de nuevo solo después de que la respuesta haya vuelto atrás), u "Only once in this chat". **Pause after it fires (runs)** salta tantas ejecuciones del agente después de un Yes, de 0 a 50. Una ejecución es un turno del agente, así que un agente que corre cada tercera respuesta hace que una pausa de 2 dure seis respuestas. Una regla también puede usar "changed since the last run": Yes cuando el valor es distinto al de la última ejecución. En el formulario, cada regla elige **What the rule reads**: un valor que conectas con un cable, un valor del Dashboard, el chat (número de mensajes, quién habló último) o un dado de World DM (Fate, Life o Pacing: si puso una nota en esta respuesta, y cuál fue el resultado). Leer un dado necesita el permiso "Read what the World DM’s dice said for the last reply", y solo funciona con un agente que corre después de la respuesta. Solo se retiene un Yes; No y Unknown siguen saliendo. El agente lo recuerda por chat, y "start over" en el agente lo olvida. La pestaña Try muestra por qué respondió una tarjeta (la regla, el valor que leyó, el resultado) y, cuando retuvo un Yes, qué opción lo retuvo; el registro del agente bajo una respuesta guarda las mismas líneas.

## Prueba

La pestaña Try ejecuta un turno inventado sin tocar nada. Cambias las entradas, y los cables del tablero muestran qué se mueve; sin modelo, cada tarjeta "Ask the model" usa una respuesta de ejemplo que puedes editar. Bajo "A real chat" eliges un chat y pulsas "Fill from this chat" para cargar lo que el agente recibiría de verdad. "Run with the model" pregunta entonces al modelo real con la pregunta real: hasta N llamadas, tokens reales, y nada se guarda en el chat ni en el agente.

## Instalar, permitir, activar en un chat

1. Pulsa "Install" ("Update" para una copia cambiada de un agente instalado; usa "Edit a copy" para modificar uno).
2. Permítelo una vez: "Review permissions", luego "Allow all" o línea por línea. Corre cuando todas las líneas están activas. Una actualización que pide más espera a un nuevo Allow. Una tarjeta Script pide "Run its own small program"; la lista de permisos muestra su código ("Read the code") antes de que lo permitas, y si una actualización cambia el código, el permiso se vuelve a pedir.
3. Añádelo a un chat. En la píldora del encabezado del chat abre la pestaña **Agents**: "In this chat" lista los agentes activos, "Installed" lista el resto (elige uno para añadirlo). Una fila puede volver a ejecutarse ahora, eliminarse o dejar de hacer esperar la respuesta. Un chat nuevo no tiene agentes hasta que añades algunos o eliges un conjunto.

Un **conjunto** es una lista con nombre de agentes ("Save this chat's list as a set"; "Make default" se lo da a los chats nuevos). El tablero "Agent sets" del Canvas muestra el costo en tiempo y en llamadas de cada conjunto, y contiene el interruptor "Agents' notes in chats" que oculta las notas de todos los agentes. El lugar de resultado de cada agente se puede cambiar en la pestaña Agents del chat, entre los lugares que le convienen.

Cada tarjeta "Ask the model" es una llamada por ejecución; el editor muestra el número. "Every Nth reply" divide el costo.
