<!-- source: bea962ecf922 -->
# Mientras tanto: la vida fuera de pantalla

Mientras tanto permite que las personas que no están en la escena hagan cosas mientras la historia continúa: Bram vende un caballo en el puerto, Ada esconde el libro de cuentas, un frente se acerca un paso más a su objetivo. Es una versión de prueba, desactivada por defecto.

## Cómo activarlo

Abre la hoja **World** del chat y busca la tarjeta **Meanwhile**. Activa "Let people off screen act". El interruptor es para todos los chats. Necesita que el **Dashboard** esté activado, porque Mientras tanto lee las escenas de él, y necesita a alguien que actúe: una tarjeta de personaje que no esté en la escena, o una persona en el libro del DM del World.

## Cuándo se ejecuta

Una pasada se ejecuta después de una respuesta cuando han llegado al menos dos respuestas nuevas y o bien comenzó una escena nueva o el reloj de la historia avanzó seis horas. Una pasada es una llamada al modelo. Usa su propio modelo si le configuras uno; si no, el del DM del World, el del sensor del Dashboard, el de la Library, el del chat, el de la app. La tarjeta dice cuál. "Run a pass now" ejecuta una de inmediato.

Una pasada pide hasta tres eventos pequeños. La app comprueba cada uno: las personas deben ser personas que el chat conoce, nunca tu personaje y nunca alguien que esté en la escena, y los efectos deben venir de una lista corta. Un evento que falla una comprobación se descarta por completo, y el registro dice por qué. Un evento que vuelve a decir lo que un evento anterior sobre la misma persona ya dijo también se descarta («repeats an earlier event»). Si un modelo no responde nada, la pasada lo intenta una vez más con más margen; una pasada que falla espera diez minutos.

## Qué muestra la tarjeta

- **What this card shows**: Nothing (solo que algo pasó), Hints (quién y dónde) o Everything. Por defecto es Hints, para que no se te arruine la historia.
- **Off screen so far**: los eventos, según lo que permita ese ajuste.
- **Log**: cada pasada: por qué se ejecutó (escena cerrada, pasó el tiempo, a mano), cuántos eventos ofreció el modelo y cuántos se conservaron, por qué se descartaron los demás, y el error cuando falló.

## Qué les hacen los eventos a la historia

Cada evento conservado se convierte en un recuerdo de las personas a las que les ocurrió y de quienes lo vieron, y de nadie más: nunca tu personaje. Llega a una respuesta por las reglas habituales del registro de la historia ([[litopys]]): cuando habla una de esas personas, o una de ellas está en la escena para una respuesta del narrador o de un grupo. Alguien que lo sabe puede entonces sacarlo a colación, insinuarlo o actuar en consecuencia; los demás no. Un evento secreto también se marca como "kept secret", así que a una respuesta de grupo se le dice quién lo guarda. Los eventos no se copian en los Facts de la Library: se leen del archivo de Meanwhile para cada respuesta, así que no cuesta nada conservarlos y se van con el swipe. El panel "What fired" del prompt los lista como cualquier hecho.

Si desactivas Mientras tanto, los eventos dejan de llegar a las respuestas de inmediato.

## En el diario del Dashboard

En el Dashboard ancho, el **Journal** de un personaje tiene una sección **Off screen (Meanwhile)** con los eventos que le ocurrieron a ese personaje, del más reciente al más antiguo, hasta donde lo permita el ajuste de la tarjeta: solo dónde y cuándo con Hints, el texto con Everything, y nada con Nothing. Solo lee el archivo de Meanwhile; no escribe nada en el Dashboard, así que se va con un swipe y no necesita ningún ajuste extra. En un teléfono el Journal no se muestra.

## Swipes y borrados

Un evento pertenece a la respuesta después de la cual ocurrió. Si regeneras esa respuesta, la nueva versión se escribe sin el evento; si haces swipe o borras esa respuesta, los eventos de esa pasada también se van, de la historia también, y la siguiente pasada vuelve a leer la historia desde la última respuesta que sigue ahí.

Relacionado: [[world-dm]], [[dashboard]], [[litopys]]. Consulta [[litopys]] "Who knows" para ver cómo se muestran los secretos.
