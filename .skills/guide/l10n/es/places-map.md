<!-- source: af1ee8acca9e -->
# El mapa de lugares

El mapa de lugares es un pequeño mapa flotante sobre el chat. Muestra cada lugar que la historia ha nombrado, los caminos que la historia ha recorrido entre ellos y dónde estás ahora. Es para cualquiera que juegue con el World DM y quiera ver el mundo en el que está. No cuesta ninguna llamada al modelo.

## Dónde está

Un chat muestra un botón redondo de mapa, abajo a la izquierda de la columna del chat, cuando el libro del mundo del chat tiene al menos un lugar (ver [[world-dm]]). Púlsalo para abrir el mapa; pulsa **×** en el mapa para plegarlo de nuevo en el botón. Puedes arrastrar el botón y la ventana a cualquier sitio, y arrastrar la esquina inferior para redimensionar la ventana (doble clic en la esquina para el tamaño predeterminado). La ventana se queda donde la dejaste, por chat, en este navegador. Ajustes tiene un interruptor, "Places Map", que oculta el botón en todas partes.

Un mundo que se construyó antes de la historia (a partir de cartas, una receta o la biblioteca) puede contener lugares que la historia aún no te ha mostrado, así que el mapa hace la misma pregunta que la sección World antes de mostrarlos.

En un teléfono, el mapa abierto es un panel que se apoya sobre la caja de mensajes. Mientras está abierto, la ventana del sprite y la fila de personajes se apartan; mientras escribes, el mapa también se aparta y vuelve cuando la caja está vacía.

## Qué hay en él

- **Un tablero punteado.** Arrastra el tablero vacío para desplazarte, pellizca o usa la rueda para hacer zoom, **+**, **−** y el botón de las esquinas (Show all places) en la cabecera. Los lugares mantienen su tamaño en la pantalla; de lejos se encogen y pierden sus nombres, excepto aquel en el que estás y el que has elegido.
- **Un lugar** es una pequeña imagen pintada con su nombre debajo. Los tres puntos de su tarjeta ("More for this place") abren un menú con "Change the icon of this place", que lo cambia a mano: el diálogo ofrece "Automatic" (el que dice el nombre) y cada tipo del conjunto de iconos con todas sus imágenes; elige uno y se queda en este lugar. Automatic quita la elección. Las elecciones pertenecen al chat. La imagen viene del nombre del lugar (una taberna, una forja, un bosque, una cocina...); un lugar cuyo nombre no dice nada recibe un alfiler de latón. Cada tipo tiene varias imágenes (normalmente cuatro) y un lugar conserva la que le tocó, así que dos tabernas pueden verse distintas. Hay tipos de fantasía (una taberna, una forja, un castillo, una cueva...) y los de la ciudad moderna (un hospital, una comisaría, una cafetería, un rascacielos, una entrada de metro, una gasolinera, una oficina de correos, un cine, un karaoke, un salón de recreativas y más). Si el motor es más antiguo y no tiene imágenes, un emoji redondo ocupa su lugar. El lugar en el que está la historia ahora tiene un anillo y un punto. Un lugar que la historia nunca ha visitado está un poco más apagado.
- **Las habitaciones y rincones** de un lugar (los "spots" del World DM) son más pequeños y se colocan alrededor del lugar dentro del cual están, con una línea fina hacia él. Arrastra un lugar y sus habitaciones van con él; arrastra una habitación y solo se mueve la habitación.
- **Los caminos** son líneas discontinuas entre dos lugares entre los que la historia se ha movido. Un camino aparece por sí solo la primera vez que la historia va de un lugar a otro; moverse entre habitaciones de un mismo lugar no es un viaje. Los caminos del lugar que eliges se dibujan con más fuerza.
  El mapa aprende dónde está la historia a partir de la línea de lugar del Dashboard, emparejada por nombre con un lugar del libro del mundo. Cuando esa línea nombra un sitio que no está en el libro, una línea bajo la cabecera lo dice ("The story is at ... which is not one of the places"), ningún lugar se marca como tuyo y no se dibuja ningún camino hasta que la historia llega a un lugar que el libro tiene. Añade el lugar en la sección World (o dale a uno existente el nombre que la historia usa allí), o díselo al mapa a mano (siguiente punto). Un camino solo se dibuja para los movimientos que el mapa vio: no relee el pasado de la historia.
  **Marca a mano dónde está la historia:** elige un lugar y escoge "The story is here (mark by hand)" en el menú de tres puntos de su tarjeta. El mapa entonces trata ese lugar como aquel en el que está la historia: se marca, el viaje parte de él, y se dibuja un camino cuando marcas otro lugar o viajas. Es para una historia cuyo lugar el Dashboard no puede nombrar (el Dashboard está desactivado, o su línea de lugar está en un sitio del que el libro no tiene registro). La marca se mantiene mientras el Dashboard no nombre ningún lugar del libro y su línea de lugar siga como estaba cuando marcaste; cuando el Dashboard nombra un lugar del libro, o su línea de lugar cambia, el Dashboard decide de nuevo. Tras un viaje hecho mientras el Dashboard no nombra ningún lugar, la marca se mueve al lugar al que llegaste. "Take the hand mark off" en el mismo menú la quita.
  **Dibuja un camino a mano:** elige un lugar, escoge "Draw a road from this place" en el menú de tres puntos de su tarjeta, luego toca otro lugar: un camino los une. Toca un lugar que ya tiene un camino hacia él y el camino se quita. Tocar una habitación o un punto vacío solo cancela. Solo se pueden unir lugares enteros, no habitaciones. Los caminos dibujados a mano se conservan como los que dibujó la historia.
- **Toca un lugar** para ver su tarjeta abajo: el nombre completo (el nombre bajo el icono se corta, la tarjeta no, y mantener el puntero sobre un nombre lo muestra entero), "You are here", qué hay dentro de él, cuántas veces lo ha visitado la historia, y la imagen vinculada a él en la sección World cuando hay una.
- **Renombra un lugar en el mapa** desde el menú de tres puntos de la tarjeta. Solo cambia lo que muestra el mapa: el libro del mundo, el Dashboard y la historia conservan el nombre propio del lugar, así que nada que vaya por el lugar (sus habitaciones, sus caminos, viajar más tarde con un toque) se ve afectado. La tarjeta entonces también dice "In the book: ...". Guarda un nombre vacío para devolver el nombre del libro. El tipo del icono se lee de ambos nombres.

## Dónde están los lugares

La app coloca los lugares nuevos, no un modelo: el primero en el centro, los siguientes junto al lugar del que vino la historia, las habitaciones alrededor de su lugar. Arrastra cualquier lugar donde quieras; la app nunca mueve un lugar que hayas colocado. Las posiciones, los caminos y la imagen del mapa pertenecen al chat, no al navegador.

- **El candado** (el padlock de la cabecera) mantiene los lugares donde están: un arrastre que empieza en un lugar mueve el mapa en su lugar, un toque sigue eligiendo el lugar. Está hecho para un teléfono, donde un dedo desplazando el mapa empuja los iconos de un lado a otro. Se guarda por chat en este navegador, así que un teléfono puede estar bloqueado mientras el escritorio no lo está.

El engranaje de la cabecera abre:

- **La imagen bajo los lugares** (ver "Mapas listos" más abajo): sube la tuya, elige un mapa listo o cambia a la cuadrícula punteada. Cambiarla mantiene dónde están los lugares; luego arrastra los lugares sobre ella.
- **Draw a map with the image model**, **Maps of this chat** y, cuando hay varios, **Places on this map**: ver [[places-map-levels|Varios mapas y dibujar un mapa]].
- **Spread the places over the picture** reparte los lugares que tienes por todo el tablero (sin apretar nunca: nada que estaba separado se acerca; las habitaciones mantienen su distancia de su lugar). Los lugares nuevos empiezan juntos cerca del centro y un plano listo llena todo el tablero, así que esto te ahorra arrastrarlos uno a uno. Un mensaje ofrece **Undo**; si los lugares ya llenan el tablero, lo dice.
- **Arrange the places again** devuelve cada lugar a la disposición automática (pregunta primero). Los caminos se quedan.

## Viajar con un toque

Elige un lugar en el que no está la historia y pulsa la flecha de su tarjeta (junto a los tres puntos) ("Go to this place"). Se abre una pequeña ventana:

- **How:** a pie, a caballo, en taxi, en metro o saltarse el camino. Ir a caballo toma 0.4 del tiempo a pie, un taxi 0.2, el metro un cuarto más diez minutos de espera; saltarse el camino pide a la respuesta una línea como máximo. El taxi se ofrece en mapas de ciudad y de región, el metro solo en mapas de ciudad (ver [[places-map-levels|Varios mapas]]).
- **Minutes:** se calculan a partir de la distancia entre los dos lugares en el tablero y la escala del mapa (un mapa de ciudad: 10 unidades del tablero por minuto, redondeado a 5; un mapa de región y un mapa del mundo son muchas veces más lentos por unidad, así que un viaje largo se cuenta en horas o días, y la ventana lo muestra junto al número, "= 2 d 4 h"), y son tuyos para cambiar. Se guardan en el camino, así que el siguiente viaje entre los mismos dos lugares parte de ellos. **Ask the model** (junto a los minutos) hace una llamada al modelo del World DM: lee lo que el libro dice sobre los dos lugares y la distancia y da el tiempo a pie, que rellena el campo. Cuesta una llamada pequeña, solo cuando lo pulsas, y está desactivado mientras el World DM está desactivado.
- **Road name:** opcional. Se guarda en el camino; el siguiente viaje le dice a la respuesta que se atenga a ese camino, así que se recorre la misma calle otra vez. Si se deja vacío, la respuesta inventa un nombre corto. Cuando el camino no tiene ninguno y el World DM está activado, una llamada pequeña a su modelo lee la respuesta después del viaje y aparece una línea bajo la cabecera: "The reply called this road ..." con **Keep**. Keep pone el nombre en el camino; ignóralo y nada cambia. No se lee nada cuando ya has nombrado el camino.
- **Road event** (desactivado hasta que lo actives, recordado por chat en este navegador): cuando el DM ya está celebrando un evento, ese se juega en el camino. Si no, se tira un dado con semilla contra la probabilidad que fijes (25% para empezar): la ventana muestra la tirada antes de que envíes, y si acierta nombra un pequeño tipo de evento (un desconocido, un obstáculo, el clima, un hallazgo, una sensación de ser observado, un viajero en apuros, un rumor, una señal de advertencia) que la respuesta rellena. La misma tirada se muestra si vuelves a abrir la ventana, y está en el chip de instrucción de tu mensaje.
  **DM makes it up** (un segundo interruptor junto a él, desactivado por defecto, necesita el World DM activado): cuando los dados aciertan, un botón **Make the event up** pide al modelo del DM un evento pequeño y concreto a partir de la gente, las cosas y los lugares del libro (una persona conocida encontrada en el camino, una cosa perdida, un lugar por el que se pasa). Cuesta una llamada pequeña, solo cuando lo pulsas. El evento se muestra en la ventana (**Make another** lo intenta otra vez) y sustituye al tipo de la lista en la instrucción; si no pulsas el botón, se usa el tipo de la lista.
- **Your move:** la línea que va al chat, "I head to ..." por defecto, tuya para reescribir.

**Go** envía tu movimiento con una instrucción oculta para esa única respuesta: de dónde, a dónde, cómo, aproximadamente cuánto tiempo, contar el camino en unas pocas líneas y luego la llegada, y mostrar la nueva hora del día. Cuesta la respuesta y nada más. El reloj del Dashboard no lo mueve el mapa: sigue a la respuesta, como hace tras Skip time, así que una respuesta deslizada se lleva el tiempo con ella. La instrucción se muestra como un chip en tu mensaje. En un teléfono el mapa se pliega tras Go para que puedas leer la respuesta.

Cuando el mapa no sabe dónde está la historia (la línea bajo la cabecera lo dice), el viaje no tiene camino ni tiempo: solo el movimiento y la llegada. Una habitación del lugar en el que está la historia es un movimiento dentro de él, también sin tiempo.

## Mapas listos y la imagen bajo los lugares

Un mapa sin nada elegido no está desnudo: la app muestra un plano listo y pintado que encaja con los lugares (un plano de casa para habitaciones, cuevas para sótanos y mazmorras, una costa para el mar, una ciudad amurallada o un pueblo para calles y tiendas, lo salvaje para bosques y ríos, una región en caso contrario; un plano moderno, como un centro urbano, un suburbio, un distrito industrial, un aeropuerto o un campus, cuando los lugares son de una ciudad moderna: un hospital, una comisaría, un cine, un banco...). El plano lo elige el código a partir de los nombres, el mismo cada vez para un chat, y no cuesta nada.

El menú del engranaje tiene el resto:
- **Choose a ready map** abre la galería de los packs del motor por tipo (Region, Wilderness, Coast, Walled town, Village, Harbour town, House plan, Caves; Downtown, Suburb, Industrial district, Campus, Waterfront, Old town, Airport, Metropolis, City park, Small town), cuatro mapas cada uno. Elige uno y se queda en este chat.
- **Upload a map picture** pone la tuya bajo los lugares, ajustada al tablero manteniendo su proporción.
- **No picture (the dotted grid)** quita la imagen; el menú entonces ofrece **Use the automatic map again**.

Mover los lugares o cambiar la imagen nunca mueve uno dentro de la otra: los lugares mantienen dónde los pusiste.

## Varios mapas y dibujar un mapa

Un chat puede contener varios mapas, cada uno con su propia imagen, lugares, caminos y escala (Town, Region, World), y el menú del engranaje puede pintar una imagen con el modelo de imágenes. Ambas cosas están en [[places-map-levels|Varios mapas y dibujar un mapa]]. Viajar en un mapa toma minutos, horas o días según su escala (ver "Viajar con un toque" más abajo).

## Qué no hace

No inventa lugares (eso lo hace el World DM, ver [[world-dm]]). Los lugares que el DM ha retirado salen del mapa.
