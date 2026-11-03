<!-- source: e0c72ba92f2d -->
# Alma de un personaje

Un alma es el temperamento de un personaje hacia ti: cómo te trata cuando la historia empieza, qué tan rápido crece cada sentimiento y qué le hiere o le agrada más. Es la entrada de los números de relación del Dashboard ([[dashboard]]). Necesitas esta página si quieres que un personaje reaccione a su manera, o si te preguntas por qué apareció una propuesta.

## Qué guarda un alma

Clase (romántica, aliada, neutral u hostil), pronombres, valores iniciales de confianza, comodidad, atracción, respeto y afecto (de -20 a +20; 0 es un desconocido), rasgos (dominancia, confianza, timidez, paciencia, curiosidad), espectros que inclinan qué tan rápido crece un sentimiento, desencadenantes y valores (cosas que golpean más fuerte o agradan más), una línea sobre cómo sobrelleva la tensión, y otros nombres por los que el personaje responde. El artículo de Help *Soul of a character* explica cada campo.

El alma no guarda lo que ocurre en una historia. Nunca cambia durante el juego; el Dashboard guarda los números cambiantes por cada chat. Un personaje sin alma simplemente juega neutral, con cada multiplicador en 1 y valores iniciales de 0.

## Dónde se edita

Abre una tarjeta, luego la pestaña **Soul**. Cada personaje es una ficha arriba: una tarjeta con un personaje tiene una ficha, una tarjeta de narrador tiene una por personaje recurrente. Elige una ficha y edita sus campos, luego pulsa "Save soul". Los rasgos y espectros guardados quedan fijos; "Edit" los desbloquea, y la pestaña advierte que un cambio toca los próximos turnos de cada chat con esta tarjeta. "Delete soul" está en el menú "More actions". "Add" o "Add by hand" crea un alma para un nombre tú mismo.

Solo los personajes principales tienen alma. Los transeúntes que la historia inventa se dejan sin ella a propósito.

## Valoración automática y propuestas

Por defecto la app propone un alma para una tarjeta que no tiene: justo después de importar, y en la primera actualización del Dashboard de un chat. Un modelo lee la tarjeta, los lorebooks y los mensajes recientes. Una propuesta no se guarda en la tarjeta. Un aviso muestra "Proposal (automatic)" con "Review", "Accept all" y "Dismiss"; o "Save soul" en un solo personaje. Hasta que decidas, la propuesta ya actúa en el juego como alma provisional. "Dismiss" detiene la valoración automática para esta tarjeta. Si una valoración falla, el aviso muestra "Retry" y "Choose another model". Las propuestas pendientes también aparecen en la Inbox.

## ¿Puedo valorar de nuevo desde la pantalla?

Sí, con el mismo botón. El único botón de valorar en la pestaña Soul cambia su etiqueta según lo seleccionado:

- Sin personaje seleccionado, o con uno que aún no tiene alma guardada: "Rate now". Valora solo los personajes que no tienen alma; si no queda ninguno, solo dice que no hay nada nuevo. Valorar un personaje que aún no tiene alma también puede hacerse con "Rate this character".
- Con un personaje que ya tiene alma guardada seleccionado: "Rate again". Pide a un modelo un alma fresca para ese personaje y la muestra como una actualización para revisar junto a la guardada. Si tienes ediciones sin guardar, primero pregunta "Rate again?" porque serían reemplazadas. Si la nueva valoración es igual al alma guardada, se te dice que no hay nada que cambiar.

Nada se sobrescribe hasta que pulsas "Save soul". El modelo usado es el "Sensor model" del Dashboard (el modelo del chat si está vacío); el interruptor "Rate characters automatically" en la configuración del Dashboard solo controla la primera valoración automática, no este botón.

También puedes pedir a Molfar en su propio chat que valore o ajuste un alma; escribe el mismo tipo de propuesta ([[vertep:molfar]]).
