<!-- source: 36f23a51ff05 -->
# O Dashboard de cena

O Dashboard é um painel ao lado do chat que acompanha a cena: quem está presente, como cada personagem se sente a seu respeito, o que vestem e sabem, os fios abertos da história. É para quem quer que a história se lembre de relações e detalhes entre respostas. O artigo de Ajuda *Scene dashboard* lista seus campos.

## O que ele acompanha

Abra-o clicando em um retrato no chat e escolhendo Dashboard. O painel lateral tem quatro abas: **Person** (atitude, humor e estado, roupa e coisas), **Here** (lugar, clima, quem está presente), **Quests** (os fios abertos: principais, secundários, cotidianos) e **Notes** (o caderno: o que um personagem sabe, e se viu, ouviu ou adivinhou). A "Constellation" nomeia como um personagem se posiciona em relação a você, por exemplo Friendship ou Romance. Um número em uma aba conta as mudanças desde sua última resposta (vermelho quando algo caiu). A visão ampla também tem um Journal com o pensamento e as lembranças de um personagem. No telefone, o mesmo conteúdo abre como uma folha.

**Uma pessoa listada duas vezes.** Se o Dashboard mostrar a mesma pessoa sob dois nomes (digamos "Sina" e "Sina Rose"), abra um deles e use o botão pequeno de pessoas no cabeçalho de Person, depois "Same person as..." e escolha o outro. Você é perguntado antes: as notas, o histórico e as coisas passam para a pessoa que você escolheu, os números de relação dela ficam, o nome vira outro nome dela, e isso não pode ser desfeito. O próprio Dashboard também sugere prováveis duplicatas: uma caixa no topo da aba Person (e um selo "Possible duplicate" em "Since your last reply") diz "X may be the same person as Y", com o motivo. "Merge into Y" faz o mesmo que o menu; "Different people" as mantém separadas, e o Dashboard para de sugerir esse par. O mesmo menu tem "Remove from the Dashboard" para um nome que simplesmente está errado.

Os números (confiança, conforto, atração, respeito, afeição e outros) são calculados pelo código a partir de eventos que um modelo relata, e inclinados pela [[soul]] de cada personagem. O estado é mantido por mensagem, então um deslize ou uma mensagem apagada nunca deixa números desatualizados.

O botão "Story, move" ao lado de Send arma um empurrão único para a próxima resposta; sua seta escolhe uma missão aberta ou uma reviravolta.

## O que mudou, no chat

Sob a resposta mais recente, uma linha discreta diz o que o Dashboard registrou para ela: "Changed: Ada · trust fell, mood calm → tense, +2". Toque nela para desdobrar os mesmos chips da linha "Since your last reply" do Dashboard; um chip abre a aba correspondente do Dashboard (no telefone, a folha de baixo). Respostas mais antigas não mostram nada, e a linha espera enquanto uma resposta está sendo escrita ou o Dashboard ainda está atualizando. Para escondê-la, desligue "Show what changed under the newest reply" em Settings > Chat Behavior.

## Laços entre personagens

O sensor registra como dois personagens que não são você se relacionam entre si, como um papel de uma palavra e um calor de uma palavra ("rival, cold"). O prompt da resposta leva até quatro deles em uma linha curta, só para as pessoas da cena. A resposta de um personagem recebe apenas os laços em que ele está; um narrador recebe primeiro os laços das pessoas de quem o turno trata.

## O que um personagem disse, e mentiras

Sob o caderno de uma pessoa, a lista **Said** guarda as coisas fortes que ela disse e às quais está presa: um voto, uma ameaça, uma confissão, uma ordem. Uma mentira também fica ali, escondida até você escolher "Show hidden".

Quando um personagem mente na frente de outros, os outros tomam como verdade. As respostas seguintes deles tratam aquilo como algo que lhes foi dito e não têm motivo para duvidar, até a história mostrar o contrário. Só as pessoas que estavam na cena são enganadas, e só nas próprias respostas: alguém que fala não repete a mentira.

Abra uma mentira e você vê **Believe it:** com um botão para cada pessoa que ainda acredita nela. Pressione um nome quando aquela pessoa descobrir. O menu da linha também tem **This was a lie** para uma afirmação que o sensor não classificou assim (as pessoas da cena então acreditam nela), e **Not a lie** quando o sensor errou. O sensor encerra a crença sozinho quando uma resposta mostra a verdade aparecendo. Remover a mentira da lista remove junto todas as crenças.

> O narrador dá voz a todos em uma só resposta, então sempre sabe a verdade. Isso só impede que um personagem aja com base no que outro personagem sabe.

## Quando ele atualiza

O botão "Settings" dentro do Dashboard abre suas configurações; a aba Sensor tem o modo:

- **Sensor** (padrão): após cada resposta, um modelo lê as novas mensagens e relata o que aconteceu.
- **Fast: inside the story reply**: para modelos fortes. O modelo de história escreve o próprio relatório no fim de sua resposta, sem chamada separada, adicionando alguns tokens a cada resposta. Se ele omitir o relatório, o sensor comum executa.
- **Manual**: atualiza somente quando você pressiona "Refresh".

## O que custa

No modo Sensor, uma chamada extra de modelo por resposta, no "Sensor model" (o modelo do chat se você deixá-lo vazio). Um modelo barato e pequeno é suficiente. Ele lê as novas mensagens por inteiro (até cerca de 12000 caracteres juntos; uma resposta mais longa perde apenas o meio), e o código primeiro marca as frases que parecem roupa, vestir ou um beijo e aponta o modelo para elas, para que uma saia nomeada uma vez no meio de uma resposta longa ainda chegue à roupa. Se o cartão de um personagem tiver uma linha "Attire:", o sensor também a recebe como referência para a redação exata de uma peça que o texto menciona (ele nunca adiciona uma peça que o texto não mostra). O que um personagem veste e segura é mantido como uma lista de itens; uma peça que rasga ou suja permanece um item. Cada coisa mantém uma identidade onde quer que vá: vestida, tirada junto à porta, entregue a outra pessoa. Coisas deixadas em um lugar permanecem lá: quando a história volta ao café, a xícara ainda está sobre a mesa. Quando a história não mostra o que alguém veste por cerca de seis turnos, pede-se ao modelo de escrita que o mencione, brevemente. Para adicionar palavras de um idioma que a varredura não conhece, liste-as em `data/dashboard/lexicon.json` (`{"wear": ["..."], "touch": ["..."]}`); `{"off": true}` desliga a varredura. O Dashboard também adiciona uma curta "Prompt insert" ao que o modelo de história lê, para que os personagens saibam onde estão: você pode desligá-la e definir "Tokens per character". "What the model sees" nas configurações mostra a inserção.

## Como desligá-lo

Não há um interruptor separado de desligar nas telas listadas aqui. Defina o modo como "Manual" e ele nunca chama um modelo sozinho. Para removê-lo por completo, desative o plugin do Dashboard no botão Plugins do Molfar Vertep; Tools > Plugins no Roleplay apenas lista o que roda. Desligue a "Prompt insert" se quiser que ela fique fora da solicitação.

## Relacionados

[[soul]] o alimenta; [[litopys]] usa suas notas; [[memory]] o compara com os outros tipos de memória.
