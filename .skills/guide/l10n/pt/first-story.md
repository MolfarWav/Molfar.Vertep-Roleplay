<!-- source: f7c0805c5597 -->
# Sua primeira história

Este é o caminho mais curto de um Roleplay vazio a uma história em andamento, e uma lista do que acontece sozinho para que nada o surpreenda. Você precisa de uma conexão de modelo primeiro: veja [[vertep:models]].

## Passos

1. **Obtenha um cartão.** Na Home, pressione "New character" e escreva um, ou "Import card" para trazer um cartão PNG ou JSON de um arquivo. Você também pode buscar na seção Marketplace, ou pressionar "With Molfar" para que o Molfar rascunhe um cartão a partir da sua ideia. Veja [[characters]].
2. **Salve-o.** O editor de cartões mantém as edições em um rascunho até você pressionar "Save changes".
3. **Escolha uma persona** (quem você interpreta) na seção Personas, ou mantenha a padrão. "Use this persona" a torna seu padrão.
4. **Inicie um chat.** Pressione "New chat" no cartão. O chat abre com a primeira mensagem do cartão.
5. **Verifique o modelo.** O selo no cabeçalho do chat tem uma aba Model; escolher um modelo ali muda apenas este chat.
6. **Escreva.** Sob cada resposta você pode folhear outras versões (deslizes); a seta direita na última versão pede uma nova. Para refazer uma resposta com direção, use "Regenerate with a hint" no menu "+". O botão "More" em uma mensagem oferece edit, fork, prompt peek e mais.

## O que executa sozinho

Quando o chat tem respostas, auxiliares em segundo plano trabalham, cada um com suas próprias chamadas de modelo:

- O Dashboard lê a cena após cada resposta ([[dashboard]]).
- O Litopys escreve um capítulo quando uma cena se encerra ([[litopys]]).
- O World DM, em seu nível ativo mais baixo (Chronicler), registra pessoas e lugares em um livro deste chat ([[world-dm]]).
- Um cartão sem Soul recebe uma proposta automática ([[soul]]).

Falhas dessas tarefas são listadas na Inbox.

## Se o modelo é pequeno, lento ou pago por chamada

As economias mais baratas, em ordem:

1. Nas "Settings" do Dashboard, defina o modo como "Manual" (ele então atualiza somente quando você pressiona Refresh), ou escolha um modelo pequeno como "Sensor model".
2. Nas "Litopys settings" da Library, reduza o "Memory size" ou desligue "Chapters and facts".
3. Na folha World, escolha o nível "Off" (ele ainda faz uma pequena chamada quando a cena nomeia um novo lugar) ou escolha um "DM model (all chats)" barato.
4. Nas configurações do Dashboard, desligue "Rate characters automatically".
5. No Canvas, o quadro Prompt mostra cada parte da próxima solicitação com seus tokens, e permite desligar partes para um chat.

Uma história que cresceu muito precisa de medidas próprias: veja [[long-chats]].

Modelos gratuitos com janelas de contexto pequenas se dão melhor com um Dashboard Manual e uma memória Compact.

## Próximo

[[memory]] explica os tipos de memória; [[settings]] diz onde tudo é definido.
