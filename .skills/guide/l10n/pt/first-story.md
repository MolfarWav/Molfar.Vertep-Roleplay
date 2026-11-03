<!-- source: 51684176be4b -->
# Sua primeira história

Este é o caminho mais curto de um Roleplay vazio a uma história em andamento, e uma lista do que acontece sozinho para que nada o surpreenda. Você precisa de uma conexão de modelo primeiro: veja [[vertep:models]].

## Passos

1. **Obtenha um cartão.** Na Página inicial, pressione "Novo personagem" e escreva um, ou "Importar cartão" para trazer um cartão PNG ou JSON de um arquivo. Você também pode buscar na seção Mercado, ou pressionar "Com Molfar" para que o Molfar rascunhe um cartão a partir da sua ideia. Veja [[characters]].
2. **Salve-o.** O editor de cartões mantém as edições em um rascunho até você pressionar "Salvar alterações".
3. **Escolha uma persona** (quem você interpreta) na seção Personas, ou mantenha a padrão. "Usar esta persona" a torna seu padrão.
4. **Inicie um chat.** Pressione "Novo chat" no cartão. O chat abre com a primeira mensagem do cartão.
5. **Verifique o modelo.** O selo no cabeçalho do chat tem uma aba Modelo; escolher um modelo ali muda apenas este chat.
6. **Escreva.** Sob cada resposta você pode folhear outras versões (deslizes); a seta direita na última versão pede uma nova. Para refazer uma resposta com direção, use "Regenerar com uma dica" no menu "+". O botão "Mais" em uma mensagem oferece editar, bifurcar, espiar o prompt e mais.

## O que executa sozinho

Quando o chat tem respostas, auxiliares em segundo plano trabalham, cada um com suas próprias chamadas de modelo:

- O Dashboard lê a cena após cada resposta ([[dashboard]]).
- O Litopys escreve um capítulo quando uma cena se encerra ([[litopys]]).
- O Mestre do Mundo, em seu nível ativo mais baixo (Cronista), registra pessoas e lugares em um livro deste chat ([[world-dm]]).
- Um cartão sem alma recebe uma proposta automática ([[soul]]).

Falhas dessas tarefas são listadas na Caixa de entrada.

## Se o modelo é pequeno, lento ou pago por chamada

As economias mais baratas, em ordem:

1. Nas "Configurações" do Dashboard, defina o modo como "Manual" (ele então atualiza somente quando você pressiona Atualizar), ou escolha um modelo pequeno como "Modelo sensor".
2. Nas "Configurações do Litopys" da Biblioteca, reduza o "Tamanho da memória" ou desligue "Capítulos e fatos".
3. Na folha Mundo, escolha o nível "Desligado" (ainda faz uma pequena chamada quando a cena nomeia um novo lugar) ou escolha um "Modelo de DM (todos os chats)" barato.
4. Nas configurações do Dashboard, desligue "Classificar personagens automaticamente".
5. No Canvas, o quadro Prompt mostra cada parte da próxima solicitação com seus tokens, e permite desligar partes para um chat.

Modelos gratuitos com janelas de contexto pequenas se dão melhor com um dashboard Manual e uma memória Compacta.

## Próximo

[[memory]] explica os tipos de memória; [[settings]] diz onde tudo é definido.
