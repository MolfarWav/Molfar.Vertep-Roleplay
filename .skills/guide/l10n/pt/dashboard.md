<!-- source: 6095bc511c69 -->
# O Dashboard de cena

O Dashboard é um painel ao lado do chat que acompanha a cena: quem está presente, como cada personagem se sente a seu respeito, o que vestem e sabem, os fios abertos da história. É para quem quer que a história se lembre de relações e detalhes entre respostas. O artigo de Ajuda *Dashboard de cena* lista seus campos.

## O que ele acompanha

Abra-o clicando em um retrato no chat e escolhendo Dashboard. O painel lateral tem quatro abas: **Pessoa** (atitude, humor e estado, roupa e coisas), **Aqui** (lugar, clima, quem está presente), **Missões** (os fios abertos: principais, secundários, cotidianos) e **Notas** (o caderno: o que um personagem sabe, e se viu, ouviu ou adivinhou). A "Constelação" nomeia como um personagem se posiciona em relação a você, por exemplo Amizade ou Romance. Um número em uma aba conta mudanças desde sua última resposta (vermelho quando algo caiu). A visão ampla também tem um Diário com o pensamento e as lembranças de um personagem. No telefone, o mesmo conteúdo abre como uma folha.

Os números (confiança, conforto, atração, respeito, afeição e mais) são calculados por código a partir de eventos que um modelo relata, e inclinados pela [[soul]] de cada personagem. O estado é mantido por mensagem, então um deslize ou uma mensagem apagada nunca deixa números obsoletos.

O botão "História, movimento" ao lado de Enviar arma um empurrão único para a próxima resposta; sua seta escolhe uma missão aberta ou uma reviravolta.

## Quando ele atualiza

O botão "Configurações" dentro do Dashboard abre suas configurações; a aba Sensor tem o modo:

- **Sensor** (padrão): após cada resposta, um modelo lê as novas mensagens e relata o que aconteceu.
- **Rápido: dentro da resposta da história**: para modelos fortes. O modelo de história escreve o próprio relatório no fim de sua resposta, sem chamada separada, adicionando alguns tokens a cada resposta. Se ele omitir o relatório, o sensor comum executa.
- **Manual**: atualiza somente quando você pressiona "Atualizar".

## O que custa

No modo Sensor, uma chamada extra de modelo por resposta, no "Modelo sensor" (o modelo do chat se você o deixar vazio). Um modelo barato e pequeno é suficiente. O Dashboard também adiciona uma "Inserção de prompt" curta ao que o modelo de história lê, para que os personagens saibam onde estão: você pode desligá-la e definir "Tokens por personagem". "O que o modelo vê" nas configurações mostra a inserção.

## Como desligá-lo

Não há um interruptor separado de desligar nas telas listadas aqui. Defina o modo como "Manual" e ele nunca chama um modelo sozinho. Para removê-lo completamente, desative o plugin do Dashboard no botão Plugins do Molfar Vertep; Ferramentas > Plugins no Roleplay apenas lista o que executa. Desligue a "Inserção de prompt" se quiser que ela fique fora da solicitação.

## Relacionados

[[soul]] o alimenta; [[litopys]] usa suas notas; [[memory]] o compara com os outros tipos de memória.
