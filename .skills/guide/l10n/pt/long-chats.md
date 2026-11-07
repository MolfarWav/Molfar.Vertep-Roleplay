<!-- source: 9efd9a7576a4 -->
# Chats longos e custo de tokens

Um chat que dura semanas cresce, e cada resposta envia mais dele ao modelo. Esta página é para quem tem respostas lentas ou caras, ou um modelo que esquece o começo da história.

## O botão Request size

Por padrão, o chat inteiro é enviado enquanto a janela tem espaço. Numa janela grande o custo continua crescendo, então o cabeçalho do chat tem um botão **Request size** ao lado das ferramentas da história (no telefone: no Menu). Ele mostra quantos tokens a última solicitação enviou, o prompt inteiro como o provedor o contou, e qual modelo a recebeu. Pressione-o para ver o modelo, a janela dele e o seu limite. Ele fica verde-azulado abaixo de três quartos do limite, âmbar a partir daí, e vermelho com um sinal de aviso acima dele. O quadro Prompt do Canvas lista cada parte de uma solicitação ([[canvas]]).

Quando uma resposta empurra a solicitação além do limite, abre-se um pop-up:

- **Yes, continue in a new chat** cria o próximo chat na hora e o abre.
- **Not now** esconde o pop-up para este chat até que a solicitação tenha crescido à metade. Fechá-lo conta como Not now.
- **Send finished scenes as chapters instead** aparece quando o Litopys está ligado (próxima seção).

O limite fica no fim do pop-up, e na Library, engrenagem "Litopys settings", bloco "In the prompt", "Warn me when a request gets big": 60% da janela do modelo (padrão), um tamanho que você digita (100k) ou escolhe (de 16k a 500k), ou nunca. Um chat que já passou do limite mostra o botão vermelho e nenhum pop-up até que uma nova resposta o faça crescer.

O registro tem tamanho próprio. No mesmo bloco, "Memory size" é Auto por padrão: 15% da janela do modelo, entre 800 e 16000 tokens. "Compact" o mantém em 800.

## Os interruptores que cortam custo

No mesmo bloco, "Older messages leave the prompt" tem duas opções:

- **Only when the window is full** (padrão): toda mensagem é enviada enquanto couber.
- **By scenes**: assim que um capítulo cobre uma cena, a cena é trocada pelo capítulo. Só as últimas mensagens ficam palavra por palavra ("Direct messages after the scenes", 2 ou mais). A cena mais nova ainda não tem capítulo, então é enviada por inteiro.

"By scenes" custa um pouco de detalhe: um capítulo é uma recontagem, então um modelo fraco pode perder uma pequena coisa. Fixe um fato que nunca pode se perder ([[litopys]]). Outros cortes:

- Quadro Prompt do Canvas, cartão history, Details: enviar só as últimas N mensagens (no computador, só esse chat).
- Reduzir "Memory size" para Compact, ou desligar "Chapters and facts".

## Comece um chat novo e mantenha a história

Numa pausa natural, um chat novo que continua o antigo começa com um prompt pequeno e ainda sabe o que aconteceu.

1. No chat, abra "More" e escolha **Continue in a new chat**, ou pressione Yes no pop-up.
2. O chat novo é criado na hora e se abre. Ele mantém o preset e as escolhas dele, a persona, o modelo, o conjunto de agentes, a ordem de turnos de um grupo e o mundo do World DM.
3. Ele recebe a história antiga como pano de fundo: capítulos e fatos, até três chats para trás, dentro do "Backstory budget". As mensagens antigas não são enviadas.

O chat anterior então vai para o Archive por conta própria (próxima seção). O vínculo é o que o Canvas desenha, e o Canvas pode mudá-lo depois: veja [[canvas]]. Para escolher outro chat anterior, comece um chat a partir do personagem e use o menu **Continues** na etapa "New chat with".

O chat novo se abre com a saudação inicial do cartão; "Edit the first message" permite continuar de onde a história parou.

## Arquive uma história concluída

Uma história que você já terminou pode ir para o **Archive**. É um status do chat, não uma mudança de lugar: o chat continua onde está, então sua memória, seus vínculos no Canvas e qualquer livro feito dele continuam funcionando.

- Em Chats, escolha um chat e pressione **Archive** (o botão âmbar no painel dele), ou marque vários com Select. Dentro de um chat, ele está no menu sob "Manage chat".
- Um chat arquivado sai da lista e da Home. A linha âmbar **Archive** sob os filtros os abre; **Back to chats** volta.
- Ele se abre somente para leitura: você pode ler, copiar, criar uma ramificação a partir de uma mensagem, exportar e ver o Dashboard e a Library dele, mas não enviar, fazer swipe, editar ou apagar. Seu lugar no fim oferece **Continue in a new chat**. **Unarchive** (no painel ou no aviso) o torna normal de novo.
- A confirmação oferece **Archive and continue** quando nenhum chat continua este ainda.
- **Acontece sozinho** quando um chat se torna o chat anterior de outro: um vínculo no Canvas, Continue in a new chat, o pop-up acima, ou uma escolha em "Continues". Um aviso com Undo informa isso. Ramificações não são continuações e permanecem como estão. Desligue em Library, engrenagem "Litopys settings", "Archive the earlier chat when it is continued".
- Um chat de 100 mensagens ou mais que ficou parado por uma semana recebe uma pequena etiqueta "Long chat · archive?" na lista e uma dica no painel. Nada é arquivado por você.

Por que se incomodar: o chat anterior não muda mais, então a memória dele fica estável, e um chat novo que o continua o lê como uma história concluída ([[litopys]]).

## Detalhes que os capítulos deixaram de fora

Um capítulo é uma recontagem, então um pequeno detalhe de um chat anterior pode ter sumido dele. Na Library, Litopys settings, "In the prompt", o interruptor **Word-for-word memories of earlier chats** permite que um chat que continua outros traga de volta uma ou duas passagens das mensagens originais quando o que está sendo dito compartilha palavras raras com elas ([[litopys]]). Desligado por padrão.

## Salve uma história como livro

Na Library, Litopys, "Save as a book" copia os capítulos, arcos e fatos de um chat para a estante do Data Bank, para os chats que você escolher: veja [[memory]].

## Confira o que o modelo recebeu

Se um personagem esquecer algo, abra Canvas > Prompt e troque de "Parts" para "Memory": ela mostra quais fatos entraram e quais ficaram de fora, e por quê. O botão **Fired** no cabeçalho do chat mostra isso para a última resposta e para o chat inteiro.
