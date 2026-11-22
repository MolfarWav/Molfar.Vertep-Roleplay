<!-- source: ae865b32181c -->
# Direção: quem está na cena

Direção é para conversas em grupo. Após cada resposta, um modelo "diretor" pequeno e barato lê a cena e diz que tipo de cena é (uma aula, um intervalo, um momento a sós, um encontro) e quais membros estão nela. Membros que não estão lá param de responder e ficam fora do prompt até que a história os traga de volta.

## A barra

Em uma conversa em grupo, há uma barra fina abaixo da barra de membros, marcada como "Direction" (no celular, apenas o ícone). Da esquerda para a direita:

- **O chip da cena**: o tipo de cena e quem está aqui ("Momento a sós, com Yuzu" ou "Aula, 4 aqui"). Toque para ver quem está aqui e quem não está na cena, quando foi o último relatório, e um botão **Report now** que pede ao diretor para ler de novo. Enquanto o diretor lê, o chip diz "Lendo a cena…".
- **O chip do modelo**: o modelo do diretor. Se nenhum for escolhido, mostra **Pick a model**. Toque para ver a mesma lista de modelos que a barra superior da conversa tem: modelos favoritos, depois todos os modelos por conexão, com uma caixa de busca.
- **O interruptor**: Direção ligada ou desligada nesta conversa. Até que um modelo seja escolhido, ele fica apagado e diz "Pick a model first".
- **Next**: um chip que aparece enquanto uma regra de gênero tem uma nota esperando pela próxima resposta ("Next: Yuzu"). O x a pula.
- **Rules**: abre a folha de Direção com duas abas, **Rules** e **Log**. Fica ao lado do interruptor, então continua visível no celular (lá é apenas um ícone, com um ponto enquanto as regras estiverem ligadas).

Com o interruptor desligado, a barra se recolhe para "Direction: off" e a conversa funciona como antes.

## Regras de gênero

Um gênero é um conjunto de pequenas regras que trazem pessoas para a cena por acaso, para que uma história desse gênero não pare. Abra **Rules** e escolha um gênero. Por enquanto há um, **School rom-com**, com três regras:

- **Interrupted moment**: você esteve a sós com um membro por três respostas, e alguém entra e interrompe o momento.
- **Someone comes by**: ninguém esteve por perto por três respostas (não em casa), e um membro aparece.
- **Friends join the break**: em um intervalo, almoço ou clube com uma ou duas pessoas presentes, um amigo se junta.

Uma conversa começa sem gênero e com as regras desligadas, então nada muda até você escolher um. Escolher um gênero liga as regras; **Rules in this chat** as desliga de novo e mantém o gênero. As regras precisam que o diretor esteja ligado: elas leem os relatórios dele.

Após cada resposta, o código (não um modelo) verifica as regras na ordem. Uma regra pode disparar quando suas condições são atendidas, ela não está em repouso e uma rolagem de dois dados atinge o número dela. Se disparar, a próxima resposta recebe uma breve nota de cena ("Yuzu walks in on you and Hana and interrupts the moment") e a pessoa passa a contar como presente na cena, então o cartão dela é enviado por inteiro. No máximo uma nota por resposta. O bloqueio, um retorno depois do bloqueio, e um evento ou uma pessoa que retorna do World vêm primeiro; a regra então espera outra vez.

Cada cartão de regra mostra o estado: **Ready**, **Cooling down** (respostas restantes) ou **Quiet for the payoff**, e quantas vezes disparou rumo à recompensa. **Numbers** abre as configurações:

- **2d6 needed**: a rolagem precisa atingir este número; o texto ao lado dá a porcentagem das rolagens ("about 42%"). 2 sempre dispara, 13 nunca.
- **Cooldown**: respostas em que a regra fica em silêncio depois de disparar.
- **Payoff every** e **Then quiet**: a cada K-ésima vez que dispara, a regra descansa mais M respostas ("finally alone"). 0 desliga a recompensa.

**Fire now** coloca a nota da regra na próxima resposta sem rolagem, sem cooldown e sem contar para a recompensa; exige que alguém esteja ausente. **Skip** descarta uma nota pendente. Uma nota que você pula ou uma resposta que você apaga é esquecida, junto com o cooldown; deslizar a resposta que trazia uma nota dá à nova tentativa a mesma nota.

Sob a resposta que trazia uma nota, uma pequena linha diz o que aconteceu: "Direction: Mei joins (Friends join the break, 2d6 = 10, needed 9) · came". A última palavra é o relatório posterior do diretor: **came** (estão na cena), **only mentioned** (apenas mencionados) ou **did not come** (não vieram). A aba **Log** lista o mesmo, com a rolagem e o motivo, incluindo regras que rolaram e falharam.

Um grupo pode definir um **default genre** na sua aba **Direction**; as novas conversas dele começam com esse gênero ligado. Os números são primeiras estimativas: mude-os em uma conversa se uma regra disparar com frequência demais ou de menos.

## Escolhendo o modelo

Há um modelo diretor para todas as conversas e todos os grupos. Escolha-o em qualquer barra, ou na aba **Direction** do grupo. Não há padrão: você escolhe. Um modelo pequeno e rápido basta: ele custa uma chamada curta após cada resposta.

Uma nova conversa de grupo começa com a Direção ligada assim que um modelo é escolhido. Conversas que você já tinha não são alteradas. Cada conversa tem seu próprio interruptor.

## Quem está ausente

Um chip de membro muda quando alguém está fora da cena: a imagem fica escurecida e traz uma pequena marca de porta. Uma marca de cadeado significa que o bloqueio (abaixo) os deixou de fora. Toque em um chip: o popover diz "Here" ou "Not in the scene".

Um membro ausente não toma turnos por conta própria, e o cartão dele não é enviado ao modelo: apenas uma linha diz que ele não está na cena. Citá-lo na sua mensagem ainda o chama de volta. Quando o diretor vê que ele voltou, o cartão completo retorna.

## O bloqueio e o retorno

Para manter uma cena com uma pessoa só, toque em um chip de membro e escolha **Only <name> in the scene**. Um chip "Only Yuzu" aparece antes do chip da cena, e os outros ficam de fora, não importa o que o diretor diga. Toque no x desse chip, ou em **Release the lock** no popover de um membro, para soltar. Na próxima resposta, os outros são avisados de que podem voltar, e a história é solicitada a lhes dar uma forma de entrar.

## Se o diretor falhar

Se a resposta do diretor não puder ser lida, ou a chamada falhar, o chip da cena mostra **No report**; abra-o para ver o motivo. A conversa então usa a noção do Dashboard sobre quem está aqui, ou deixa todos responderem como antes. Nada da sua história se perde.

## Novos grupos

**New group** abre uma janela ampla (em tela cheia no celular). Dê um nome ao grupo, ou deixe em branco para usar os três primeiros membros. Pesquise, restrinja com **All**, **Favourites** e **Recent**, use chips de etiqueta e uma ordenação (Name, Recently used, Most chats), e toque nos retratos para escolher. Os membros escolhidos ficam em uma fileira no topo, na ordem de fala; as setas movem um lugar antes ou depois, e o x remove. **Next** precisa de dois personagens.

Depois de **Next**, o grupo é criado e o editor abre com uma nota: verifique como ele funciona e depois inicie a primeira conversa. **Start chat** é o botão principal. A aba **Direction** define se as novas conversas deste grupo começam com a Direção ligada, e mostra o modelo do diretor. Um grupo na página de Grupos abre o mesmo editor, e o nome do grupo no topo de sua conversa também.

Quando você inicia uma conversa posterior de um grupo, a etapa curta antes da conversa tem um interruptor **Direction**: ligado quando o padrão do grupo está ligado e um modelo está escolhido.

Veja também [[characters]] e [[dashboard]].
