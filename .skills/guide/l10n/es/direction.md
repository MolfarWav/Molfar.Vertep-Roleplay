<!-- source: 3b04df871946 -->
# Direction: quién está en la escena

Direction es para chats grupales. Después de cada respuesta, un modelo "director" pequeño y barato lee la escena y dice qué tipo de escena es (una lección, un descanso, un momento a solas, una cita) y qué miembros están en ella. Los miembros que no están dejan de responder y quedan fuera del prompt hasta que la historia los traiga de vuelta.

## La barra

En un chat grupal hay una barra delgada debajo de la barra de miembros, marcada "Direction" (en un teléfono solo el ícono). De izquierda a derecha:

- **The scene chip**: el tipo de escena y quién está aquí ("Alone moment, with Yuzu" o "Lesson, 4 here"). Tócalo para ver quién está aquí y quién no está en la escena, cuándo se hizo el último informe, y un botón **Report now** que le pregunta al director de nuevo. Mientras el director lee, el chip dice "Reading the scene…".
- **The model chip**: el modelo del director. Si no hay ninguno seleccionado, muestra **Pick a model**. Tócalo para la misma lista de modelos que tiene la barra superior del chat: modelos destacados, luego cada modelo por conexión, con un cuadro de búsqueda.
- **The switch**: Direction activado o desactivado para este chat. Hasta que se seleccione un modelo, está atenuado y dice "Pick a model first".
- **Log**: los últimos informes (el tipo de escena, quién estaba aquí, cuánto tiempo tomó, cuántos tokens), y cada interruptor, bloqueo, liberación y error, del más nuevo al más antiguo.

Con el interruptor apagado, la barra se pliega a "Direction: off" y el chat funciona como antes.

## Elegir el modelo

Hay un modelo director para todos los chats y todos los grupos. Elígelo desde cualquier barra, o en la pestaña **Direction** del grupo. No hay valor predeterminado: tú eliges. Un modelo pequeño y rápido es suficiente: cuesta una llamada corta después de cada respuesta.

Un nuevo chat grupal comienza con Direction activado tan pronto como se selecciona un modelo. Los chats que ya tenías no se modifican. Cada chat tiene su propio interruptor.

## Quién está ausente

Un chip de miembro cambia cuando alguien está fuera de la escena: la imagen se atenúa y lleva una pequeña marca de puerta. Una marca de candado significa que el bloqueo (abajo) los dejó fuera. Toca un chip: su ventana emergente dice "Here" o "Not in the scene".

Un miembro ausente no toma turnos por sí mismo, y su tarjeta no se envía al modelo: solo una línea dice que no está en la escena. Nombrarlos en tu mensaje aún los llama. Cuando el director los vea de vuelta, su tarjeta completa regresa.

## El bloqueo y el regreso

Para mantener una escena con una persona, toca un chip de miembro y elige **Only <name> in the scene**. Aparece un chip "Only Yuzu" antes del chip de escena, y los demás se quedan fuera diga lo que diga el director. Toca la x en ese chip, o **Release the lock** en la ventana emergente de un miembro, para soltarlo. En la siguiente respuesta, se les dice a los demás que pueden regresar y se le pide a la historia que les dé una forma de entrar.

## Si el director falla

Si la respuesta del director no se puede leer, o la llamada falla, el chip de escena dice **No report**; ábrelo para ver por qué. El chat entonces usa la idea del Dashboard de quién está aquí, o deja que todos respondan como antes. Nada en tu historia se pierde.

## Nuevos grupos

**New group** abre una ventana amplia (pantalla completa en un teléfono). Ponle nombre al grupo, o deja el nombre en blanco para usar los primeros tres miembros. Busca, reduce con **All**, **Favourites** y **Recent**, chips de etiqueta y un orden (Name, Recently used, Most chats), y toca los retratos para elegir. Los miembros elegidos se sientan en una fila arriba en orden de habla; las flechas mueven uno más temprano o más tarde, la x elimina. **Next** necesita dos personajes.

Después de **Next**, el grupo se crea y su editor se abre con una nota: verifica cómo funciona, luego inicia el primer chat. **Start chat** es el botón principal. La pestaña **Direction** establece si los nuevos chats de este grupo comienzan con Direction activado, y muestra el modelo del director. Un grupo en la página Groups abre el mismo editor, y también lo hace el nombre del grupo en la parte superior de su chat.

Cuando inicias un chat posterior de un grupo, el paso corto antes del chat tiene un interruptor **Direction**: activado cuando el valor predeterminado del grupo está activado y se ha seleccionado un modelo.

Ver también [[characters]] y [[dashboard]].