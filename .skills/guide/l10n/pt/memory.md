<!-- source: fe19559d281a -->
# Qual memória para quê

O Roleplay tem várias coisas que "lembram". Elas diferem em quem as mantém, o que guardam e quanto tempo duram. Se um personagem esquece algo, esta página diz a qual delas recorrer.

## Os tipos

**Histórico do chat.** As próprias mensagens. O modelo vê tantas recentes quanto sua janela permite.

**Dashboard** ([[dashboard]]). Por chat, o estado *atual* da cena: quem está presente, sentimentos, roupas, missões abertas, o que cada personagem sabe. Muda a cada resposta.

**Litopys** ([[litopys]]). Por chat, o *passado* da história: um capítulo por cena concluída e uma lista de fatos. É nisso que um chat longo se apoia depois que mensagens mais antigas saem do prompt.

**Memória do cartão.** Por personagem, entre chats: o que o personagem lembra de histórias concluídas, seus fatos, notas, falas ditas e hábitos conquistados. Fica na aba "Memória" do editor de cartões. Você importa um chat concluído, vê o que seria mantido, marca o que guardar, e um interruptor desliga uma história para chats novos. Tem seu próprio tamanho (Compacto, 800 tokens por padrão). Não faz parte do texto do cartão e nunca aparece em um cartão exportado.

**Lorebooks.** Entradas de referência que entram no prompt quando suas palavras-chave aparecem, ou sempre para algumas. Guardam as regras do mundo, lugares, pessoas. Vincule um livro a um cartão ou grupo, ou marque-o como Global para alcançar todos os chats. Um chat também ganha seu próprio livro de mundo escrito pelo Mestre do Mundo ([[world-dm]]).

**Banco de Dados** (Ferramentas). Documentos de texto que você carrega (apenas formatos de texto, até 2 MB cada). A cada mensagem, as passagens mais relevantes são adicionadas. Use-o para material de referência longo, não para a história em si.

**Nota do autor** (cabeçalho do chat, "Nota"). Texto que você escreve apenas para este chat, colocado em uma profundidade e papel que você escolhe. Use-o para direcionar: uma dica de estilo, um empurrão de enredo.

**Alma** ([[soul]]). Não é memória de eventos, mas como um personagem reage; ela nunca muda durante o jogo.

## Qual usar

- "Ela deveria lembrar da briga de ontem à noite": o Dashboard cuida disso no curto prazo; o Litopys mantém no longo prazo. Adicione um fato fixado se isso nunca puder se perder.
- "Ela deveria lembrar da história anterior em um chat novo": memória do cartão, ou vincule os chats no Canvas para que o chat anterior traga sua história como pano de fundo.
- "O mundo tem uma regra ou um lugar": um lorebook.
- "Quero que as próximas respostas sigam este caminho": nota do autor, ou o botão "História, movimento".
- "Tenho um documento longo": Banco de Dados.

## Custos

Tudo isso ocupa espaço no prompt. O quadro Prompt do Canvas mostra cada parte com sua contagem de tokens e permite desligar partes para um chat. Em um modelo pequeno, reduza o "Tamanho da memória" do Litopys, mantenha a memória do cartão Compacta e prefira poucas entradas curtas de lorebook.
