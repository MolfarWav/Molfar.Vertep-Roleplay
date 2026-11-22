<!-- source: 3b04df871946 -->
# Direção: quem está na cena

Direção é para conversas em grupo. Após cada resposta, um modelo "diretor" pequeno e barato lê a cena e diz que tipo de cena é (uma aula, um intervalo, um momento a sós, um encontro) e quais membros estão nela. Membros que não estão lá param de responder e ficam fora do prompt até que a história os traga de volta.

## A barra

Em uma conversa em grupo, há uma barra fina abaixo da barra de membros, marcada como "Direction" (no celular, apenas o ícone). Da esquerda para a direita:

- **O chip da cena**: o tipo de cena e quem está aqui ("Momento a sós, com Yuzu" ou "Aula, 4 aqui"). Toque para ver quem está aqui e quem não está na cena, quando foi o último relatório, e um botão **Report now** que pergunta ao diretor novamente. Enquanto o diretor lê, o chip diz "Lendo a cena…".
- **O chip do modelo**: o modelo do diretor. Se nenhum for escolhido, mostra **Pick a model**. Toque para ver a mesma lista de modelos que a barra superior da conversa tem: modelos favoritados, depois todos os modelos por conexão, com uma caixa de busca.
- **O interruptor**: Direção ativada ou desativada para esta conversa. Até que um modelo seja escolhido, fica desativado e diz "Pick a model first".
- **Log**: os últimos relatórios (o tipo de cena, quem estava aqui, quanto tempo levou, quantos tokens), e cada interruptor, bloqueio, liberação e erro, do mais recente primeiro.

Com o interruptor desligado, a barra se recolhe para "Direction: off" e a conversa funciona como antes.

## Escolhendo o modelo

Há um modelo diretor para todas as conversas e todos os grupos. Escolha-o em qualquer barra, ou na aba **Direction** do grupo. Não há padrão: você escolhe. Um modelo pequeno e rápido é suficiente: custa uma chamada curta após cada resposta.

Uma nova conversa em grupo começa com a Direção ativada assim que um modelo é escolhido. Conversas que você já tinha não são afetadas. Cada conversa tem seu próprio interruptor.

## Quem está ausente

Um chip de membro muda quando alguém está fora da cena: a imagem fica escurecida e carrega uma pequena marca de porta. Uma marca de cadeado significa que o bloqueio (abaixo) os deixou fora. Toque em um chip: seu popover diz "Here" ou "Not in the scene".

Um membro ausente não toma turnos por conta própria, e seu cartão não é enviado ao modelo: apenas uma linha diz que eles não estão na cena. Nomeá-los em sua mensagem ainda os chama de volta. Quando o diretor os vê de volta, todo o cartão deles retorna.

## O bloqueio e o retorno

Para manter uma cena com uma pessoa, toque em um chip de membro e escolha **Only <name> in the scene**. Um chip "Only Yuzu" aparece antes do chip da cena, e os outros ficam fora, não importa o que o diretor diga. Toque no x desse chip, ou **Release the lock** no popover de um membro, para soltar. Na próxima resposta, os outros são informados de que podem voltar e a história é solicitada a dar a eles um jeito de entrar.

## Se o diretor falhar

Se a resposta do diretor não puder ser lida, ou a chamada falhar, o chip da cena diz **No report**; abra-o para ver o motivo. A conversa então usa a ideia do Dashboard de quem está aqui, ou deixa todos responderem como antes. Nada na sua história é perdido.

## Novos grupos

**New group** abre uma janela ampla (tela cheia no celular). Dê um nome ao grupo, ou deixe o nome em branco para usar os três primeiros membros. Pesquise, refine com **All**, **Favourites** e **Recent**, chips de etiqueta e uma ordenação (Name, Recently used, Most chats), e toque nos retratos para escolher. Os membros escolhidos ficam em uma fileira no topo na ordem de fala; as setas movem um para antes ou depois, o x remove. **Next** precisa de dois personagens.

Após **Next**, o grupo é criado e seu editor abre com uma nota: verifique como funciona, depois inicie a primeira conversa. **Start chat** é o botão principal. A aba **Direction** define se novas conversas deste grupo começam com a Direção ativada e mostra o modelo do diretor. Um grupo na página Grupos abre o mesmo editor, e o nome do grupo no topo de sua conversa também.

Quando você inicia uma conversa posterior de um grupo, a etapa curta antes da conversa tem um interruptor **Direction**: ativado quando o padrão do grupo está ativado e um modelo é escolhido.

Veja também [[characters]] e [[dashboard]].