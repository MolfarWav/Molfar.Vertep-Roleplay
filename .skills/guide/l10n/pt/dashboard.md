<!-- source: 36ebfb6daad6 -->
# O Dashboard de cena

O Dashboard é um painel ao lado do chat que acompanha a cena: quem está presente, como cada personagem se sente a seu respeito, o que vestem e sabem, os fios abertos da história. É para quem quer que a história se lembre de relações e detalhes entre respostas. O artigo de Ajuda *Dashboard de cena* lista seus campos.

## O que ele acompanha

Abra-o clicando em um retrato no chat e escolhendo Dashboard. O painel lateral tem quatro abas: **Pessoa** (atitude, humor e estado, roupa e coisas), **Aqui** (lugar, clima, quem está presente), **Missões** (os fios abertos: principais, secundários, cotidianos) e **Notas** (o caderno: o que um personagem sabe, e se viu, ouviu ou adivinhou). A "Constelação" nomeia como um personagem se posiciona em relação a você, por exemplo Amizade ou Romance. Um número em uma aba conta mudanças desde sua última resposta (vermelho quando algo caiu). A visão ampla também tem um Diário com o pensamento e as lembranças de um personagem. No telefone, o mesmo conteúdo abre como uma folha.

**Uma pessoa listada duas vezes.** Se o Dashboard mostrar a mesma pessoa sob dois nomes (digamos "Sina" e "Sina Rose"), abra uma delas e use o botão pequeno de pessoas no cabeçalho de Pessoa, depois "Mesma pessoa que..." e escolha a outra. Primeiro você é perguntado: as notas, o histórico e as coisas se movem para a pessoa que você escolheu, os números de relação delas permanecem, o nome se torna outro nome dela, e isso não pode ser desfeito. O próprio Dashboard também sugere prováveis duplicatas: uma caixa no topo da aba Pessoa (e um selo "Possível duplicata" em "Desde sua última resposta") diz "X pode ser a mesma pessoa que Y" com o motivo. "Fundir em Y" faz o mesmo que o menu; "Pessoas diferentes" as mantém separadas e o Dashboard para de sugerir esse par. O mesmo menu tem "Remover do Dashboard" para um nome que está simplesmente errado.

Os números (confiança, conforto, atração, respeito, afeição e mais) são calculados por código a partir de eventos que um modelo relata, e inclinados pela [[soul]] de cada personagem. O estado é mantido por mensagem, então um deslize ou uma mensagem apagada nunca deixa números obsoletos.

O botão "História, movimento" ao lado de Enviar arma um empurrão único para a próxima resposta; sua seta escolhe uma missão aberta ou uma reviravolta.

## Quando ele atualiza

O botão "Configurações" dentro do Dashboard abre suas configurações; a aba Sensor tem o modo:

- **Sensor** (padrão): após cada resposta, um modelo lê as novas mensagens e relata o que aconteceu.
- **Rápido: dentro da resposta da história**: para modelos fortes. O modelo de história escreve o próprio relatório no fim de sua resposta, sem chamada separada, adicionando alguns tokens a cada resposta. Se ele omitir o relatório, o sensor comum executa.
- **Manual**: atualiza somente quando você pressiona "Atualizar".

## O que custa

No modo Sensor, uma chamada extra de modelo por resposta, no "Modelo sensor" (o modelo do chat se você o deixar vazio). Um modelo barato e pequeno é suficiente. Ele lê as novas mensagens por inteiro (até cerca de 12000 caracteres juntos; uma resposta mais longa perde apenas o meio), e o código primeiro marca as frases que parecem roupa, vestir ou um beijo e aponta o modelo para elas, para que uma saia nomeada uma vez no meio de uma resposta longa ainda chegue à roupa. Se o cartão de um personagem tiver uma linha "Traje:", o sensor também a recebe como referência para a redação exata de uma peça que o texto menciona (ele nunca adiciona uma peça que o texto não mostra). O que um personagem veste e segura é mantido como uma lista de itens; uma peça que rasga ou suja permanece um item. Cada coisa mantém uma identidade onde quer que vá: vestida, tirada junto à porta, entregue a outra pessoa. Coisas deixadas em um lugar permanecem lá: quando a história volta ao café, a xícara ainda está sobre a mesa. Quando a história não mostra o que alguém veste por cerca de seis turnos, pede-se ao modelo de escrita que o mencione, brevemente. Para adicionar palavras de um idioma que a varredura não conhece, liste-as em `data/dashboard/lexicon.json` (`{"wear": ["..."], "touch": ["..."]}`); `{"off": true}` desliga a varredura. O Dashboard também adiciona uma "Inserção de prompt" curta ao que o modelo de história lê, para que os personagens saibam onde estão: você pode desligá-la e definir "Tokens por personagem". "O que o modelo vê" nas configurações mostra a inserção.

## Como desligá-lo

Não há um interruptor separado de desligar nas telas listadas aqui. Defina o modo como "Manual" e ele nunca chama um modelo sozinho. Para removê-lo completamente, desative o plugin do Dashboard no botão Plugins do Molfar Vertep; Ferramentas > Plugins no Roleplay apenas lista o que executa. Desligue a "Inserção de prompt" se quiser que ela fique fora da solicitação.

## Relacionados

[[soul]] o alimenta; [[litopys]] usa suas notas; [[memory]] o compara com os outros tipos de memória.
