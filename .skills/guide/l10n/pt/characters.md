<!-- source: 59593d4e7cf8 -->
# Personagens, personas e grupos

Tudo o que você usa para jogar fica em quatro seções: Characters, Groups, Personas e Marketplace. Esta página explica para que serve cada uma; os artigos de Ajuda *Your characters*, *The card editor tabs* e *Groups of characters* têm os detalhes.

## Cards

Um card é um personagem: descrição, personalidade, cenário e uma primeira mensagem. Uma tag escrita `group: Guild of Ravens` ou `faction: Guild of Ravens` também coloca o personagem do card nesse grupo, então um fato de memória contado ao grupo é conhecido por eles ([[litopys]]). A seção Characters mostra seus cards como grade ou lista, com busca, tags, pastas, favoritos (uma estrela) e várias ordenações. Abra um card para editá-lo. As edições ficam em um rascunho até "Save changes"; sair com edições não salvas pergunta antes.

O editor tem seis abas:

- **Core**: o texto do card, diálogo e saudação.
- **Profile**: a mesma descrição dividida em campos estruturados (identidade, aparência, objetivos). Cada salvamento os grava de volta no texto do card. Um card de narrador pode descrever um elenco inteiro aqui. Veja "A aba Profile" abaixo.
- **Soul**: como o personagem reage a você, além de hábitos. Veja [[soul]].
- **Memory**: conversas encerradas que o personagem lembra. Veja [[memory]].
- **Lorebook**: livros vinculados a este card.
- **More**: cores e vozes, sprites (veja [[sprites]]), galeria, regex, configurações avançadas.

Um card pode interpretar vários personagens ao mesmo tempo (um narrador ou mestre de jogo). Em Colors, "Voices" dá a cada falante sua própria cor. Se você não listar nenhuma voz, o chat faz isso por você: um card que contém vários personagens (seções nomeadas após cada um) colore as falas de cada personagem por conta própria, cada uma com uma cor diferente, mantida com o chat. Em qualquer outro chat, abra o menu do chat, "Voice colors", e ative o interruptor; "Spread colors" dá a todos que você não escolheu uma cor diferente. Isso precisa do Dashboard de Relationship, que fornece a lista de personagens. Quando as vozes estão pintadas, uma fala recebe a cor de quem a diz: o nome com que ela começa ("Rhea:"), um nome ao lado de um verbo de fala ("— Não, — diz Esh"), ou um ela ou ele que aponta para o único personagem desse gênero citado antes na mesma resposta ("— Tudo bem, — diz ela"). Um falante que não está na lista (um transeunte citado só na história) recebe uma cor própria, sempre a mesma, afastada das cores já usadas. Uma fala que não cita ninguém mantém a cor do falante anterior; antes de alguém ser citado, fica a cor do tema. Se a história chama um personagem por outro nome que o card (o card diz "Afrodite", a história diz "Ada"), o chat pode listar duas pessoas e colori-las separadamente. Duas formas de torná-las uma só: no Dashboard de Relationship, abra o menu do personagem e escolha "Same person as...", ou acrescente ao card uma linha como "Also called: Ada", para que o nome seja conhecido desde a primeira resposta. Uma palavra curta entre aspas no meio de uma frase ("chamou isso de «traição» e saiu") é lida como termo, não como fala, e não é colorida. Para ver por que uma fala recebeu sua cor, abra o menu do chat, "Voice colors", e ative "Show who speaks and why": uma pequena marca após cada citação indica o falante e a regra.

## A aba Profile

A aba é um formulário que escreve a Description e a Personality do card, que é o que os chats leem. Ela abre com uma linha dizendo isso, e o interruptor "Free write" abaixo: com Free write ativado você escreve Description e Personality por conta própria e os campos param de alterá-las (eles são mantidos, mas os chats não os veem). Aceitar "Structure it" desliga o Free write novamente.

Toda seção exceto Identity e Notes tem um interruptor "In chats". Uma seção desligada mantém seus campos mas não escreve texto, então os chats não a veem e cada chat carrega menos tokens; "Fill empty" também a ignora. Sexuality, Trauma e Circles começam desligadas até você ativá-las ou preenchê-las.

Três botões ficam sob o painel "Models", cada um com o modelo que usa escrito abaixo dele:

- "Structure it" organiza o texto do card nos campos. Ele lê um card longo em partes.
- "Fill empty" propõe valores apenas para campos vazios. O retrato acompanha apenas os campos de Appearance, para o modelo de imagem; todo o resto vai para o modelo de texto sem a imagem. Um pedido para ambos são duas chamadas e uma proposta para revisar. Em um card maior que a janela do modelo, ele lê as partes que importam para os campos que preenche (o texto de Personality para traços, medos e objetivos, a Description para aparência e histórico), e a proposta diz quanto do card ele leu.
- "Read from picture" reescreve os campos de Appearance a partir do retrato ou de uma imagem que você anexar. "Rewrite fields that are already filled" fica marcado a menos que você desmarque, e a janela lembra sua escolha.

"Models" guarda duas escolhas para este card, salvas com "Save changes": o modelo de texto (Structure it, Fill empty, a avaliação de Soul) e "Reading the portrait". "Don't send the portrait" mantém o Fill empty apenas com texto; Read from picture ainda funciona. Uma escolha para cada card fica em Roleplay settings, "Card tasks".

## Personas

Uma persona é você: nome, pronomes, descrição, avatar. O modelo a vê onde quer que o prompt fale do usuário. "Use this persona" a torna sua padrão e muda o chat aberto para ela. Uma persona pode carregar seus próprios lorebooks e pode ser fixada a personagens escolhidos, para que novos chats com eles comecem com ela. A aba Lorebooks de uma persona lista os livros que ela carrega (abra um, desvincule-o, adicione mais de uma lista que você pode pesquisar, ou comece um novo). Uma persona pode ter um livro próprio ("New book" em uma aba vazia o cria, "Replace" o troca): ele viaja dentro do arquivo da persona, então Export e Backup o carregam e importar o arquivo em outro dispositivo o traz de volta, vinculado. Livros que ela apenas vincula ficam na biblioteca daquele dispositivo; um vínculo cujo livro está faltando aparece como uma linha "Not in your library" que você pode remover. Import na tela Personas aceita uma persona de outro app (um nome e uma descrição), um backup de várias, ou uma lista `{ name: description }`; uma persona que nomeia livros que você ainda não importou é importada mesmo assim, com uma nota de quais estão faltando.

## Groups

Um grupo coloca vários personagens em um único chat. "New group" abre um seletor (pesquisa, favoritos, tags, ordem de fala); "Next" cria o grupo e abre seu editor, onde "Start chat" inicia o primeiro chat. O editor tem Overview, Members, Scene, Turns, Direction, Lore e Chats. A aba Direction e a barra em um chat de grupo são descritas em [[direction]]. A aba Turns decide quem responde: Narrator (uma resposta fala por todos) ou Each in turn. Um novo grupo começa como Narrator.

A aba Turns também tem **How they talk**: **Interruptions** (membros interrompem, falam por cima uns dos outros ou ignoram uma pergunta quando combina com o personagem), **Own goals** (membros objetam, barganham ou recusam quando um plano vai contra quem eles são, mesmo que crie tensão com você) e **Draw in quiet members** (alguém que está quieto há um tempo recebe mais chances de responder, e uma cena narrada é solicitada a trazê-lo). Os dois primeiros são Off, Can ou Should: Can permite quando combina com a cena, Should espera isso, e se toda resposta vira uma discussão, volte para Can. Novos grupos começam com Can e Draw in ativados; grupos mais antigos mantêm tudo desligado até você ativar. O botão Turns do próprio chat pode alterá-los apenas para um chat. Na aba Members, abra a seção "In this group" de um membro para dar a ele uma **voice** que só este grupo usa: até dois hábitos de fala (fala em fragmentos, nunca faz perguntas) e até cinco falas de exemplo. Algumas linhas ensinam o ritmo melhor que adjetivos, e personagens diferentes devem responder à mesma notícia de formas diferentes.

Um grupo não é um card: excluir um grupo exclui seus chats, nunca seus membros. Membros sem cor própria recebem cores diferentes automaticamente.

## Obtendo cards

- "Import card" aceita arquivos PNG ou JSON, um ou muitos, e links para Chub, RisuRealm, CharaVault, Botbooru ou um arquivo direto.
- O Marketplace pesquisa várias fontes ao mesmo tempo; abra um resultado para ler o card completo antes de importar. Cada fonte tem sua própria ordenação e filtro adulto, e algumas precisam de download manual.
- Export grava um PNG com o card dentro.
- "With Molfar" em Home (e em Lorebooks) pede ao Molfar para rascunhar um card ou um lorebook com você. Veja [[vertep:molfar]].

## Cartas dos cards

Um card que você não joga há um tempo pode escrever uma nota curta na própria voz dele. A nota chega na caixa de entrada ("Waiting on you" do Home, o botão de caixa de entrada na barra lateral) como uma Letter verde; abri-la leva você ao chat antigo, ou inicia um chat para um card que você nunca jogou. Uma carta nunca escreve em um chat e nunca inventa eventos.

Fica **desligado até você ativar**. Enquanto está desligado, um card verde "Let your characters write to you" aparece no topo da seção Characters e em "Waiting on you" do Home: **Turn on** ativa na hora, **Not now** esconde o card de vez. Os números (dias de inatividade, cartas por dia, dias entre cartas de um card, o modelo de escrita) e os cards que você parou ficam em Characters, More, Letters from cards. As cartas são verificadas a cada poucas horas enquanto o app está aberto: um chat inativo por 14 dias, um card que você nunca jogou por 14 dias, e um card jogado sem Soul (uma vez). Se o modelo de escrita falhar três verificações seguidas (ou nenhum estiver definido), a caixa de entrada mostra uma falha vermelha "Letters" com o motivo, e Open leva você às configurações de Letters; uma carta que chega, um modelo diferente ou desligar as cartas limpa isso.

## Retratos para cards sem um

Um card sem imagem própria (nada, ou o avatar padrão) pode ser desenhado. **Um card:** no editor do card, "Draw" sob o retrato abre um diálogo: escolha o modelo de imagem, um modelo de texto (o modelo de Card tasks) escreve uma descrição do card, que você pode editar, e o modelo de imagem a desenha. A imagem vai para a Gallery do card na hora e "Use as portrait" a torna o avatar. **Muitos cards:** Characters, More, "Draw missing portraits (N)" pergunta qual modelo e depois os desenha um após o outro pelo card de progresso; Cancel para entre cards e um card que falha é listado com o motivo.

"Draw with" lista os modelos de imagem de Settings > Images: um ComfyUI ou Forge local ao lado de modelos de API. A primeira escolha é o modelo de imagem do próprio app (Extensions > Image generation); uma escolha aqui é lembrada apenas para retratos. Um modelo treinado em tags recebe uma linha de tags, um modelo de API um parágrafo. Um card que tem apenas um nome não tem nada a descrever, e o diálogo avisa isso. A geração de imagem precisa estar ativada (Extensions); os diálogos avisam e a abrem para você.

## O que um card não guarda

O estado do Dashboard, os capítulos e os fatos pertencem a cada chat, não ao card. A aba Memory do card (hábitos mantidos, "How they changed") também não faz parte do card e nunca aparece em uma exportação. A Soul, por outro lado, fica salva no card.

A seguir: [[first-story]] para o primeiro chat, ou [[soul]] para o perfil de reação.
