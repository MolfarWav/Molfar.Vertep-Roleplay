<!-- source: 4799ca6e92d8 -->
# Varios mapas y dibujar un mapa

Un chat puede tener más de un mapa en el mapa de lugares (un país, una ciudad, una mazmorra), y cualquier mapa puede recibir una imagen pintada por el modelo de imágenes. Esta página es para quien juega en un mundo con más de una escala. Lo básico del mapa está en [[places-map]].

## Varios mapas

Un chat puede tener más de un mapa: un país, el plano de una ciudad, una mazmorra. Cada uno tiene su propia imagen, sus lugares, sus caminos y su escala. Abre el menú de engranaje y elige **Mapas de este chat**: el primer mapa aparece en la lista, **Añadir un mapa** crea otro. Para cada mapa configuras:

- **Nombre.**
- **Escala:** Pueblo (un trayecto dura minutos: calles, un edificio, un nivel de mazmorra), Región (horas: aldeas, bosques y caminos entre ellas) o Mundo (días: ciudades y tierras muy separadas). La escala determina cuánto dura un trayecto en ese mapa y qué formas de viaje se ofrecen: a pie, a caballo y saltarse el camino en todas partes, un taxi en los mapas de pueblo y de región, el metro en los mapas de pueblo.
- **Plano de:** el lugar del que este mapa es el plano (el mapa de una ciudad es el plano de esa ciudad), o ninguno.

Cuando hay varios mapas, una fila bajo el encabezado muestra el mapa que estás viendo con un símbolo de despliegue: púlsalo para cambiar de mapa o para volver a abrir la lista. El mapa que ves se recuerda por chat en este navegador. Un mapa que es el plano de un lugar muestra una flecha de volver al mapa que contiene ese lugar.

**Un lugar solo está en los mapas donde lo pongas.** **Lugares en este mapa** (menú de engranaje) lista todos los lugares con una marca: marca un lugar para mostrarlo en este mapa, desmárcalo para quitarlo solo de este mapa (sus salas se van con él; un lugar que no está en ningún mapa vuelve al mapa en el que está la historia). Un lugar nuevo que añade el DM va al mapa en el que está la historia; una ciudad, aldea o castillo nuevo también va a los mapas de región y de mundo. Un mapa de región o de mundo nuevo empieza con las ciudades, aldeas y castillos que ya tienes. Un mapa de pueblo nuevo empieza vacío y lo indica, con un botón para la misma lista.

**Un lugar que tiene un mapa propio** muestra un botón **Abrir el mapa de este lugar** en su tarjeta; **Crear un mapa de este lugar** en su menú de tres puntos crea un mapa vacío que es su plano y lo abre. Un lugar que abres desde el mapa del país es el mismo lugar que en el mapa de la ciudad; el lugar de la historia en el mapa del país es la ciudad cuyo plano lo contiene (mientras la historia está en la taberna de la ciudad, el mapa del país marca la ciudad).

Un camino se guarda en el mapa que tiene sus dos lugares. El viaje es dentro de un solo mapa: en el mapa del mundo vas de ciudad en ciudad y la historia llega a la ciudad misma; para ir a una taberna dentro de ella, abre el mapa de la ciudad (la flecha de volver y el botón Abrir se alternan entre ambos) y ve desde ahí.

La imagen de un mapa se elige como cualquier otra (un mapa listo, el tuyo, ninguno, o dibujado): un mapa de Región o de Mundo parte de un plano de región sean cuales sean los lugares, y un mapa de Pueblo parte del plano que mejor encaje con sus lugares.

## Dibujar un mapa

**Dibujar un mapa con el modelo de imágenes** (menú de engranaje) pinta una imagen para el mapa que estás viendo con el modelo de imágenes que elegiste en Settings > Images. La ventana tiene:

- **Qué tipo de mapa:** región, continente, ciudad amurallada, ciudad portuaria, aldea, naturaleza salvaje, costa, plano de casa, mazmorra, cuevas, y los tipos de la ciudad moderna (centro, metrópolis, suburbio, distrito industrial, campus, paseo marítimo, aeropuerto, pueblo pequeño). Un mapa de Región empieza en Región, y uno de Mundo en Continente.
- **Qué dibujar:** un prompt rellenado a partir del tipo y los nombres de los lugares del mapa. Solo pide el terreno (tierra, agua, caminos, solares vacíos) porque tus lugares son iconos superpuestos. Cámbialo como quieras; al elegir otro tipo se reescribe hasta que lo hayas editado.
- Una línea con el modelo de imágenes y un recordatorio de que cada imagen es una llamada que puede costar dinero.

**Dibujar el mapa** hace una llamada y muestra el resultado en la ventana; todavía no ha cambiado nada. **Usar este mapa** lo convierte en la imagen de este mapa (los demás mapas conservan la suya), y **Dibujar de nuevo** vuelve al prompt. Si no hay ningún modelo de imágenes configurado, la llamada lo indica; añade uno en Settings > Images.
