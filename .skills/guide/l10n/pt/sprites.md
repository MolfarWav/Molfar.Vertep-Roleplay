<!-- source: 4bee02775a17 -->
# Sprites e janelas de sprites

Sprites são pequenas imagens de um personagem, uma por emoção, que aparecem sobre o chat e mudam conforme a história avança. Esta página é para quem quer ver vários personagens ao mesmo tempo, em um grupo ou com um cartão de narrador, ou montar um visual de visual novel.

## O que é uma janela de sprite

Uma janela de sprite flutua sobre o chat e mostra **um personagem**. Ela escolhe a imagem a partir das últimas falas desse próprio personagem (com as mesmas regras de palavras-chave de antes; nenhum modelo é chamado), e a imagem fica até o personagem falar de novo. Um cartão de narrador que escreve seus personagens como falas ("Aria: ...") dá a cada um as suas próprias falas; um que escreve em prosa ("Aria ri de alegria") dá a cada um as frases que os nomeiam, e quando essas não mostram emoção, a mensagem inteira decide. Arraste uma janela para onde quiser, arraste o canto inferior dela para redimensionar (clique duas vezes no canto para voltar ao tamanho padrão) e toque em **×** para dobrá-la em uma pequena ficha redonda; toque na ficha para trazê-la de volta.

Os sprites são adicionados a um cartão no editor, aba **More**, **Sprites**. As Configurações têm um interruptor, "Expression Sprites", que desliga todas as janelas.

## Uma janela ou várias

Um chat novo tem uma janela que segue **quem fala**, como sempre. Toque na engrenagem de uma janela para abrir **Sprite windows**:

- **Add window** (até 8). Uma janela nova mostra "Next in the scene".
- **Shows**, por janela: "Whoever speaks", "Next in the scene" ou um personagem específico (um membro do grupo ou uma voz de um cartão de narrador).
- **Transparent background**, por janela: sem moldura e sem fundo, só a imagem. Os cliques atravessam a janela até o texto do chat, então uma janela assim é movida pela pequena alça no canto superior esquerdo.
- **Visible part**: um controle deslizante de 35% a 100% (100% por padrão). Menos de 100% mostra só a parte de cima de cada imagem, então as pernas ficam cortadas (da cintura para cima, ou um busto a 40%); a altura da janela passa a ser a parte que aparece, e a imagem é desenhada maior para isso. Junto com a faixa sob o texto, isso dá o visual de visual novel e deixa quase toda a altura para o chat.
- **Windows are**: "In front of the text" (padrão), "Behind the text" (o texto do chat é desenhado sobre as imagens, que ficam por baixo; cada mensagem recebe um fundo na cor da página para continuar legível, e o controle **Text backing** define a intensidade dele de 0% a 100%, 55% por padrão; os botões de uma janela ficam esmaecidos e a janela é movida pela alça) ou "In a strip under the text" (o chat reserva sob o texto uma faixa para as janelas, então nenhum texto fica sob uma imagem; as janelas ficam então embaixo e só se movem para os lados, e a faixa tem a altura da janela mais alta). Essas opções são para tablets e computadores; um celular as mantém na frente.
- **Arrange**: "Row at the bottom" (o visual de visual novel) ou "Grid". Elas só posicionam as janelas; a partir daí você as arrasta.
- **Hide empty windows**.
- **Back to one window**.

O layout é salvo **por chat, neste navegador**. Ele não vai para outro dispositivo.

## Quem está "na cena"

As janelas "Next in the scene" mostram as pessoas da cena que não são quem fala, e um personagem **mantém a sua janela** enquanto fica: ninguém pula para outra janela quando outra pessoa fala. Quando um personagem sai da cena, a janela dele fica em branco ("Nobody here") ou some se "Hide empty windows" estiver ligado, e o próximo a chegar ocupa uma janela livre.

A cena é a lista "Present" do Dashboard quando o Dashboard leu a história (veja [[dashboard]]). Sem ele, a cena é formada por quem falou nas últimas seis mensagens.

## Roupas

Um personagem com mais de uma roupa ganha na janela um pequeno seletor de roupa. A escolha é guardada para o chat e é separada para cada membro de um grupo.

## No celular

Um celular mostra **uma janela**, e tudo fica acima da caixa de mensagem, onde quer que ela cresça:

- **A imagem deixa os toques passarem.** Um deslize sobre ela rola o chat. A janela é movida pela alça no canto superior esquerdo, e a engrenagem (configurações), o **×** (dobrar) e o canto (redimensionar) ficam sempre visíveis. A janela fica inteiramente na tela e acima da caixa de mensagem; se não couber, ela fica mais baixa.
- **A fileira acima da caixa de mensagem** tem **Auto** e todos na cena como pequenas imagens redondas. O personagem na janela tem um anel. Toque em outro para mostrá-lo ali: um alfinete na imagem dele significa que a janela fica nele. Toque no que está com o alfinete, ou em **Auto**, e a janela volta a seguir quem fala.
- **Enquanto você digita**, a janela e a fileira saem do caminho, e voltam quando a caixa de mensagem está vazia ou você sai dela.
- Uma janela dobrada é uma pequena ficha redonda: toque nela e a janela abre onde a ficha está, trazida de volta para a tela.

Janelas transparentes, organização e janelas extras são para tablets e computadores.

## O que ele não faz

Ele não desenha nada e não lê a história com um modelo: um personagem sem sprites não tem janela, e um personagem que nunca falou mostra sua imagem padrão. Um membro do grupo sem sprites é ignorado.
