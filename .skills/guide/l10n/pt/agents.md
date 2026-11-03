<!-- source: f1a3e4ba962c -->
# Agentes e a forja de agentes

Um agente é um pequeno auxiliar que você constrói a partir de cartões e fios. Depois de uma resposta, ele lê parte do chat, pode fazer ao modelo uma ou mais perguntas curtas, mantém suas próprias anotações e mostra algo: uma nota sob a resposta, botões para tocar, um medidor, um mapa ou uma dica para a próxima resposta. Exemplos: três próximos movimentos sugeridos, um medidor de tensão, um mapa dos lugares visitados. Esta página é para quem quer esses extras. Ainda não há artigo de Ajuda para agentes.

## Do que um agente é feito

Um agente é dado, não código. No editor, ele é um quadro de **cartões** unidos por **fios**:

- um cartão de **Entrada** diz o que o agente pode ler (a última resposta, o histórico do chat, o cartão do personagem, a persona, a nota do autor, fatos do Litopys, entradas do lorebook);
- cartões **Perguntar ao modelo** fazem uma pergunta a um modelo e recebem a resposta como texto livre, sim ou não, ou alguns campos nomeados;
- cartões de lógica, e cartões que trabalham em código sem modelo: dados, escolher uma linha, recortar ou extrair texto;
- cartões para a **memória** do próprio agente (números, texto, sim/não, listas), mantida para cada chat e separada do Dashboard;
- um cartão de **Saída** que mostra um resultado: "Uma nota sob a resposta", "Botões para tocar", um valor de estado, ou uma dica inserida no próximo prompt.

**Painéis** (medidores, contadores, tabelas, um quadro de peças) exibem o que o agente guarda; nada em um painel executa, e seus botões apenas colocam texto na caixa de mensagem.

Quando ele executa é definido por agente: antes da resposta, junto com ela, depois dela, ou manualmente; a cada N respostas; ou somente quando palavras escolhidas aparecem.

## Agentes prontos

Pressione "Novo agente" no quadro Agentes do **Canvas** (o item **Agentes** da barra lateral o abre). "Agente vazio" fornece uma Entrada e uma nota. "Começar de um agente pronto" oferece seis funcionais: Próximos movimentos, Empurrão de ritmo, Mapa da história, Resumo da cena, Quadro de território e Medidor de tensão. Em "Rascunhos" estão agentes que o Molfar escreveu no seu espaço de trabalho ("Rascunhos do Molfar").

## O editor

As edições são salvas como rascunho um momento depois de você parar. Três abas: Cartão (o cartão selecionado), Agente (nome, quando executa, sua memória, painéis) e Testar. Uma verificação mostra "Passa na verificação", o número de problemas e avisos, e "N chamadas de modelo por execução". Você não pode instalar com problemas pendentes. "Exportar como arquivo" salva um arquivo que você pode compartilhar. A janela "Instalar e gerenciar agentes..." do chat tem "Instalar um arquivo de agente" para trazer um.

## Execução de teste

A aba Testar executa um turno simulado sem tocar em nada. Você muda as entradas, e os fios no quadro mostram o que se move; sem modelo, cada cartão "Perguntar ao modelo" usa uma resposta de exemplo que você pode editar. Em "Um chat real", escolha um chat e "Preencher deste chat" para carregar o que o agente realmente receberia. "Executar com o modelo" então pergunta ao modelo real com a pergunta real: até N chamadas, tokens reais, e nada é salvo no chat ou no agente.

## Instalar, permitir, ativar em um chat

1. Pressione "Instalar" ("Atualizar" para uma cópia alterada de um agente instalado; use "Editar uma cópia" para mudar um).
2. Permita-o uma vez: "Revisar permissões", depois "Permitir tudo" ou linha por linha. Ele executa quando cada linha está ativa. Uma atualização que pede mais espera por uma nova permissão.
3. Adicione-o a um chat. No selo do cabeçalho do chat, abra a aba **Agentes**: "Neste chat" lista os agentes ativos, "Instalados" lista os demais (escolha um para adicioná-lo). Uma linha pode executar novamente agora, ser removida, ou impedir que a resposta espere por ela. Um chat novo não tem agentes até você adicionar alguns ou escolher um conjunto.

Um **conjunto** é uma lista nomeada de agentes ("Salvar a lista deste chat como conjunto"; "Tornar padrão" a dá a chats novos). O quadro "Conjuntos de agentes" do Canvas mostra o custo de cada conjunto em tempo e chamadas, e contém o interruptor "Notas dos agentes nos chats" que oculta as notas de todos os agentes. O local do resultado de cada agente pode ser mudado na aba Agentes do chat, entre os locais que lhe servem.

Cada cartão "Perguntar ao modelo" é uma chamada por execução; o editor mostra o número. "A cada N respostas" divide o custo.
