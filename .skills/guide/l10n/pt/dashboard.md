<!-- source: a32bcafee83b -->
# O painel da cena

O Dashboard é um painel ao lado do chat que acompanha a cena: quem está presente, como cada personagem se sente em relação a você, o que vestem e sabem, os fios da história em aberto. É para quem quer que a história lembre relacionamentos e detalhes entre respostas. O artigo de Ajuda *Scene dashboard* lista seus campos.

## O que ele acompanha

Abra-o clicando em um retrato no chat e escolhendo Dashboard. O painel lateral tem quatro abas: **Person** (atitude, humor e estado, roupa e coisas: o que vestem, seguram e carregam, e o que está por perto), **Here** (lugar, clima, quem está presente), **Quests** (os fios em aberto: principal, secundário, cotidiano) e **Notes** (o caderno: o que um personagem sabe, e se viu, ouviu ou supôs). A "Constellation" nomeia como um personagem se posiciona em relação a você, por exemplo Friendship ou Romance. Um número em uma aba conta as mudanças desde sua última resposta (vermelho quando algo caiu). A visão ampla também tem um Journal com o pensamento e as lembranças de um personagem. No celular o mesmo conteúdo abre como uma folha.

**Uma pessoa listada duas vezes.** Se o Dashboard mostra a mesma pessoa sob dois nomes (digamos "Sina" e "Sina Rose"), abra um deles e use o pequeno botão de pessoas no cabeçalho de Person, depois "Same person as..." e escolha o outro. Você é perguntado antes: as notas, o histórico e as coisas passam para a pessoa que você escolheu, os números de relacionamento dela permanecem, o nome se torna outro nome dela, e isso não pode ser desfeito. O Dashboard também sugere prováveis duplicatas sozinho: uma caixa no topo da aba Person (e um chip "Possible duplicate" em "Since your last reply") diz "X may be the same person as Y" com o motivo. "Merge into Y" faz o mesmo que o menu; "Different people" mantém as duas separadas e o Dashboard para de sugerir esse par. O mesmo menu tem "Not in the scene" para alguém que a história apenas menciona, mas que um modelo colocou na cena: a pessoa sai da lista de "presentes", continua conhecida com suas notas, e o Dashboard não a recoloca a menos que ela fale (o aviso tem "Undo", e depois o menu oferece "Put back in the scene"). "Remove from the Dashboard" é para um nome que está simplesmente errado: ele tira a pessoa de todos os estados salvos.

Um personagem que está em contato de outro lugar (uma mensagem, uma carta, uma ligação, um vídeo) é marcado assim na linha da cena, com mais uma frase curta sobre o que chega até ele: por mensagem ou carta apenas as palavras enviadas; por ligação apenas a voz e os sons perto do telefone; por vídeo apenas o que está na câmera e o que se ouve perto dela. Uma ação silenciosa, como ligar a chaleira, não é conhecida por ele.

Os números (trust, comfort, attraction, respect, affection, e mais) são calculados por código a partir de eventos que um modelo relata, e ajustados pelo [[soul]] de cada personagem. O estado é mantido por mensagem, então um swipe ou uma mensagem apagada nunca deixa números desatualizados.

O botão "Story, move" ao lado de Send arma um empurrão de uma vez só para a próxima resposta; sua seta escolhe uma quest em aberto ou uma reviravolta.

## O que mudou, no chat

Sob a resposta mais recente, uma linha discreta diz o que o Dashboard registrou para ela: "Changed: Ada · trust fell, mood calm → tense, +2". Toque nela para desdobrar os mesmos chips da linha "Since your last reply" do Dashboard; um chip abre a aba correspondente do Dashboard (no celular, sua folha inferior). Respostas mais antigas não mostram nada, e a linha espera enquanto uma resposta está sendo escrita ou o Dashboard ainda está atualizando. Para escondê-la, desligue "Show what changed under the newest reply" em Settings > Chat Behavior.

## Laços entre personagens

O sensor anota como dois personagens que não são você se posicionam um em relação ao outro, como um papel de uma palavra e um calor de uma palavra ("rival, cold"). O prompt da resposta carrega até quatro desses como uma linha curta, apenas para pessoas na cena. A própria resposta de um personagem recebe apenas os laços dos quais aquele personagem faz parte; um narrador recebe primeiro os laços das pessoas sobre as quais o turno trata.

## O que um personagem disse, e mentiras

Sob o caderno de uma pessoa, a lista **Said** guarda as coisas fortes que ela disse e às quais está presa: um voto, uma ameaça, uma confissão, uma ordem. Uma mentira também é guardada ali, coberta até você escolher "Show hidden".

Quando um personagem mente na frente de outros, os outros tomam como verdade. Suas próximas respostas tratam isso como algo que lhes foi dito e que não têm motivo para duvidar, até a história mostrar o contrário. Apenas as pessoas que estavam na cena são enganadas, e apenas em suas próprias respostas: outra pessoa falando não repete a mentira.

Abra uma mentira e você vê **Believe it:** com um botão para cada pessoa que ainda acredita nela. Aperte um nome quando aquela pessoa tiver descoberto. O menu da linha também tem **This was a lie** para uma declaração que o sensor não classificou como tal (as pessoas na cena então acreditam nela), e **Not a lie** quando o sensor errou. O sensor encerra a crença sozinho quando uma resposta mostra a verdade vindo à tona. Remover a mentira da lista remove todas as crenças junto.

> O narrador dá voz a todos em uma única resposta, então sempre sabe a verdade. Isso apenas impede que um personagem aja com base no que outro personagem sabe.

## Quando ele atualiza

O botão "Settings" dentro do Dashboard abre suas configurações; a aba Sensor tem o modo:

- **Sensor** (padrão): após cada resposta um modelo lê as novas mensagens e relata o que aconteceu.
- **Fast: inside the story reply**: para modelos fortes. O modelo da história escreve o relatório ele mesmo no fim de sua resposta, sem uma chamada separada, adicionando alguns tokens a cada resposta. Se ele deixar o relatório de fora, o sensor usual roda.
- **Manual**: ele atualiza apenas quando você aperta "Refresh".

## Quanto custa

No modo Sensor, uma chamada extra de modelo por resposta, no "Sensor model" (o modelo do chat se você deixar vazio). Um modelo barato e pequeno basta. Ele lê as novas mensagens inteiras (até cerca de 12000 caracteres juntos; uma resposta mais longa perde apenas o meio), e o código primeiro marca as frases que parecem roupa, vestir-se ou um beijo e aponta o modelo para elas, então uma saia nomeada uma vez no meio de uma resposta longa ainda chega ao outfit. Se um card de personagem tem uma linha "Attire:", o sensor também a recebe como referência para o texto exato de uma peça que o texto menciona (ele nunca adiciona uma peça que o texto não mostra). O que um personagem veste e segura é mantido como uma lista de itens; uma peça que fica rasgada ou suja continua um item. Cada coisa mantém uma identidade onde quer que vá: vestida, tirada na porta, entregue a outra pessoa. Coisas deixadas em um lugar ficam lá: quando a história volta ao café, a xícara ainda está na mesa. Quando a história não mostra o que alguém veste por cerca de seis turnos, o modelo de escrita é solicitado a mencioná-lo, brevemente. Para adicionar palavras de um idioma que a varredura não conhece, liste-as em `data/dashboard/lexicon.json` (`{"wear": ["..."], "touch": ["..."]}`); `{"off": true}` desliga a varredura. O Dashboard também adiciona um curto "Prompt insert" ao que o modelo da história lê, para que os personagens saibam onde estão: você pode desligá-lo e definir "Tokens per character". "What the model sees" nas configurações mostra o insert.

## Como desligá-lo

Não há um interruptor de desligar separado nas telas listadas aqui. Defina o modo como "Manual" e ele nunca chama um modelo sozinho. Para removê-lo completamente, desative o plugin Dashboard no botão Plugins de Molfar Vertep; Tools > Plugins em Roleplay apenas lista o que roda. Desligue "Prompt insert" se quiser que ele fique fora da requisição.

## Relacionado

[[soul]] o alimenta; [[litopys]] usa suas notas; [[memory]] o compara com os outros tipos de memória.
