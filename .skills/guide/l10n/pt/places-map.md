<!-- source: 5a9b9de3fd40 -->
# O mapa de lugares

O mapa de lugares é um pequeno mapa flutuante sobre o chat. Ele mostra cada lugar que a história nomeou, as estradas que a história percorreu entre eles e onde você está agora. É para quem joga com o World DM e quer ver o mundo em que está. Não custa nenhuma chamada de modelo.

## Onde ele fica

Um chat mostra um botão redondo de mapa, no canto inferior esquerdo da coluna do chat, quando o livro de mundo do chat tem pelo menos um lugar (veja [[world-dm]]). Pressione-o para abrir o mapa; pressione **×** no mapa para recolhê-lo de volta ao botão. Você pode arrastar o botão e a janela para qualquer lugar, e arrastar o canto inferior para redimensionar a janela (dê um duplo clique no canto para o tamanho padrão). A janela fica onde você a deixou, por chat, neste navegador. As Configurações têm um interruptor, "Places Map", que esconde o botão em todos os lugares.

Um mundo que foi construído antes da história (a partir de cards, de uma receita ou da biblioteca) pode conter lugares que a história ainda não lhe mostrou, então o mapa faz a mesma pergunta que a seção World antes de mostrá-los.

No celular, o mapa aberto é um painel que fica sobre a caixa de mensagem. Enquanto ele está aberto, a janela do sprite e a fileira de personagens saem do caminho; enquanto você digita, o mapa também sai do caminho e volta quando a caixa está vazia.

## O que há nele

- **Um tabuleiro pontilhado.** Arraste o tabuleiro vazio para deslocar, faça pinça ou use a roda para ampliar, **+**, **−** e o botão dos cantos (Show all places) no cabeçalho. Os lugares mantêm seu tamanho na tela; bem longe eles encolhem e perdem os nomes, exceto aquele em que você está e aquele que você selecionou.
- **Um lugar** é uma pequena imagem pintada com o nome embaixo. Os três pontos no card dele ("More for this place") abrem um menu com "Change the icon of this place", que o muda à mão: o diálogo oferece "Automatic" (o que o nome diz) e todos os tipos do conjunto de ícones com todas as suas imagens; escolha uma e ela fica neste lugar. Automatic retira a escolha. As escolhas pertencem ao chat. A imagem vem do nome do lugar (uma taverna, uma forja, uma floresta, uma cozinha...); um lugar cujo nome não diz nada recebe um alfinete de latão. Cada tipo tem várias imagens (geralmente quatro) e um lugar mantém a que recebeu, então duas tavernas podem parecer diferentes. Há tipos de fantasia (uma taverna, uma forja, um castelo, uma caverna...) e os da cidade moderna (um hospital, uma delegacia, um café, um arranha-céu, uma entrada de metrô, um posto de gasolina, uma agência dos correios, um cinema, um bar de karaokê, um fliperama e mais). Se o motor for mais antigo e não tiver imagens, um emoji redondo fica no lugar delas. O lugar em que a história está agora tem um anel e um ponto. Um lugar que a história nunca visitou é um pouco mais apagado.
- **Cômodos e cantos** de um lugar (os "spots" do World DM) são menores e ficam ao redor do lugar em que estão, com uma linha fina até ele. Arraste um lugar e seus cômodos vão com ele; arraste um cômodo e só o cômodo se move.
- **Estradas** são linhas tracejadas entre dois lugares pelos quais a história se moveu. Uma estrada aparece sozinha na primeira vez que a história vai de um lugar para outro; mover-se entre cômodos de um mesmo lugar não é uma viagem. As estradas do lugar que você seleciona são desenhadas com mais força.
  O mapa aprende onde a história está a partir da linha de lugar do Dashboard, combinada por nome com um lugar do livro de mundo. Quando essa linha nomeia um lugar que não está no livro, uma linha sob o cabeçalho diz isso ("The story is at ... which is not one of the places"), nenhum lugar é marcado como seu e nenhuma estrada é desenhada até a história chegar a um lugar que o livro tenha. Adicione o lugar na seção World (ou dê a um existente o nome que a história usa ali), ou diga ao mapa à mão (próximo ponto). Uma estrada só é desenhada para movimentos que o mapa viu: ele não relê o passado da história.
  **Marque onde a história está à mão:** selecione um lugar e escolha "The story is here (mark by hand)" no menu de três pontos do card dele. O mapa então trata esse lugar como aquele em que a história está: ele é marcado, a viagem começa a partir dele e uma estrada é desenhada quando você marca outro lugar ou viaja. É para uma história cujo lugar o Dashboard não consegue nomear (o Dashboard está desligado, ou sua linha de lugar está em algum ponto que o livro não registra). A marca permanece enquanto o Dashboard não nomeia nenhum lugar do livro e sua linha de lugar continua como estava quando você marcou; quando o Dashboard nomeia um lugar do livro, ou sua linha de lugar muda, o Dashboard decide de novo. Após uma viagem feita enquanto o Dashboard não nomeia nenhum lugar, a marca se move para o lugar a que você chegou. "Take the hand mark off" no mesmo menu a remove.
  **Desenhe uma estrada à mão:** selecione um lugar, escolha "Draw a road from this place" no menu de três pontos do card dele e toque em outro lugar: uma estrada os une. Toque em um lugar que já tem uma estrada até ele e a estrada é removida. Tocar em um cômodo ou em um ponto vazio apenas cancela. Só lugares inteiros podem ser unidos, não cômodos. Estradas desenhadas à mão são mantidas como as que a história desenhou.
- **Toque em um lugar** para ver o card dele na parte de baixo: o nome completo (o nome sob o ícone é cortado, o card não é, e manter o ponteiro sobre um nome mostra-o inteiro), "You are here", o que ele contém, quantas vezes a história o visitou e a imagem vinculada a ele na seção World quando houver uma.
- **Ocultar um lugar ou um ambiente dos mapas** com "Hide from all maps" no menu de três pontinhos do cartão (uma mensagem oferece **Undo**), ou com **Hide places...** da engrenagem: uma lista de todos os lugares e ambientes onde você desmarca os que não quer ver (o corredor do apartamento, um porão que a história deixou). Um lugar oculto não aparece em nenhum mapa, o livro do Mundo e a história o mantêm, e marcá-lo de novo o devolve onde estava. Ocultar um lugar inteiro oculta seus ambientes junto; ocultar um ambiente deixa os demais. Vale para todos os mapas da conversa ao mesmo tempo; para tirar um lugar de apenas um mapa, use **Places on this map** (veja [[places-map-levels|Vários mapas e desenhar um mapa]]). Se tudo estiver oculto, o mapa diz quantos são e oferece a lista.
- **Renomeie um lugar no mapa** pelo menu de três pontos do card. Isso muda apenas o que o mapa mostra: o livro de mundo, o Dashboard e a história mantêm o nome próprio do lugar, então nada que dependa do lugar (seus cômodos, suas estradas, viagens posteriores por um toque) é afetado. O card então também diz "In the book: ...". Salve um nome vazio para restaurar o nome do livro. O tipo do ícone é lido a partir dos dois nomes.

## Onde os lugares ficam

Novos lugares são posicionados pelo app, não por um modelo: o primeiro no meio, os seguintes ao lado do lugar de onde a história veio, os cômodos ao redor do seu lugar. Arraste qualquer lugar para onde quiser; o app nunca move um lugar que você posicionou. As posições, as estradas e a imagem do mapa pertencem ao chat, não ao navegador.

- **O cadeado** (o cadeado no cabeçalho) mantém os lugares onde estão: um arrasto que começa em um lugar move o mapa em vez disso, um toque ainda seleciona o lugar. Ele é feito para o celular, onde um dedo deslocando o mapa fica empurrando os ícones. Ele é mantido por chat neste navegador, então um celular pode ficar travado enquanto o desktop não está.

A engrenagem no cabeçalho abre:

- **A imagem sob os lugares** (veja "Mapas prontos" abaixo): envie a sua própria, escolha um mapa pronto ou mude para a grade pontilhada. Mudá-la mantém onde os lugares estão; depois arraste os lugares para cima dela.
- **Draw a map with the image model**, **Maps of this chat** e, quando houver vários, **Places on this map**: veja [[places-map-levels|Vários mapas e desenhar um mapa]].
- **Spread the places over the picture** estica os lugares que você tem por todo o tabuleiro (nunca apertando: nada que estava separado fica mais perto; os cômodos mantêm sua distância do seu lugar). Lugares novos começam juntos perto do meio e uma planta pronta preenche o tabuleiro inteiro, então isso economiza arrastá-los um por um. Uma mensagem oferece **Undo**; se os lugares já preenchem o tabuleiro, ela diz isso.
- **Arrange the places again** devolve todos os lugares ao layout automático (ele pergunta antes). As estradas permanecem.

## Viagem por um toque

Selecione um lugar em que a história não está e pressione a seta no card dele (ao lado dos três pontos) ("Go to this place"). Uma pequena janela se abre:

- **How:** a pé, a cavalo, de táxi, de metrô ou pular a estrada. Cavalgar leva 0,4 do tempo a pé, um táxi 0,2, o metrô um quarto mais dez minutos de espera; pular a estrada pede à resposta no máximo uma linha. O táxi é oferecido em mapas de cidade e de região, o metrô apenas em mapas de cidade (veja [[places-map-levels|Vários mapas]]).
- **Minutes:** calculados a partir da distância entre os dois lugares no tabuleiro e da escala do mapa (um mapa de cidade: 10 unidades do tabuleiro por minuto, arredondado para 5; um mapa de região e um mapa de mundo são muitas vezes mais lentos por unidade, então uma viagem longa é contada em horas ou dias, e a janela mostra isso ao lado do número, "= 2 d 4 h"), e seus para mudar. Eles são mantidos na estrada, então a próxima viagem entre os mesmos dois lugares começa com eles. **Ask the model** (ao lado dos minutos) faz uma chamada no modelo do World DM: ele lê o que o livro diz sobre os dois lugares e a distância e dá o tempo a pé, que preenche o campo. Custa uma pequena chamada, só quando você pressiona, e fica desligado enquanto o World DM está desligado.
- **Road name:** opcional. Mantido na estrada; a próxima viagem diz à resposta para seguir essa estrada, então a mesma rua é percorrida de novo. Deixado vazio, a resposta inventa um nome curto. Quando a estrada não tem nenhum e o World DM está ligado, uma pequena chamada no modelo dele lê a resposta após a viagem e uma linha aparece sob o cabeçalho: "The reply called this road ..." com **Keep**. Keep coloca o nome na estrada; ignore e nada muda. Nada é lido quando você já nomeou a estrada.
- **Road event** (desligado até você ativá-lo, lembrado por chat neste navegador): quando o DM já está com um evento, esse evento acontece na estrada. Caso contrário, um dado semeado é rolado contra a chance que você definiu (25% para começar): a janela mostra a rolagem antes de você enviar e, em um acerto, nomeia um pequeno tipo de evento (um estranho, um obstáculo, o clima, um achado, uma sensação de estar sendo observado, um viajante em apuros, um rumor, uma placa de aviso) que a resposta preenche. A mesma rolagem aparece se você reabrir a janela, e ela está no chip de instrução da sua mensagem.
  **DM makes it up** (um segundo interruptor ao lado, desligado por padrão, precisa do World DM ligado): quando os dados acertam, um botão **Make the event up** pede ao modelo do DM um pequeno evento concreto, vindo das pessoas, coisas e lugares do livro (uma pessoa conhecida encontrada na estrada, uma coisa perdida, um lugar pelo qual se passa). Custa uma pequena chamada, só quando você pressiona. O evento é mostrado na janela (**Make another** tenta de novo) e substitui o tipo da lista na instrução; se você não pressionar o botão, o tipo da lista é usado.
- **Your move:** a linha que vai para o chat, "I head to ..." por padrão, sua para reescrever.

**Go** envia seu movimento com uma instrução oculta para aquela única resposta: de onde, para onde, como, mais ou menos quanto tempo, para contar o caminho em poucas linhas e então a chegada, e para mostrar a nova hora do dia. Custa a resposta e nada mais. O relógio do Dashboard não é movido pelo mapa: ele segue a resposta, como faz após Skip time, então uma resposta deslizada leva o tempo de volta com ela. A instrução aparece como um chip na sua mensagem. No celular, o mapa se recolhe após Go para você poder ler a resposta.

Quando o mapa não sabe onde a história está (a linha sob o cabeçalho diz isso), a viagem não tem estrada nem tempo: apenas o movimento e a chegada. Um cômodo do lugar em que a história está é um movimento dentro dele, também sem tempo.

## Mapas prontos e a imagem sob os lugares

Um mapa sem nada escolhido não fica vazio: o app mostra uma planta pronta e pintada que combina com os lugares (uma planta de casa para cômodos, cavernas para porões e masmorras, uma costa para o mar, uma cidade murada ou uma vila para ruas e lojas, a natureza selvagem para bosques e rios, uma região caso contrário; uma planta moderna, como um centro, um subúrbio, um distrito industrial, um aeroporto ou um campus, quando os lugares são de uma cidade moderna: um hospital, uma delegacia, um cinema, um banco...). A planta é escolhida por código a partir dos nomes, a mesma todas as vezes para um chat, e não custa nada.

O menu da engrenagem tem o resto:
- **Choose a ready map** abre a galeria dos pacotes do motor por tipo (Region, Wilderness, Coast, Walled town, Village, Harbour town, House plan, Caves; Downtown, Suburb, Industrial district, Campus, Waterfront, Old town, Airport, Metropolis, City park, Small town), quatro mapas cada. Escolha um e ele fica neste chat.
- **Upload a map picture** coloca a sua própria sob os lugares, ajustada ao tabuleiro com sua proporção mantida.
- **No picture (the dotted grid)** retira a imagem; o menu então oferece **Use the automatic map again**.

Mover os lugares ou mudar a imagem nunca move um para dentro do outro: os lugares mantêm onde você os colocou.

## Vários mapas e desenhar um mapa

Um chat pode conter vários mapas, cada um com sua própria imagem, lugares, estradas e escala (Cidade, Região, Mundo), e o menu da engrenagem pode pintar uma imagem com o modelo de imagem. Ambos estão em [[places-map-levels|Vários mapas e desenhar um mapa]]. A viagem em um mapa leva minutos, horas ou dias conforme sua escala (veja "Viagem por um toque" abaixo).

## O que ele não faz

Ele não inventa lugares (o World DM faz isso, veja [[world-dm]]). Lugares que o DM aposentou saem do mapa.
