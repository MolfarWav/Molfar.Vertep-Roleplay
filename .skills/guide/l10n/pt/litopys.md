<!-- source: c68da6730f1a -->
# Litopys: o registro da história

O Litopys (a crônica) é a memória longa de um chat. Ele lê a história em segundo plano e escreve um capítulo para cada cena concluída, além dos fatos que a história já estabeleceu. Quando um chat cresce demais para a janela do modelo, o registro leva a história adiante. Use-o em histórias longas; você não precisa iniciá-lo.

## Capítulos e fatos

- Um **capítulo** diz o que mudou em uma cena, não uma recontagem. Ele é escrito quando a cena seguinte começa, então a cena mais recente pode ainda não ter um. Um novo lugar ou um salto no tempo encerra uma cena; você também pode marcar um trecho de mensagens como cena, pelo menu "More" de uma mensagem, em Story.
- Um **fato** é uma frase curta que continua verdadeira: "Medli esconde as asas no mercado." Os fatos têm um tipo, um peso (Everyday, Important, Key) e quem os conhece. Você pode adicionar, editar, fixar ou aposentar fatos manualmente.
- **Propostas** são sugestões do Litopys: fundir dois fatos, aposentar um, reformular, fixar. Você aceita ou rejeita cada uma.
- **Hábitos** que um personagem mostra com clareza também podem aparecer, e viram hábito depois de se repetirem em várias cenas.

## Onde olhar

Pressione **Record** no cabeçalho do chat (no telefone, no Menu) para ver o registro deste chat em um painel lateral. A seção **Library** da barra lateral mostra o registro de todos os chats. Ela tem duas visões: Overview (uma linha do tempo, um cartão por personagem, propostas aguardando) e Details, com as abas Chapters, Facts, Proposals, Habits e Activity. A aba Activity registra o que o Litopys fez, com Undo quando for possível. A engrenagem ("Litopys settings") define como o registro é escrito.

## O que entra no prompt

Por padrão, o registro é inserido automaticamente. "Memory size" diz quantos tokens ele pode ocupar: Auto por padrão (15% da janela do modelo, no mínimo 800 e no máximo 16000), Compact (800 tokens) ou Custom, de 200 até 16000. Auto deixa uma janela grande levar mais da história; em um modelo pequeno, ele fica perto de 800. Um tamanho que você salvou antes continua como estava. Quando tudo cabe, tudo é enviado; caso contrário, as partes que mais importam para a cena. Um modelo pequeno quer um tamanho pequeno. "Chapters and facts" desligado significa nenhum capítulo ou fato novo e nada acrescentado ao prompt.

Mensagens mais antigas só podem sair do prompt quando a janela estiver cheia, ou cena por cena, quando um capítulo já as cobre; a configuração "Older messages leave the prompt" define qual.

## Correspondência por sentido

A memória encontra fatos e capítulos pelas palavras. Com um modelo de embeddings, ela também os encontra pelo sentido: uma pergunta com outras palavras ainda chega ao fato. O cartão **Matching by meaning** (no topo do registro de um chat, e em Canvas > Prompt > Memory) mostra em que pé está: off, failing, no vectors yet, partly done, done ou made by another model. Configure o modelo uma vez em Settings > Memory: por padrão, o app usa primeiro um modelo no seu próprio computador (LM Studio ou Ollama), depois uma conexão de API com chave e, por fim, o OpenRouter. Quando uma chamada ao modelo de embeddings funcionar (um toque no botão do cartão, ou uma resposta), o motor preenche sozinho os vetores que faltam em todos os chats e arquivos do Data Bank, verificando a cada poucos minutos; o que passar de 300.000 tokens espera pelo botão, e o interruptor **Make vectors by itself** em Settings > Memory o desliga. O botão **Embed N items** diz antes quantos itens são e aproximadamente quantos tokens isso custa, e então faz o trabalho. Novas cenas geram embeddings dos seus novos itens de qualquer forma. Se você trocar o modelo de embeddings, os vetores antigos não são usados até você pressionar **Embed again**. O Data Bank tem cartão próprio, **Data Bank by meaning**, no topo de Settings > Data Bank: funciona do mesmo jeito para as passagens dos seus arquivos e para os livros de snapshot, e um arquivo que só está parcialmente coberto diz "7 of 12 by meaning".

## Sugestões e organização

"Suggestions" é "Ask me first" por padrão: cada fixação e reescrita espera o seu sim. A opção silenciosa aplica fixações e reescritas de imediato e as registra em Activity. Aposentar e fundir sempre esperam por você. "Tidy facts automatically" procura duplicatas e contradições depois de 30 fatos novos, com uma chamada extra ao modelo a cada 60 fatos.

## Reconstruir

"Rebuild from scratch" reescreve os capítulos e fatos a partir das mensagens, em segundo plano, com cerca de uma chamada de modelo a cada 30 segundos. Seus fatos próprios, editados e fixados, e os capítulos editados permanecem, e o registro atual continua em uso até o novo estar pronto. Ele se recusa a começar se nenhuma cena foi encerrada.

Se você editar mensagens depois que um capítulo foi escrito, esse capítulo é marcado como desatualizado e reescrito.

## Relacionados

O cartão de um personagem também pode guardar memória de chats concluídos: veja [[memory]]. Os artigos de Help *Litopys: chapters and proposals*, *Facts and proposals* e *Overview vs Details* cobrem as telas.
