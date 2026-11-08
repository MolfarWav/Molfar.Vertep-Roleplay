<!-- source: 045cbad8d708 -->
# Canvas: links de chats, o prompt e os agentes

O Canvas é a bancada técnica do Roleplay: uma tela com quadros, onde você vê e muda como os chats se conectam e o que cada chat envia ao modelo. Você não precisa dele para jogar. Abra-o quando uma história precisar de uma sequência, quando uma resposta tiver surpreendido você ou quando você for montar agentes.

Escolha um quadro com o interruptor **Board** no topo: **Chat links**, **Prompt**, **Agents** e **Agent sets**. O item Agents na barra lateral abre o mesmo Canvas no quadro Agents. O quadro que você usou por último fica lembrado.

## Chat links

Um mapa dos seus chats. Cada chat é um cartão. Uma linha de um chat até outro significa "este chat continua aquele": a história do chat anterior vai junto como pano de fundo nas respostas do chat posterior, dentro do orçamento de pano de fundo definido na Library. Os três chats anteriores mais próximos são lidos por inteiro e os mais antigos são condensados ([[long-chats]]). Linha contínua é uma continuação. Linha tracejada é um ramo bifurcado a partir de uma mensagem.

- Os chats que você não colocou no quadro ficam esperando na lista à esquerda (**Chats**). Arraste um para o quadro, ou use **Put on the board** (com **its linked chats** para trazer a cadeia inteira). Arraste um cartão de volta para a lista, ou use **Remove**, para tirá-lo do quadro. O chat em si continua na Library.
- Ligue **Edit** para conectar ou desconectar cartões. Um link que criaria um laço, ligaria um chat a si mesmo ou repetiria um link existente é recusado, e o quadro diz o motivo. **Undo** e **Redo** estão disponíveis. **Fit** enquadra o grafo inteiro.
- No telefone, o quadro abre em **View** com uma **List** de links. Montar um grafo é mais fácil em uma tela grande, mas você ainda pode editar os links na lista.

O mapa de um chat na Library mostra a mesma cadeia, mas só para visualizar. O botão **Edit on canvas** dele leva você até aqui.

## Prompt

Escolha um chat para ver a solicitação que ele envia ao modelo. O quadro tem duas visões: **Parts** e **Memory**.

- **Parts** lista cada parte da solicitação: o prompt principal, o cartão do personagem, a persona, as entradas de lorebook, o diálogo de exemplo, as seções da predefinição e o histórico, cada uma com a sua contagem de tokens e o seu estado. Uma parte pode estar desligada na predefinição, desligada neste chat, vazia, ou não se aplicar a este tipo de resposta. Você pode desligar uma parte só para este chat, sem mexer na predefinição. **Only what is sent** oculta o resto, e o total mostra o que o modelo recebe.
- **Memory** explica por que a memória colocou o que colocou na última resposta: [[memory]] tem a descrição completa.

Para uma visão mais rápida apenas do que disparou na última resposta, use o botão **Fired** no cabeçalho do chat. A visão Memory e o **Fired** leem o mesmo registro; o Fired também conta sobre o chat inteiro.

## Agents e Agent sets

A forja de agentes: monte um agente, teste-o e agrupe agentes em conjuntos. Veja [[agents]].

## O que permanece como está

Desligar uma parte no quadro Prompt vale só para aquele chat. A predefinição e os cartões não são alterados.
