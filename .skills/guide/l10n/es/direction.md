<!-- source: 2128e30a104f -->
# Direction: quién está en la escena

Direction es para chats grupales. Después de cada respuesta, un modelo "director" pequeño y barato lee la escena y dice qué tipo de escena es (una lección, un descanso, un momento a solas, una cita) y qué miembros están en ella. Los miembros que no están dejan de responder y quedan fuera del prompt hasta que la historia los devuelve.

## La barra

En un chat grupal hay una barra delgada debajo de la barra de miembros, marcada "Direction" (en un teléfono, solo el icono). De izquierda a derecha:

- **The scene chip**: el tipo de escena y quién está aquí ("Alone moment, with Yuzu" o "Lesson, 4 here"). Los retratos del Dashboard se atenúan para los miembros que dice que no están en la escena. Tócalo para ver quién está aquí y quién no está en la escena, cuándo se hizo el último informe, y un botón **Report now** que vuelve a preguntarle al director. Mientras el director lee, el chip dice "Reading the scene…".
- **The model chip**: el modelo del director. Si no hay ninguno seleccionado, muestra **Pick a model**. Tócalo para ver la misma lista de modelos que tiene la barra superior del chat: modelos destacados, luego cada modelo por conexión, con un cuadro de búsqueda.
- **The switch**: Direction activado o desactivado para este chat. Hasta que se seleccione un modelo, aparece atenuado y dice "Pick a model first".
- **Next**: un chip que aparece mientras una regla de género o un beat de tu plan tiene una nota esperando la siguiente respuesta ("Next: Yuzu"). La x la omite.
- **Rules**: abre la hoja de Direction con tres pestañas, **Rules**, **Plan** y **Log**. Está junto al interruptor, así que sigue visible en un teléfono (allí es solo un icono, con un punto mientras las reglas están activas).

Con el interruptor apagado, la barra se pliega a "Direction: off" y el chat funciona como antes.

## Reglas de género

Un género es un conjunto de pequeñas reglas que traen a la gente a la escena por azar, para que una historia de ese género no se estanque. Abre **Rules** y elige un género de la lista. Hay nueve: **School rom-com**, **Harem**, **Slice of life**, **Drama**, **Thriller**, **Detective**, **Steamy romance**, **Adventure** y **Horror**. Cada una tiene tres reglas, construidas con los mismos pocos tipos de condición (a solas con un miembro durante algunas respuestas, nadie cerca durante algunas respuestas, la escena es de cierto tipo, solo unos pocos presentes) y las mismas tres acciones (alguien entra en el momento, alguien se une, alguien vuelve). La tarjeta de una regla dice en una frase lo que hace. Por ejemplo, School rom-com tiene:

- **Interrupted moment**: llevas tres respuestas a solas con un miembro, y alguien entra y os interrumpe.
- **Someone comes by**: nadie ha estado cerca durante tres respuestas (no en casa), y un miembro pasa por allí.
- **Friends join the break**: en un descanso, la comida o el club con uno o dos presentes, se une un amigo.

Un género también le indica al director qué tipos de escena buscar. Todos reciben los habituales (lección, descanso, comida, club, de camino, salida, cita, momento a solas, en casa, evento); un género añade algunos propios, como peligro, investigación, discusión, secreto, noche, viaje, trabajo, comida o tiempo libre. Un chat sin género, o con School rom-com, solo ve los habituales, así que para él nada cambia. Como en todo Direction, ninguna regla se dispara en una escena explícita. Los números de cada género son primeras estimaciones.

Un chat empieza sin género y con las reglas apagadas, así que nada cambia hasta que eliges uno. Elegir un género enciende las reglas; **Rules in this chat** las apaga de nuevo y conserva el género. Las reglas necesitan que el director esté activado: leen sus informes.

Después de cada respuesta, el código (no un modelo) revisa las reglas en orden. Una regla puede dispararse cuando se cumplen sus condiciones, no está en reposo y una tirada de dos dados llega a su número. Si se dispara, la siguiente respuesta recibe una breve nota de escena ("Yuzu walks in on you and Hana and interrupts the moment") y la persona cuenta como presente, así que su tarjeta se envía completa. Como máximo una nota por respuesta. El bloqueo, un regreso después del bloqueo, y un evento o una persona que vuelve desde World van primero; la regla espera entonces a otro turno.

Cada tarjeta de regla muestra su estado: **Ready**, **Cooling down** (respuestas que quedan) o **Quiet for the payoff**, y cuántas veces se ha disparado hacia el desenlace. **Numbers** abre sus ajustes:

- **2d6 needed**: la tirada debe alcanzar este número; el texto al lado indica el porcentaje de tiradas ("about 42%"). 2 siempre se dispara, 13 nunca.
- **Cooldown**: respuestas durante las que la regla se queda en silencio después de dispararse.
- **Payoff every** y **Then quiet**: cada K-ésima vez que se dispara, la regla descansa M respuestas más ("finally alone"). 0 desactiva el desenlace.

**Fire now** pone la nota de la regla en la siguiente respuesta sin tirada, sin enfriamiento y sin contar hacia el desenlace; hace falta que alguien esté fuera. **Skip** descarta una nota en espera. Una nota que omites o una respuesta que borras se olvidan, con su enfriamiento; deslizar la respuesta que llevaba una nota le da al nuevo intento la misma nota.

Bajo la respuesta que llevó una nota, una pequeña línea dice lo que pasó: "Direction: Mei joins (Friends join the break, 2d6 = 10, needed 9) · came". La última palabra es el informe posterior del director: **came** (están en la escena), **only mentioned** (solo se mencionó) o **did not come** (no llegó). La pestaña **Log** muestra lo mismo con la tirada y el motivo, además de las reglas que tiraron y fallaron.

Un grupo puede fijar un **default genre** en su pestaña **Direction**; sus chats nuevos empiezan con ese género activado. Los números son primeras estimaciones: cámbialos en un chat si una regla se dispara demasiado o muy poco.

**Who comes.** Cada tarjeta de regla tiene una opción **Who comes**: **Members** (el valor por defecto: alguien del grupo, el que lleva más tiempo fuera), **World people** (una persona del World de este chat, como un profesor o un vecino que la historia ya tiene) o **Either** (una moneda decide cuando existen ambos). Las personas del World vienen del libro World del chat; se dejan fuera las que están retiradas, las que están configuradas para no volver por su cuenta, y las que ya están en la escena. Sin personas en el World, las otras dos opciones aparecen atenuadas y dicen por qué. La nota de la siguiente respuesta dice quién es la persona, en una frase de su ficha, y que no es uno de los miembros del grupo; nadie aquí tiene su tarjeta, así que el modelo que escribe la interpreta a partir de esa frase. Una persona que solo está en el banquillo y no en tu grupo puede interrumpir, unirse o pasar por allí de esta forma.

## El plan

Un **beat** es algo que quieres que ocurra: "Suena el timbre y la clase se vacía en el pasillo", "Mei trae un pastel". Abre **Plan** y pulsa **Add beat**. Un beat tiene:

- **What happens**: una o dos frases, como acotación escénica.
- **Who takes part** (opcional): los miembros que están fuera entran en la escena por él. En **People from the World** también puedes elegir personas que la historia ya tiene (un profesor, un rival); la nota le dice al modelo que escribe quiénes son. Las personas se eligen del libro World del chat, así que no hay nada que elegir hasta que tenga alguna.
- **When**: **After some replies** (contadas desde el momento en que el beat pasa a ser el siguiente; 0 significa de inmediato), **Scene** (cuando el director lee ese tipo de escena: una lección, un descanso, una cita...), **Place** (cuando el lugar del Dashboard contiene tus palabras, como "roof"; no distingue mayúsculas) o **By hand** (solo cuando pulsas **Fire now**).
- **Wait for a new scene**: activado por defecto. Un beat que toca no corta en medio de un momento: espera hasta 6 respuestas a que la historia cambie de lugar o salte en el tiempo, y luego sale de todos modos. Un beat de lugar sale en el momento en que la historia llega allí, y un beat **By hand** solo cuando lo disparas.

No tienes que escribir cada beat desde cero. **From the genre** (junto a **Add beat**) lista beats ya hechos del género del chat ("A rumour about the two of them starts going around the school"); al elegir uno se abre el editor rellenado, añades quién participa y guardas. Necesita un género elegido en **Rules**. **Draft from the cards** pide al modelo del director, una sola vez, que lea las tarjetas de los miembros (y el género, si hay uno) y sugiera de cinco a ocho beats en orden, basados en quiénes son estos personajes. Tarda de unos segundos a un minuto. Las sugerencias se abren en una tarjeta **Draft** con una marca en cada una: desmarca las que no quieras y pulsa **Add** para poner el resto al final del plan. Nada se guarda hasta que añades; al cerrar la hoja el borrador se descarta, y un beat que ya esté en tu plan no se vuelve a sugerir. El borrador es tan bueno como el modelo del director; edita los beats después como cualquier otro.

El plan va **en orden**: solo se mira el primer beat que no está terminado; los que vienen detrás dicen "After the beats before it". Un beat está terminado cuando ya ocurrió, cuando se abandonó (el director lo vio omitido dos veces) o cuando lo **Skip**eas. El siguiente beat cuenta sus respuestas desde que terminó el anterior. Cada tarjeta indica en qué punto está su beat: **Waiting** (respuestas que quedan), **Due, waiting for a new scene** (respuestas que quedan), **Goes with the next reply**, **Delivered** (came, only mentioned, o entró cuando nadie fue nombrado), **Did not land**, **Skipped**. Si algo retiene un beat, la tarjeta dice por qué: Direction está apagado, la escena está bloqueada o la escena es explícita (un beat nunca se dispara en una; sale cuando la escena la deja). **Edit**, **Move up**, **Move down** y **Delete** cambian la lista; **Fire now** pone el beat en la siguiente respuesta de inmediato, sea lo que sea lo que esté esperando.

Un beat usa la misma maquinaria que una regla de género: después de cada respuesta, el código revisa el plan antes que las reglas; la nota viaja con la siguiente respuesta (una nota por respuesta; el bloqueo, un regreso después del bloqueo, y un evento o una persona que vuelve desde World van primero, y el beat vuelve a intentarse en la siguiente respuesta), y el informe posterior del director dice si **came**, si fue **only mentioned** o si el beat **did not land**. Como el director solo conoce a los miembros del grupo, en la única respuesta que lleva una nota con personas de World también se le pregunta si esas personas están en la escena; cada una de las demás respuestas se lee como antes. Un beat que no aterrizó se intenta una vez más con una nota más estricta, y luego se abandona. Una respuesta que deslizas le da al nuevo intento la misma nota; una respuesta que borras devuelve su beat.

## Elegir el modelo

Hay un único modelo director para todos los chats y todos los grupos. Elígelo desde cualquier barra o en la pestaña **Direction** del grupo. No hay valor predeterminado: tú eliges. Un modelo pequeño y rápido basta: cuesta una llamada corta después de cada respuesta.

Un nuevo chat grupal empieza con Direction activado en cuanto se selecciona un modelo. Los chats que ya tenías no se tocan. Cada chat tiene su propio interruptor.

## Quién está ausente

Un chip de miembro cambia cuando alguien está fuera de la escena: la imagen se atenúa y lleva una pequeña marca de puerta. Una marca de candado significa que el bloqueo (abajo) lo dejó fuera. Toca un chip: su ventana emergente dice "Here" o "Not in the scene".

Un miembro ausente no toma turnos por su cuenta, y su tarjeta no se envía al modelo: solo una línea dice que no está en la escena. Nombrarlo en tu mensaje sigue llamándolo. Cuando el director lo ve de vuelta, su tarjeta completa regresa.

## El bloqueo y el regreso

Para mantener una escena con una sola persona, toca un chip de miembro y elige **Only <name> in the scene**. Aparece un chip "Only Yuzu" antes del chip de escena, y los demás se quedan fuera pase lo que pase con el director. Toca la x de ese chip, o **Release the lock** en la ventana emergente de un miembro, para soltarlo. En la siguiente respuesta, a los demás se les dice que pueden volver y se le pide a la historia que les dé una vía de entrada.

## Si el director falla

Si la respuesta del director no se puede leer, o la llamada falla, el chip de escena dice **No report**; ábrelo para ver por qué. El chat usa entonces la idea que tiene el Dashboard de quién está aquí, o deja que todos respondan como antes. Nada de tu historia se pierde.

## Nuevos grupos

**New group** abre una ventana amplia (pantalla completa en un teléfono). Ponle nombre al grupo, o deja el nombre en blanco para usar los tres primeros miembros. Busca, reduce con **All**, **Favourites** y **Recent**, usa chips de etiqueta y un orden (Name, Recently used, Most chats), y toca los retratos para elegir. Los miembros elegidos aparecen en una fila arriba en orden de habla; las flechas mueven uno antes o después, la x quita. **Next** necesita dos caracteres.

Después de **Next**, el grupo se crea y su editor se abre con una nota: revisa cómo se comporta y luego inicia el primer chat. **Start chat** es el botón principal. La pestaña **Direction** decide si los chats nuevos de este grupo empiezan con Direction activado, y muestra el modelo del director. Un grupo en la página de grupos abre el mismo editor, igual que el nombre del grupo en la parte superior de su chat.

Cuando inicias un chat posterior de un grupo, el paso breve antes del chat tiene un interruptor **Direction**: activado cuando el valor predeterminado del grupo está encendido y hay un modelo seleccionado.

Ver también [[characters]] y [[dashboard]].
