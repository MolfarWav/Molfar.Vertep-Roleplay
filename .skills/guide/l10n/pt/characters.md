<!-- source: fdd649d68f3c -->
# Personagens, personas e grupos

Tudo com que você joga vive em quatro seções: Characters, Groups, Personas e Marketplace. Esta página diz para que serve cada uma; os artigos de Ajuda *Your characters*, *The card editor tabs* e *Groups of characters* têm os detalhes.

## Cartões

Um cartão é um personagem: descrição, personalidade, cenário e uma primeira mensagem. Uma tag escrita `group: Guild of Ravens` ou `faction: Guild of Ravens` também coloca o personagem do cartão nesse grupo, então um fato de memória contado ao grupo é conhecido por eles ([[litopys]]). A seção Characters mostra seus cartões como grade ou lista, com busca, tags, pastas, favoritos (uma estrela) e várias ordenações. Abra um cartão para editá-lo. As edições ficam em um rascunho até "Save changes"; sair com edições não salvas pergunta primeiro.

O editor tem seis abas:

- **Core**: o texto do cartão, o diálogo e a saudação.
- **Profile**: a mesma descrição dividida em campos estruturados (identidade, aparência, objetivos). Cada salvamento os escreve de volta no texto do cartão. Um cartão narrador pode descrever um elenco inteiro aqui.
- **Soul**: como o personagem reage a você, mais hábitos. Veja [[soul]].
- **Memory**: chats concluídos de que o personagem se lembra. Veja [[memory]].
- **Lorebook**: livros vinculados a este cartão.
- **More**: cores e vozes, sprites, galeria, regex, configurações avançadas.

Um cartão pode interpretar vários personagens ao mesmo tempo (um narrador ou mestre de jogo). Em Colors, "Voices" dá a cada falante sua própria cor. Se você não listar vozes, o chat faz isso por você: um cartão que contém vários personagens (seções com o nome de cada um) colore sozinho as falas de cada personagem, cada um com uma cor diferente, e isso fica salvo com o chat. Em qualquer outro chat, abra o menu do chat, "Voice colors", e ligue o interruptor; "Spread colors" dá uma cor diferente a todos que você não escolheu. Isso precisa do Relationship dashboard, que fornece a lista de personagens.

## Personas

Uma persona é você: nome, pronomes, descrição, avatar. O modelo a vê onde quer que o prompt fale do usuário. "Use this persona" a torna seu padrão e troca o chat aberto para ela. Uma persona pode carregar seus próprios lorebooks e pode ser fixada a personagens escolhidos, para que chats novos com eles comecem com ela.

## Grupos

Um grupo coloca vários personagens em um chat. "New group" permite escolher os membros. O editor tem Overview, Members, Scene, Turns, Lore e Chats. A aba Turns decide quem responde: Narrator (uma resposta dá voz a todos) ou Each in turn. Um grupo novo começa como Narrator. Um grupo não é um cartão: apagar um grupo apaga seus chats, nunca seus membros. Membros sem uma cor própria recebem cores diferentes automaticamente.

## Obtendo cartões

- "Import card" aceita arquivos PNG ou JSON, um ou muitos, e links para Chub, RisuRealm, CharaVault, Botbooru ou um arquivo direto.
- O Marketplace busca em várias fontes ao mesmo tempo; abra um resultado para ler o cartão completo antes de importar. Cada fonte tem sua própria ordenação e filtro adulto, e algumas precisam de download manual.
- Exportar grava um PNG com o cartão dentro.
- "With Molfar" na Home (e em Lorebooks) pede ao Molfar que rascunhe um cartão ou um lorebook com você. Veja [[vertep:molfar]].

## Cartas dos cartões

Um cartão que você não joga há algum tempo pode lhe escrever um bilhete curto com a própria voz. O bilhete cai na Inbox (o "Waiting on you" da Home, o botão da Inbox na barra lateral) como uma Letter verde; ao abri-lo você vai para o chat antigo, ou começa um chat com um cartão com o qual você nunca jogou. Uma carta nunca escreve dentro de um chat e nunca inventa eventos.

Ela fica **desligada até você ligá-la**. Enquanto estiver desligada, um cartão verde "Let your characters write to you" fica no topo da seção Characters e em "Waiting on you" da Home: **Turn on** a liga na hora, **Not now** esconde o cartão de vez. Os números (dias de inatividade, cartas por dia, dias entre cartas de um mesmo cartão, o modelo de escrita) e os cartões que você parou ficam em Characters, More, Letters from cards. As cartas são verificadas a cada poucas horas enquanto o app está aberto: um chat parado há 14 dias, um cartão que você nunca jogou há 14 dias, e um cartão jogado sem Soul (uma vez). Se o modelo de escrita falhar três verificações seguidas (ou nenhum estiver definido), a Inbox mostra uma falha vermelha "Letters" com o motivo, e **Open** leva você às configurações de cartas; uma carta que chega, outro modelo ou desligar as cartas a limpa.

## Retratos para cartões sem um

Um cartão sem imagem própria (nenhuma, ou o avatar padrão) pode ser desenhado. **Um cartão:** no editor do cartão, "Draw" sob o retrato abre uma janela: escolha o modelo de imagem; um modelo de texto (o modelo de Card tasks) escreve uma descrição do cartão, que você pode editar, e o modelo de imagem a desenha. A imagem vai para a Gallery do cartão na hora, e "Use as portrait" a torna o avatar. **Muitos cartões:** em Characters, More, "Draw missing portraits (N)" pergunta qual modelo e depois os desenha um após o outro pelo cartão de progresso; Cancel para entre um cartão e outro, e um cartão que falha aparece listado com o motivo.

"Draw with" lista os modelos de imagem de Settings > Images: um ComfyUI ou Forge local ao lado de modelos de API. A primeira escolha é o modelo de imagem do próprio app (Extensions > Image generation); uma escolha aqui é lembrada só para retratos. Um modelo treinado por tags recebe uma linha de tags, um modelo de API recebe um parágrafo. Um cartão só com nome não tem o que descrever, e a janela avisa. A geração de imagens precisa estar ligada (Extensions); as janelas avisam e a abrem para você.

## O que um cartão não guarda

O estado do Dashboard, capítulos e fatos pertencem a cada chat, não ao cartão. A memória do cartão também não faz parte do cartão e nunca aparece em uma exportação. A Soul, em contraste, é salva no cartão.

Próximo: [[first-story]] para o primeiro chat, ou [[soul]] para o perfil de reação.
