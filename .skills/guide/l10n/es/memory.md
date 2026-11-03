<!-- source: fe19559d281a -->
# Qué memoria para qué

Roleplay tiene varias cosas que "recuerdan". Difieren en quién las guarda, qué contienen y cuánto duran. Si un personaje olvida algo, esta página te dice a cuál acudir.

## Las clases

**Historial del chat.** Los mensajes mismos. El modelo ve tantos recientes como su ventana permite.

**Dashboard** ([[dashboard]]). Por chat, el estado *actual* de la escena: quién está presente, sentimientos, atuendos, misiones abiertas, qué sabe cada personaje. Cambia con cada respuesta.

**Litopys** ([[litopys]]). Por chat, el *pasado* de la historia: un capítulo por escena terminada y una lista de hechos. En esto se apoya un chat largo cuando los mensajes viejos salen del prompt.

**Memoria de la tarjeta.** Por personaje, entre chats: lo que el personaje recuerda de historias terminadas, sus hechos, notas, líneas dichas y hábitos ganados. Vive en la pestaña "Memory" del editor de tarjetas. Importas un chat terminado, ves qué se conservaría, marcas qué guardar, y un interruptor apaga una historia para los chats nuevos. Tiene su propio tamaño (Compact, 800 tokens por defecto). No forma parte del texto de la tarjeta y nunca aparece en una tarjeta exportada.

**Lorebooks.** Entradas de referencia que se unen al prompt cuando aparecen sus palabras clave, o siempre para unas pocas. Guardan las reglas, lugares y personas del mundo. Vincula un libro a una tarjeta o grupo, o márcalo Global para que llegue a todos los chats. Un chat también recibe su propio libro de mundo escrito por el World DM ([[world-dm]]).

**Data Bank** (Tools). Documentos de texto que subes (solo formatos de texto, hasta 2 MB cada uno). En cada mensaje se añaden los pasajes más relevantes. Úsalo para material de referencia largo, no para la historia misma.

**Nota del autor** (encabezado del chat, "Note"). Texto que escribes solo para este chat, colocado a una profundidad y en un papel que eliges. Úsalo para dirigir: una pista de estilo, un empujón de trama.

**Soul** ([[soul]]). No es memoria de eventos sino cómo reacciona un personaje; nunca cambia durante el juego.

## Cuál usar

- "Ella debería recordar la pelea de anoche": el Dashboard lo maneja a corto plazo; Litopys lo guarda a largo plazo. Añade un hecho fijado si no debe perderse nunca.
- "Ella debería recordar la historia anterior en un chat nuevo": memoria de la tarjeta, o vincula los chats en el Canvas para que el chat anterior traiga su historia como trasfondo.
- "El mundo tiene una regla o un lugar": un lorebook.
- "Quiero que las próximas respuestas vayan en esta dirección": nota del autor, o el botón "Story, move".
- "Tengo un documento largo": Data Bank.

## Costos

Todo esto ocupa lugar en el prompt. El tablero Prompt del Canvas muestra cada parte con su conteo de tokens y te deja apagar partes para un chat. En un modelo pequeño, baja "Memory size" de Litopys, mantén la memoria de tarjeta Compact y prefiere pocas entradas cortas de lorebook.
