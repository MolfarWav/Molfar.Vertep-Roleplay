<!-- source: 4799ca6e92d8 -->
# Vários mapas e desenhar um mapa

Um chat pode ter mais de um mapa no mapa de lugares (um país, uma cidade, uma masmorra), e qualquer mapa pode ganhar uma imagem pintada pelo modelo de imagem. Esta página é para quem joga em um mundo com mais de uma escala. O básico do mapa está em [[places-map]].

## Vários mapas

Um chat pode ter mais de um mapa: um país, a planta de uma cidade, uma masmorra. Cada um tem sua própria imagem, lugares, estradas e escala. Abra o menu de engrenagem e escolha **Mapas deste chat**: o primeiro mapa é listado, **Adicionar um mapa** cria outro. Para cada mapa você define:

- **Nome.**
- **Escala:** Cidade (um trajeto leva minutos: ruas, um prédio, um nível de masmorra), Região (horas: vilas, bosques e estradas entre eles) ou Mundo (dias: cidades e terras distantes). A escala define quanto tempo leva um trajeto naquele mapa e quais formas de viagem são oferecidas: a pé, a cavalo e pular a estrada em qualquer lugar, um táxi nos mapas de cidade e região, o metrô nos mapas de cidade.
- **Planta de:** o lugar do qual este mapa é a planta (o mapa de uma cidade é a planta daquela cidade), ou nenhum.

Quando houver vários mapas, uma linha abaixo do cabeçalho mostra o mapa que você está vendo com um acento circunflexo: pressione-o para trocar, ou para abrir a lista novamente. O mapa que você está vendo é lembrado por chat neste navegador. Um mapa que é a planta de um lugar mostra uma seta de voltar para o mapa que contém aquele lugar.

**Um lugar fica apenas nos mapas em que você o coloca.** **Lugares neste mapa** (menu de engrenagem) lista cada lugar com uma marcação: marque um lugar para mostrá-lo neste mapa, desmarque para removê-lo apenas deste mapa (seus cômodos vão junto; um lugar em nenhum mapa volta para o mapa em que a história está). Um novo lugar que o DM adiciona vai para o mapa em que a história está; uma nova cidade, vila ou castelo também vai para os mapas de região e de mundo. Um novo mapa de região ou de mundo começa com as cidades, vilas e castelos que você já tem. Um novo mapa de cidade começa vazio e avisa isso, com um botão para a mesma lista.

**Um lugar que tem um mapa próprio** ganha um botão **Abrir o mapa deste lugar** em seu cartão; **Criar um mapa deste lugar** no seu menu de três pontos cria um mapa vazio que é sua planta e o abre. Um lugar que você abre a partir do mapa do país é o mesmo lugar que no mapa da cidade; o lugar da história no mapa do país é a cidade cuja planta o contém (enquanto a história está na taverna da cidade, o mapa do país marca a cidade).

Uma estrada é mantida no mapa que tem ambos os seus lugares. A viagem acontece dentro de um único mapa: no mapa de mundo você vai de cidade em cidade e a história chega à própria cidade; para ir a uma taverna nela, abra o mapa da cidade (a seta de voltar e o botão Abrir alternam entre eles) e vá a partir dali.

A imagem de um mapa é escolhida como qualquer outra (um mapa pronto, o seu próprio, nenhuma, ou desenhada): um mapa de Região ou de Mundo começa a partir de uma planta de região, quaisquer que sejam os lugares, um mapa de Cidade a partir da planta que combina com seus lugares.

## Desenhar um mapa

**Desenhar um mapa com o modelo de imagem** (menu de engrenagem) pinta uma imagem para o mapa em exibição com o modelo de imagem que você escolheu em Configurações > Imagens. A janela tem:

- **Que tipo de mapa:** região, continente, cidade murada, cidade portuária, vila, natureza selvagem, litoral, planta de casa, masmorra, cavernas, e os tipos da cidade moderna (centro, metrópole, subúrbio, distrito industrial, campus, orla, aeroporto, cidade pequena). Um mapa de Região começa em Região, um mapa de Mundo em Continente.
- **O que desenhar:** um prompt preenchido a partir do tipo e dos nomes dos lugares no mapa. Ele pede apenas o terreno (terra, água, estradas, lotes vazios) porque seus lugares são ícones colocados por cima. Altere como quiser; escolher outro tipo o reescreve até que você o tenha editado.
- Uma linha com o modelo de imagem e um lembrete de que cada imagem é uma chamada que pode custar dinheiro.

**Desenhar o mapa** faz uma chamada e mostra o resultado na janela; nada mudou ainda. **Usar este mapa** torna-o a imagem deste mapa (os outros mapas mantêm as suas), **Desenhar novamente** volta ao prompt. Se nenhum modelo de imagem estiver configurado, a chamada avisa isso; adicione um em Configurações > Imagens.
