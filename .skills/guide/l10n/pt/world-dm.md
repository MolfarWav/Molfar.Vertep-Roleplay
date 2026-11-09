<!-- source: 391865a01e80 -->
# Mestre do Mundo

O Mestre do Mundo é um mestre de jogo para o mundo de um chat. Após as respostas, ele lê a história e guarda as pessoas, lugares e coisas que encontra no lorebook do próprio chat, chamado livro de mundo. Em níveis mais altos, ele também move o mundo e envia eventos para a cena. Use-o quando quiser que o mundo pareça vivo e consistente.

## Níveis

Abra-o no cabeçalho do chat, "World" (no telefone, Menu, depois World), ou na seção **World** da barra lateral. Escolha o que o DM faz:

- **Off**: sem eventos e sem dados. O livro de mundo ainda se preenche da história: quando a cena nomeia um novo lugar ou coisa, uma pequena chamada pergunta ao modelo de DM se deve registrá-lo.
- **Chronicler**: apenas registra, e não adiciona eventos próprios.
- **Living world**: facções e ameaças se movem fora de cena. Notícias podem chegar aos personagens como rumor; nada é forçado.
- **Director**: traz ganchos, complicações e visitantes para a cena, e a próxima resposta deve usá-los.
- **Antagonist**: consequências e pressão voltadas ao que os personagens valorizam.
- **Total chaos**: qualquer coisa pode acontecer, seja qual for o gênero. Ele nunca reescreve a história e respeita cenas explícitas.

Por padrão, o DM já está ligado no nível Chronicler em um chat de história, desde sua primeira resposta (não para um chat cujos cartões são todos assistentes). Desligue-o no Overview da folha World se não o quiser.

## O que ele faz a cada turno

Ele executa após as respostas, a cada N respostas ("Run after every N replies"), ou imediatamente com "World turn". Ele lê as novas mensagens e escreve ou aposenta registros no livro de mundo: pessoas, lugares, coisas e quem as possui. Você pode dar a um registro de Group ou Place **Members** (as pessoas que pertencem) na aba World book; um fato contado a esse grupo no Litopys passa então a ser conhecido por cada um deles ([[litopys]]). O DM não preenche Members sozinho. De Living world para cima, ele também move frentes e relógios, e pode preparar um evento que é adicionado à próxima resposta. Com **Code** movendo os relógios (World > Profiles > Options), a cada N respostas o código rola um d6 para cada frente: 1-2 nada, 3-4 um passo, 5-6 um passo e o DM é avisado de que notícias dessa frente podem chegar à história. Dados opcionais (folha World, Dice, de Living world para cima, desligados por padrão): antes de uma resposta, o código rola 2d6 e diz ao modelo como uma ação incerta termina, como Hint ou Binding.

Ele custa uma chamada extra de modelo sempre que é devido, no "DM model (all chats)"; um modelo pequeno e barato é suficiente. Uma execução com falha aparece na folha e na Inbox, e o DM lê as mesmas mensagens de novo na próxima vez.

## Ao apagar ou fazer swipe em uma resposta

Apague uma resposta, ou faça swipe para outra, e o DM desfaz o que aprendeu com a antiga: registros, relógios e um evento em espera voltam ao que eram, o livro de mundo é escrito de novo, e o DM relê a história a partir dali.

Registros que você mudou à mão permanecem, a menos que o DM tenha mudado o mesmo registro depois. Um registro que você apagou continua apagado. Apagar mensagens antigas do topo, ler outros swipes de uma resposta antiga e editar o texto de uma resposta não desfazem nada.

## Abas da seção World

O ícone de engrenagem ao lado do título da lista World abre **World settings**, em blocos dobráveis como as configurações do Litopys: o modelo de jogo (com um interruptor para substituí-lo neste World, o limite de respostas e um botão de teste), o modelo de construção, o modelo de imagem, o interruptor de fundos e se você é avisado sobre falhas. Um bloco dobrado mostra o que está configurado em uma linha.

No chat escolhido: Overview (os mesmos controles da folha), Places (uma árvore de lugares, com uma imagem de fundo por lugar), World book (ler, escrever, aposentar ou apagar registros à mão), Runs (histórico, tokens, erros), Start (rascunhar registros a partir de cartões ou de uma entrevista curta), Backgrounds (planejar e desenhar um conjunto de imagens; com "Change the background by scene" ligado, o Dashboard escolhe a adequada; com "Draw places that have no picture" também ligado (ele fica sempre listado ali, esmaecido até a troca de cena e a geração de imagens estarem ligadas), um lugar para o qual a história vai e que não tem imagem é desenhado na hora pelo modelo de imagem do World e arquivado na pasta; "Look of the pictures" ali aceita algumas palavras em inglês (por exemplo `medieval fantasy, candlelight`) que são acrescentadas a todo fundo desenhado para o chat, a um lugar desenhado na hora ou a um conjunto; a folha Display do chat tem um link aqui). Também **Profiles** e **Worlds**.

## Perfis de mundo

Cada nível é um perfil embutido: os cinco guardam os prompts do DM, e você pode abrir um, mudar um bloco de prompt e revertê-lo ao padrão. Você também pode criar perfis próprios sobre um nível. Um chat escolhe seu perfil na folha do DM. "Saved worlds" guarda mundos que você construiu e nos quais inicia chats novos; "New world" constrói um antes de qualquer chat, a partir de cartões ou de uma entrevista curta.

Relacionados: [[memory]], [[dashboard]]. Os artigos de Ajuda *World profiles* e *Starting a world* têm as telas.
