<!-- source: 045cbad8d708 -->
# Canvas: enlaces entre chats, el prompt y los agentes

Canvas es la mesa de trabajo técnica de Roleplay: una sola pantalla con tableros, donde ves y cambias cómo se conectan los chats y qué envía cada chat al modelo. No lo necesitas para jugar. Ábrelo cuando una historia necesite una secuela, cuando una respuesta te sorprenda o cuando construyas agentes.

Elige un tablero con el interruptor **Board** de arriba: **Chat links**, **Prompt**, **Agents** y **Agent sets**. El elemento Agents del riel abre el mismo Canvas en su tablero de Agents. Se recuerda el tablero que usaste por última vez.

## Enlaces entre chats

Un mapa de tus chats. Cada chat es una tarjeta. Una línea de un chat a otro significa "este chat continúa aquel": la historia del chat anterior viaja como trasfondo en las respuestas del chat posterior, dentro del presupuesto de trasfondo que fija la Library. Los tres chats anteriores más cercanos se leen completos y los más antiguos se condensan ([[long-chats]]). Una línea continua es una continuación. Una línea discontinua es una rama bifurcada desde un mensaje.

- Los chats que no has puesto en el tablero esperan en la lista de la izquierda (**Chats**). Arrastra uno al tablero, o usa **Put on the board** (con **its linked chats** para traer toda la cadena). Arrastra una tarjeta de vuelta a la lista, o usa **Remove**, para quitarla del tablero. El chat en sí sigue en la Library.
- Activa **Edit** para conectar o desconectar tarjetas. Un enlace que haría un bucle, uniría un chat consigo mismo o repetiría uno existente se rechaza, y el tablero dice por qué. Están **Undo** y **Redo**. **Fit** encuadra todo el grafo.
- En el teléfono el tablero se abre en **View**, con una **List** de enlaces. Construir un grafo es más fácil en una pantalla grande, pero también puedes editar los enlaces en la lista.

El mapa de un chat en la Library muestra la misma cadena, solo para ver. Su botón **Edit on canvas** te trae aquí.

## Prompt

Elige un chat para ver la solicitud que le envía al modelo. El tablero tiene dos vistas: **Parts** y **Memory**.

- **Parts** enumera cada parte de la solicitud: el prompt principal, la tarjeta del personaje, la persona, las entradas de lorebook, el diálogo de ejemplo, las secciones del preset y el historial, cada una con su conteo de tokens y su estado. Una parte puede estar desactivada en el preset, desactivada para este chat, vacía, o no aplicar a este tipo de respuesta. Puedes desactivar una parte solo para este chat sin tocar el preset. **Only what is sent** oculta el resto, y el total muestra lo que recibe el modelo.
- **Memory** explica por qué la memoria puso lo que puso en la última respuesta: [[memory]] tiene la descripción completa.

Para una vista más rápida de solo lo que se activó en la última respuesta, usa el botón **Fired** del encabezado del chat. La vista Memory y **Fired** leen el mismo registro; Fired también cuenta sobre todo el chat.

## Agentes y Agent sets

La forja de agentes: construye un agente, pruébalo y agrúpalos en conjuntos. Véase [[agents]].

## Lo que se queda como está

Desactivar una parte en el tablero Prompt se aplica solo a ese chat. El preset y las tarjetas no cambian.
