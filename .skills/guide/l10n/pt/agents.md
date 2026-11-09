<!-- source: ec7d17369d16 -->
# Agentes e a forja de agentes

Um agente é um pequeno auxiliar que você constrói a partir de cartões e fios. Ele lê parte do chat (antes ou depois de uma resposta, como você escolher), pode fazer ao modelo uma ou mais perguntas curtas, mantém suas próprias anotações e mostra algo: uma nota sob a resposta, botões para tocar, um medidor, um mapa ou uma dica para a próxima resposta. Exemplos: três próximos movimentos sugeridos, um medidor de tensão, um mapa dos lugares visitados. Esta página é para quem quer esses extras. A Ajuda tem três artigos sobre o editor: "Agent editor: how an agent works", "Agent editor: the cards" e "Agent editor: three ready agents".

## Do que um agente é feito

Um agente é dado, não código. No editor, ele é um quadro de **cartões** unidos por **fios**:

- um cartão **Input** diz o que o agente pode ler (a última resposta, o histórico do chat, o cartão do personagem, a persona, a nota do autor, fatos do Litopys, entradas do lorebook);
- cartões **Ask the model** fazem uma pergunta a um modelo e recebem a resposta como texto livre, sim ou não, ou alguns campos nomeados;
- cartões de lógica (um cartão If pode disparar somente quando sua resposta vira Yes, somente uma vez, ou com uma pausa depois de disparar, e suas regras podem perguntar se um valor mudou desde a última execução; o log de execução diz por que ele respondeu), e cartões que trabalham em código sem modelo: dados, escolher uma linha, recortar ou extrair texto;
- um cartão **Script**: algumas linhas de JavaScript que você escreve, `(input, seed)` na entrada e um objeto simples na saída, com entradas e saídas tipadas. Ele roda em uma caixa de areia do motor (sem relógio, sem internet, sem arquivos, cerca de meio segundo e 16 MB) e precisa de um motor a partir da versão 1.10.1; um motor mais antigo faz o agente falhar com uma mensagem simples;
- cartões para a **memória** do próprio agente (números, texto, sim/não, listas), mantida para cada chat e separada do Dashboard;
- um cartão **Output** que mostra um resultado: "A note under the reply", "Buttons to tap", um valor de estado, ou uma dica colocada no próximo prompt.

**Painéis** (medidores, contadores, tabelas, um quadro de peças) exibem o que o agente guarda; nada em um painel executa, e seus botões apenas colocam texto na caixa de mensagem.

Quando ele executa é definido por uma faixa. O arquivo do agente indica a faixa em que ele começa, e cada chat pode levá-lo para outra faixa (na aba Agents do chat, ou no quadro "Agent sets" do Canvas). As quatro faixas:

- **Before the reply**: a resposta espera pelo agente, e uma dica que ele deixa entra nessa mesma resposta. Mantenha-o em uma ou duas perguntas rápidas, porque a espera é somada a cada resposta. O interruptor Wait da linha do agente desliga a espera; o agente então roda ao lado da resposta.
- **Beside the reply**: roda ao mesmo tempo, não soma espera, e não pode colocar uma dica na resposta ao lado da qual roda (notas, botões e painéis funcionam).
- **After the reply**: a faixa usual para notas, rastreadores e medidores.
- **By hand**: roda somente quando você pressiona o botão de executar da sua linha.

Além da faixa, um agente pode rodar a cada N respostas, ou somente quando palavras escolhidas aparecem.

## Agentes prontos

Pressione "New agent" no quadro Agents do **Canvas** (o item **Agents** da barra lateral o abre). "Empty agent" cria um cartão Input e uma nota. "Start from a ready agent" oferece seis prontos para uso: Next moves, Pacing nudge, Story map, Scene recap, Territory board e Tension meter. Em "Drafts" ficam os agentes que o Molfar escreveu no seu espaço de trabalho ("Drafts from Molfar").

## O editor

As edições são salvas como rascunho um instante depois de você parar. Três abas: Card (o cartão selecionado), Agent (nome, quando executa, sua memória, painéis) e Try. Uma verificação mostra "Passes the check", o número de problemas e avisos, e "N model calls per run". Você não pode instalar com problemas pendentes. "Export as a file" salva um arquivo que você pode compartilhar. A janela "Install and manage agents..." do chat tem "Install an agent file" para trazer um.

### Opções do cartão If

Um cartão If responde Yes, No ou Unknown conforme suas regras, e sozinho diz Yes em toda execução enquanto as regras valerem. Sob as regras, **When it answers Yes** muda isso: "Every time" (o padrão), "Only when it turns Yes" (dispara na passagem de não-Yes para Yes, e de novo só depois que a resposta voltar atrás), ou "Only once in this chat". **Pause after it fires (runs)** pula essa quantidade de execuções do agente depois de um Yes, de 0 a 50. Uma execução é um turno do agente, então um agente que roda a cada terceira resposta faz uma pausa de 2 durar seis respostas. Uma regra também pode usar "changed since the last run": Yes quando o valor difere da última execução. No formulário, cada regra escolhe **What the rule reads**: um valor que você liga com um fio, um valor do Dashboard, o chat (número de mensagens, quem falou por último) ou um dado do World DM (Fate, Life ou Pacing: se ele colocou uma nota nesta resposta, e qual foi o resultado). Ler um dado exige a permissão "Read what the World DM’s dice said for the last reply", e isso só funciona para um agente que executa depois da resposta. Só um Yes é retido; No e Unknown ainda saem. O agente lembra isso por chat, e "start over" no agente esquece. A aba Try mostra por que um cartão respondeu (a regra, o valor que leu, o resultado) e, quando segurou um Yes, qual opção o segurou; o log do agente sob uma resposta mantém as mesmas linhas.

## Execução de teste

A aba Try executa um turno fictício sem tocar em nada. Você muda as entradas, e os fios no quadro mostram o que se move; sem modelo, cada cartão "Ask the model" usa uma resposta de exemplo que você pode editar. Em "A real chat", escolha um chat e "Fill from this chat" para carregar o que o agente de fato receberia. "Run with the model" então pergunta ao modelo real com a pergunta real: até N chamadas, tokens reais, e nada é salvo no chat ou no agente.

## Instalar, permitir, ativar em um chat

1. Pressione "Install" ("Update" para uma cópia alterada de um agente instalado; use "Edit a copy" para mudar um).
2. Permita-o uma vez: "Review permissions", depois "Allow all" ou linha por linha. Ele executa quando todas as linhas estão ativas. Uma atualização que pede mais espera por uma nova permissão. Um cartão Script pede "Run its own small program"; a lista de permissões mostra o código dele ("Read the code") antes de você permitir, e se uma atualização mudar o código, a permissão é pedida de novo.
3. Adicione-o a um chat. No selo do cabeçalho do chat, abra a aba **Agents**: "In this chat" lista os agentes ativos, "Installed" lista os demais (escolha um para adicioná-lo). Uma linha pode executar de novo agora, ser removida, ou fazer a resposta deixar de esperar por ela. Um chat novo não tem agentes até você adicionar alguns ou escolher um conjunto.

Um **conjunto** é uma lista nomeada de agentes ("Save this chat's list as a set"; "Make default" o dá a chats novos). O quadro "Agent sets" do Canvas mostra o custo de cada conjunto em tempo e chamadas, e tem o interruptor "Agents' notes in chats" que oculta as notas de todos os agentes. O local do resultado de cada agente pode ser mudado na aba Agents do chat, entre os locais que lhe servem.

Cada cartão "Ask the model" é uma chamada por execução; o editor mostra o número. "Every Nth reply" divide o custo.
