<!-- source: f1a3e4ba962c -->
# Agentes y la forja de agentes

Un agente es un pequeño ayudante que construyes a partir de tarjetas y cables. Después de una respuesta, lee una parte del chat, puede hacerle a un modelo una o varias preguntas breves, toma sus propias notas y muestra algo: una nota bajo la respuesta, botones para tocar, un medidor, un mapa o una pista para la siguiente respuesta. Ejemplos: tres próximos movimientos sugeridos, un medidor de tensión, un mapa de los lugares visitados. Esta página es para quienes desean esos extras. Todavía no hay artículo de Help para agentes.

## De qué está hecho un agente

Un agente son datos, no código. En el editor es un tablero de **tarjetas** unidas por **cables**:

- una tarjeta de **Entrada** dice qué puede leer el agente (la última respuesta, el historial del chat, la tarjeta del personaje, la persona, la nota del autor, los hechos de Litopys, las entradas del libro de saber);
- las tarjetas **Preguntar al modelo** hacen una pregunta a un modelo y toman la respuesta como texto libre, sí o no, o unos pocos campos con nombre;
- tarjetas de lógica y tarjetas que funcionan en código sin modelo: dados, elegir una línea, cortar o extraer texto;
- tarjetas para la **memoria** propia del agente (números, texto, sí/no, listas), guardadas por chat y aparte del Dashboard;
- una tarjeta de **Salida** que muestra un resultado: "Una nota bajo la respuesta", "Botones para tocar", un valor de estado, o una pista colocada en el siguiente prompt.

Los **paneles** (medidores, contadores, tablas, un tablero de fichas) muestran lo que el agente guarda; nada en un panel se ejecuta, y sus botones solo ponen texto en la caja de mensaje.

Cuándo se ejecuta se define por agente: antes de la respuesta, con ella, después de ella, o a mano; cada N respuestas; o solo cuando aparecen palabras elegidas.

## Agentes listos

Pulsa "New agent" en el tablero Agents del **Canvas** (el elemento **Agents** del riel lo abre). "Empty agent" da una Entrada y una nota. "Start from a ready agent" ofrece seis que funcionan: Next moves, Pacing nudge, Story map, Scene recap, Territory board y Tension meter. Bajo "Drafts" están los agentes que Molfar escribió en tu espacio de trabajo ("Drafts from Molfar").

## El editor

Los cambios se guardan como borrador un momento después de que te detienes. Tres pestañas: Card (la tarjeta seleccionada), Agent (nombre, cuándo se ejecuta, su memoria, paneles) y Try. Una marca muestra "Passes the check", el número de problemas y advertencias, y "N model calls per run". No puedes instalar con problemas pendientes. "Export as a file" guarda un archivo que puedes compartir. La hoja del chat "Install and manage agents..." tiene "Install an agent file" para traer uno.

## Prueba

La pestaña Try ejecuta un turno inventado sin tocar nada. Cambias las entradas, y los cables del tablero muestran qué se mueve; sin modelo, cada tarjeta "Ask the model" usa una respuesta de ejemplo que puedes editar. Bajo "A real chat" elige un chat y "Fill from this chat" para cargar lo que el agente recibiría de verdad. "Run with the model" entonces pregunta al modelo real con la pregunta real: hasta N llamadas, tokens reales, y nada se guarda en el chat ni en el agente.

## Instalar, permitir, activar en un chat

1. Pulsa "Install" ("Update" para una copia modificada de un agente instalado; usa "Edit a copy" para cambiar uno).
2. Permítelo una vez: "Review permissions", luego "Allow all" o línea por línea. Se ejecuta cuando cada línea está activa. Una actualización que pide más espera un nuevo Allow.
3. Añádelo a un chat. En la píldora del encabezado del chat abre la pestaña **Agents**: "In this chat" lista los agentes activos, "Installed" lista el resto (elige uno para añadirlo). Una fila puede ejecutarse de nuevo ahora, eliminarse o dejar de esperar la respuesta. Un chat nuevo no tiene agentes hasta que añades algunos o eliges un conjunto.

Un **conjunto** es una lista de agentes con nombre ("Save this chat's list as a set"; "Make default" lo da a los chats nuevos). El tablero "Agent sets" del Canvas muestra el costo en tiempo y llamadas de cada conjunto, y contiene el interruptor "Agents' notes in chats" que oculta las notas de cada agente. El lugar de resultado de cada agente puede cambiarse en la pestaña Agents del chat, entre los lugares que le convienen.

Cada tarjeta "Ask the model" es una llamada por ejecución; el editor muestra el número. "Every Nth reply" divide el costo.
