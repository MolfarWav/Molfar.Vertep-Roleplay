<!-- source: 4bee02775a17 -->
# Sprites y ventanas de sprites

Los sprites son pequeñas imágenes de un personaje, una por emoción, que aparecen sobre el chat y cambian a medida que avanza la historia. Esta página es para quien quiera ver varios personajes a la vez, en un grupo o con una tarjeta de narrador, o montar un aspecto de novela visual.

## Qué es una ventana de sprites

Una ventana de sprites flota sobre el chat y muestra **un personaje**. Elige la imagen a partir de las últimas líneas de ese propio personaje (con las mismas reglas de palabras clave de antes; no se llama a ningún modelo), y la imagen se queda hasta que el personaje vuelve a hablar. Una tarjeta de narrador que escribe sus personajes como líneas ("Aria: ...") da a cada uno sus propias líneas; una que escribe prosa ("Aria laughs with joy") da a cada uno las frases que los nombran, y cuando estas no muestran emoción, decide el mensaje entero. Arrastra una ventana donde quieras, arrastra su esquina inferior para cambiar el tamaño (doble clic en la esquina para volver al tamaño por defecto) y pulsa **×** para plegarla en una pequeña ficha redonda; pulsa la ficha para recuperarla.

Los sprites se añaden a una tarjeta en el editor, pestaña **More**, **Sprites**. Ajustes tiene un interruptor, "Expression Sprites", que apaga todas las ventanas.

## Una ventana o varias

Un chat nuevo tiene una ventana que sigue a **quien habla**, como siempre. Pulsa el engranaje de una ventana para abrir **Sprite windows**:

- **Add window** (hasta 8). Una ventana nueva muestra "Next in the scene".
- **Shows**, por ventana: "Whoever speaks", "Next in the scene" o un personaje concreto (un miembro del grupo o una voz de una tarjeta de narrador).
- **Transparent background**, por ventana: sin marco y sin fondo, solo la imagen. Los clics la atraviesan hasta el texto del chat, así que una ventana así se mueve con el pequeño asa de su esquina superior izquierda.
- **Visible part**: un control deslizante del 35 % al 100 % (100 % por defecto). Con menos del 100 % solo se ve la parte superior de cada imagen, de modo que las piernas quedan cortadas (de cintura para arriba, o un busto al 40 %); la altura de la ventana es entonces la parte que se ve, y la imagen se dibuja más grande para ello. Junto con la franja bajo el texto, esto da el aspecto de novela visual y deja al chat casi toda su altura.
- **Windows are**: "In front of the text" (por defecto), "Behind the text" (el texto del chat se dibuja sobre las imágenes, que quedan debajo; cada mensaje recibe un fondo del color de la página para que siga siendo legible, y el control **Text backing** ajusta su intensidad de 0 % a 100 %, 55 % por defecto; los botones de una ventana se vuelven tenues y la ventana se mueve con su asa) o "In a strip under the text" (el chat reserva bajo su texto una franja para las ventanas, así que ningún texto queda debajo de una imagen; las ventanas se quedan entonces abajo y solo se mueven hacia los lados, y la franja tiene la altura de la ventana más alta). Esto es para tabletas y ordenadores; un teléfono las mantiene delante.
- **Arrange**: "Row at the bottom" (el aspecto de novela visual) o "Grid". Solo colocan las ventanas; a partir de ahí las arrastras tú.
- **Hide empty windows**.
- **Back to one window**.

La disposición se guarda **por chat, en este navegador**. No pasa a otro dispositivo.

## Quién está "en la escena"

Las ventanas "Next in the scene" muestran a las personas de la escena que no son quien habla, y un personaje **conserva su ventana** mientras se queda: nadie salta a otra ventana cuando habla otra persona. Cuando un personaje sale de la escena, su ventana queda en blanco ("Nobody here") o desaparece si "Hide empty windows" está activado, y el siguiente que llega ocupa una ventana libre.

La escena es la lista "Present" del Dashboard cuando el Dashboard ha leído la historia (véase [[dashboard]]). Sin él, la escena son quienes hablaron en los últimos seis mensajes.

## Atuendos

Un personaje con más de un atuendo recibe en la ventana un pequeño selector de atuendo. La elección se guarda para el chat y es independiente para cada miembro de un grupo.

## En un teléfono

Un teléfono muestra **una ventana**, y todo se queda por encima de la caja de mensaje, dondequiera que crezca:

- **La imagen deja pasar los toques.** Un deslizamiento sobre ella desplaza el chat. La ventana se mueve con el asa de su esquina superior izquierda, y el engranaje (ajustes), **×** (plegar) y la esquina (cambiar el tamaño) están siempre visibles. La ventana se queda entera en la pantalla y por encima de la caja de mensaje; si no cabe, baja.
- **La fila encima de la caja de mensaje** tiene **Auto** y a todos los de la escena como pequeñas imágenes redondas. El personaje que está en la ventana tiene un anillo. Toca otro para mostrarlo ahí: un alfiler en su imagen significa que la ventana se queda en él. Toca el que tiene el alfiler, o **Auto**, y la ventana vuelve a seguir a quien habla.
- **Mientras escribes**, la ventana y la fila se apartan, y vuelven cuando la caja de mensaje está vacía o la dejas.
- Una ventana plegada es una pequeña ficha redonda: tócala y la ventana se abre donde está la ficha, atraída de vuelta a la pantalla.

Las ventanas transparentes, la disposición y las ventanas adicionales son para tabletas y ordenadores.

## Lo que no hace

No dibuja nada y no lee la historia con un modelo: un personaje sin sprites no tiene ventana, y un personaje que nunca ha hablado muestra su imagen por defecto. Un miembro del grupo sin sprites se omite.
