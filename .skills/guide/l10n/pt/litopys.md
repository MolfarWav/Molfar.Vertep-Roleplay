<!-- source: 9004c118e307 -->
# Litopys: o registro da história

O Litopys (a crônica) é a memória longa de um chat. Ele lê a história em segundo plano e escreve um capítulo para cada cena concluída, mais os fatos que a história estabeleceu. Quando um chat cresce demais para a janela do modelo, o registro carrega a história adiante. Use-o para histórias longas; você não precisa iniciá-lo.

## Capítulos e fatos

- Um **capítulo** diz o que mudou em uma cena, não uma recontagem. Ele é escrito quando a próxima cena começa, então a cena mais recente pode ainda não ter um. Um novo lugar ou um salto no tempo encerra uma cena; você também pode marcar um trecho de mensagens como cena, no menu "Mais" de uma mensagem, em História.
- Um **fato** é uma frase curta que permanece verdadeira: "Medli esconde as asas no mercado." Fatos têm um tipo, um peso (Cotidiano, Importante, Chave) e quem os conhece. Você pode adicionar, editar, fixar ou aposentar fatos manualmente.
- **Propostas** são sugestões do Litopys: fundir dois fatos, aposentar um, reformular, fixar. Você aceita ou rejeita cada uma.
- **Hábitos** que um personagem mostra claramente também podem aparecer, e se tornam um hábito após se repetirem em várias cenas.

## Onde olhar

Pressione **Registro** no cabeçalho do chat (no telefone, no Menu) para o registro deste chat em um painel lateral. A seção **Biblioteca** da barra lateral mostra o registro de todos os chats. Ela tem duas visões: Visão geral (uma linha do tempo, um cartão por personagem, propostas pendentes) e Detalhes com as abas Capítulos, Fatos, Propostas, Hábitos e Atividade. A aba Atividade registra o que o Litopys fez, com Desfazer onde possível. A engrenagem ("Configurações do Litopys") define como o registro é escrito.

## O que entra no prompt

Por padrão, o registro é inserido automaticamente. "Tamanho da memória" diz quantos tokens ele pode ocupar: Compacto (800 tokens) por padrão, Automático (15% da janela do modelo, no mínimo 800) ou Personalizado de 200 até 16000. Quando tudo cabe, tudo é enviado; caso contrário, as partes que mais importam para a cena. Um modelo pequeno quer um tamanho pequeno. "Capítulos e fatos" desligado significa nenhum capítulo ou fato novo e nada adicionado ao prompt.

Mensagens mais antigas só podem sair do prompt quando a janela está cheia, ou cena por cena quando um capítulo as cobre; a configuração "Mensagens mais antigas saem do prompt" escolhe.

## Sugestões e arrumação

"Sugestões" é "Perguntar primeiro" por padrão: cada fixação e reescrita espera seu sim. A opção silenciosa aplica fixações e reescritas de imediato e as registra em Atividade. Aposentar e fundir sempre esperam por você. "Arrumar fatos automaticamente" procura duplicatas e contradições após 30 fatos novos, a uma chamada extra de modelo por 60 fatos.

## Reconstruir

"Reconstruir do zero" reescreve os capítulos e fatos a partir das mensagens em segundo plano, cerca de uma chamada de modelo a cada 30 segundos. Seus fatos próprios, editados e fixados, e capítulos editados permanecem, e o registro atual é usado até o novo ficar pronto. Ele se recusa a começar se nenhuma cena foi encerrada.

Se você editar mensagens depois que um capítulo foi escrito, esse capítulo é marcado como obsoleto e reescrito.

## Relacionados

O cartão de um personagem também pode manter memória de chats concluídos: veja [[memory]]. Os artigos de Ajuda *Litopys: capítulos e propostas*, *Fatos e propostas* e *Visão geral vs Detalhes* cobrem as telas.
