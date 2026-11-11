<!-- source: 67addd68fb05 -->
# Conversas longas e custo de tokens

Uma conversa que dura semanas cresce, e cada resposta envia mais dela para o modelo. Esta página é para quem tem respostas lentas ou caras, ou cujo modelo esquece o começo da história.

## O botão "Request size"

Por padrão, a conversa inteira é enviada enquanto houver espaço na janela. Em uma janela grande o custo continua crescendo, então o cabeçalho da conversa tem um botão **Request size** ao lado das ferramentas da história (no celular: no Menu). Ele mostra quantos tokens a última requisição enviou, o prompt inteiro como o provedor contou, e qual modelo recebeu. Toque nele para ver o modelo, sua janela e seu limite. Ele fica azul-petróleo abaixo de três quartos do limite, âmbar a partir daí, e vermelho com um sinal de aviso quando passa. O quadro Canvas Prompt lista cada parte de uma requisição ([[canvas]]).

Quando uma resposta empurra a requisição além do limite, um popup abre:

- **Yes, continue in a new chat** cria a próxima conversa na hora e a abre.
- **Not now** esconde o popup para esta conversa até a requisição crescer pela metade. Fechá-lo conta como Not now.
- **Send finished scenes as chapters instead** aparece quando o Litopys está ligado (próxima seção).

O limite fica na parte de baixo do popup, e na Biblioteca, engrenagem "Litopys settings", bloco "In the prompt", "Warn me when a request gets big": 60% da janela do modelo (padrão), um tamanho que você digita (100k) ou escolhe (16k a 500k), ou nunca. Uma conversa que já passou do limite mostra o botão vermelho e nenhum popup até uma nova resposta fazê-la crescer.

O registro tem seu próprio tamanho. No mesmo bloco, "Memory size" é Auto por padrão: 15% da janela do modelo, entre 800 e 16000 tokens. "Compact" o mantém em 800.

## Os interruptores que cortam custo

No mesmo bloco, "Older messages leave the prompt" tem duas opções:

- **Only when the window is full** (padrão): toda mensagem é enviada enquanto couber.
- **By scenes**: assim que um capítulo contém uma cena, a cena é substituída pelo capítulo. Só as últimas mensagens ficam palavra por palavra ("Direct messages after the scenes", 2 ou mais). A cena mais nova ainda não tem capítulo, então é enviada por inteiro.

"By scenes" custa um pouco de detalhe: um capítulo é um reconto, então um modelo fraco pode perder uma coisinha. Fixe um fato que nunca deve ser perdido ([[litopys]]). Outros cortes:

- Biblioteca, Litopys settings, **Direct messages, by size**: mantém as mensagens mais novas que cabem em um número de tokens (pelo menos 2 mensagens) em vez de uma contagem fixa. 0 conta mensagens ([[litopys]]).
- Biblioteca, Litopys settings, **Leave out what a speaker was not present for** ("Groups only" por padrão): uma resposta falada por um personagem não recebe as mensagens recentes de cenas em que aquele personagem não estava ([[litopys]]).
- Quadro Canvas Prompt, cartão de histórico, Details: envia só as últimas N mensagens (desktop, só aquela conversa).
- Baixe "Memory size" para Compact, ou desligue "Chapters and facts".

## Comece uma conversa nova e mantenha a história

Em uma pausa natural, uma conversa nova que continua a antiga começa com um prompt pequeno e ainda sabe o que aconteceu.

1. Na conversa, abra "More" e escolha **Continue in a new chat**, ou pressione Yes no popup.
2. A conversa nova é criada na hora e abre. Ela mantém o preset e suas escolhas, a persona, o modelo, o conjunto de agentes, a ordem de turnos de um grupo e o mundo do World DM.
3. Ela recebe a história antiga como backstory, dentro do "Backstory budget". As três conversas anteriores mais próximas são lidas por inteiro: capítulos, fatos e pontos de virada. Conversas mais antigas de uma cadeia longa não são descartadas: elas viajam em uma parte condensada (veja abaixo). As mensagens antigas não são enviadas.

A conversa anterior então vai para o Archive sozinha (próxima seção). O link é o que o Canvas desenha, e o Canvas pode mudá-lo depois: veja [[canvas]]. Para escolher outra conversa anterior, comece uma conversa a partir do personagem e use o menu **Continues** na etapa "New chat with".

A conversa nova abre com a primeira saudação do cartão; "Edit the first message" permite continuar de onde a história parou.

## Uma história de muitas conversas

Uma história pode seguir por muitas conversas. As três conversas anteriores mais próximas dão seus capítulos, arcos e fatos como antes. Toda conversa mais antiga entra em uma parte **far**, colocada primeiro: seus pontos de virada, os fatos fixados e chave, e uma linha para cada arco. A parte é construída a partir do que o Litopys já escreveu, sem nenhuma chamada extra ao modelo, e ocupa 18% do Backstory budget por padrão (Biblioteca, Litopys settings, "In the prompt", **Share for the far chats**, 5 a 40). **Turning points shown** no mesmo bloco define quantos viajam em uma resposta ao longo da história inteira (12 por padrão). Se o orçamento for curto, as conversas mais antigas perdem suas linhas primeiro e os pontos de virada por último. Em **What this chat carries** é a linha própria dela, "Far backstory, chats 1-2", para você ver que as primeiras conversas foram mantidas, não perdidas. Uma cadeia curta não tem parte far. Aumente o Backstory budget se uma história longa parecer rasa.

Uma parte condensada descarta pequenos detalhes (a cor de uma capa); as memórias palavra por palavra abaixo trazem esses detalhes de volta.

## Arquive uma história terminada

Uma história que você terminou pode ir para o **Archive**. É um status da conversa, não uma mudança de lugar: a conversa fica onde está, então sua memória, seus links no Canvas e qualquer livro feito a partir dela continuam funcionando.

- Em Chats, escolha uma conversa e pressione **Archive** (o botão âmbar no painel dela), ou marque várias com Select. Em uma conversa, fica no menu em "Manage chat".
- Uma conversa arquivada sai da lista e da Home. A linha âmbar **Archive** sob os filtros as abre; **Back to chats** volta.
- Ela abre somente para leitura: você pode ler, copiar, ramificar a partir de uma mensagem, exportar e ver o Dashboard e a Biblioteca dela, mas não enviar, deslizar, editar ou excluir. O lugar dela na parte de baixo oferece **Continue in a new chat**. **Unarchive** (no painel dela ou no banner) a torna normal de novo.
- A confirmação oferece **Archive and continue** quando nenhuma conversa continua esta ainda.
- **Acontece sozinho** quando uma conversa se torna a anterior de outra: um link no Canvas, Continue in a new chat, o popup acima, ou uma escolha em "Continues". Um toast com Undo avisa. Ramos não são continuações e ficam como estão. Desligue isso na Biblioteca, engrenagem "Litopys settings", "Archive the earlier chat when it is continued".
- Uma conversa de 100 mensagens ou mais que está parada há uma semana ganha uma pequena etiqueta "Long chat · archive?" na lista e uma dica no painel dela. Nada é arquivado por você.

Por que se dar ao trabalho: a conversa anterior não muda mais, então a memória dela fica estável e uma conversa nova que a continua a lê como uma história terminada ([[litopys]]).

## Detalhes que os capítulos descartaram

Um capítulo é um reconto, então um pequeno detalhe de uma conversa anterior pode ter sumido dele. Na Biblioteca, Litopys settings, "In the prompt", o interruptor **Word-for-word memories of earlier chats** (ligado por padrão) permite que uma conversa que continua outras traga de volta uma ou duas passagens das mensagens originais quando o que está sendo dito compartilha palavras raras com elas ([[litopys]]). A conversa anterior é indexada quando vai para o Archive. Ele compara palavras, então um detalhe contado com outras palavras não é encontrado; o interruptor experimental **Also find old chapters by meaning** (desligado) reduz um pouco essa lacuna quando você usa embeddings: ele encontra o capítulo pelo significado, mas uma passagem ainda precisa de uma palavra rara própria.

## Salve uma história como livro

Na Biblioteca, Litopys, "Save as a book" copia os capítulos, arcos e fatos de uma conversa para a prateleira do Data Bank nas conversas que você escolher: veja [[memory]].

## Confira o que o modelo recebeu

Se um personagem esquece algo, abra Canvas > Prompt e mude de "Parts" para "Memory": ele mostra quais fatos entraram e quais ficaram de fora, e por quê. O botão **Fired** no cabeçalho da conversa mostra isso para a última resposta e para a conversa inteira.
