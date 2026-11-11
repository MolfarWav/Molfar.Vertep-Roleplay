<!-- source: 45efabb467af -->
# Tu primera historia

Este es el camino más corto desde un Roleplay vacío hasta una historia en marcha, y una lista de lo que ocurre solo para que nada te sorprenda. Primero necesitas una conexión de modelo: véase [[vertep:models]].

## Pasos

1. **Consigue una tarjeta.** En Home pulsa "New character" y escribe una, o "Import card" para traer una tarjeta PNG o JSON desde un archivo. También puedes buscar en la sección Marketplace, o pulsar "With Molfar" para que Molfar redacte una tarjeta a partir de tu idea. Véase [[characters]].
2. **Guárdala.** El editor de tarjetas mantiene los cambios en un borrador hasta que pulsas "Save changes".
3. **Elige una persona** (a quién interpretas) en la sección Personas, o conserva la predeterminada. "Use this persona" la hace tu predeterminada.
4. **Inicia un chat.** Pulsa "New chat" en la tarjeta. El chat se abre con el primer mensaje de la tarjeta.
5. **Revisa el modelo.** La píldora del encabezado del chat tiene una pestaña Model; elegir un modelo allí cambia solo este chat.
6. **Escribe.** Bajo cada respuesta puedes pasar entre otras versiones (deslizamientos); la flecha derecha en la última versión pide una nueva. Para rehacer una respuesta con dirección, usa "Regenerate with a hint" en el menú "+". Para dirigir la respuesta hacia lo que escribes, pon la instrucción entre dobles corchetes dentro del mensaje, por ejemplo `Entro. [[Aria oculta un secreto.]]`: el modelo lo lee como una acotación escénica, no como algo que dijiste tú (el menú "+" tiene "Stage direction" para escribir los corchetes por ti). El botón "More" de un mensaje ofrece editar, bifurcar, vistazo al prompt y más.

## Qué funciona solo

Una vez que el chat tiene respuestas, los ayudantes de fondo trabajan, cada uno con sus propias llamadas de modelo:

- El Dashboard lee la escena después de cada respuesta ([[dashboard]]).
- Litopys escribe un capítulo cuando se cierra una escena ([[litopys]]).
- El World DM, en su nivel activo más bajo (Chronicler), registra personas y lugares en un libro para este chat ([[world-dm]]).
- Una tarjeta sin soul recibe una propuesta automática de soul ([[soul]]).

Los fallos de estos trabajos se listan en la Inbox.

## Si el modelo es pequeño, lento o pagado por llamada

Los ahorros más baratos, en orden:

1. En "Settings" del Dashboard, pon el modo en "Manual" (así solo se actualiza cuando pulsas Refresh), o elige un modelo pequeño como "Sensor model".
2. En "Litopys settings" de la Library, baja "Memory size" o apaga "Chapters and facts".
3. En la hoja World, elige el nivel "Off" (aun así hace una llamada pequeña cuando la escena nombra un lugar nuevo) o elige un "DM model (all chats)" barato.
4. En la configuración del Dashboard, apaga "Rate characters automatically".
5. En el Canvas, el tablero Prompt muestra cada parte de la siguiente solicitud con sus tokens, y te deja apagar partes para un chat.

Una historia que ha crecido mucho necesita sus propias medidas: ver [[long-chats]].

Los modelos gratuitos con ventanas de contexto pequeñas funcionan mejor con un dashboard Manual y una memoria Compact.

## Siguiente

[[memory]] explica las clases de memoria; [[settings]] dice dónde se configura todo.
