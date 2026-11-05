<!-- source: 82c26de2d666 -->
# Onde estão as configurações do Roleplay

O Roleplay não tem uma única página de configurações para tudo. As configurações ficam perto do que mudam, e duas delas estão nas Configurações principais do Molfar Vertep. Esta página é um localizador.

## Duas Configurações, para não misturar

- **As Configurações principais** do Molfar Vertep (a engrenagem da página inteira): modelos e conexões, backups de todo o perfil, atualizações. Escolha e teste modelos lá; veja [[vertep:settings]] e [[vertep:models]]. Modelos marcados lá aparecem como trocas rápidas em um chat.
- **Configurações do Roleplay**: o botão "Configurações do Roleplay" no cabeçalho da Página inicial (no telefone, no menu). Ele ainda não está listado dentro das Configurações principais, então procure-o no próprio Roleplay. Tem dez seções: Aparência, Comportamento do Chat, Transmissão, Temas, Cores de Prosa, CSS Personalizado, Tarefas de Cartão, Importar, Dados e Guia. Uma caixa de busca no topo as filtra.

O que as seções fazem, em resumo: Aparência é idioma, fontes, largura do chat e avatares; Comportamento do Chat tem interruptores como enviar com Enter e confirmar exclusões; Transmissão escolhe mostrar as respostas conforme são escritas ou quando terminadas; Tarefas de Cartão escolhe o modelo usado pelos auxiliares de cartão ("Estruturar", "Preencher vazio") quando um cartão não tem um próprio; Importar traz predefinições, personagens, lorebooks, chats e um zip de backup (uma predefinição do SillyTavern chega com suas listas de escolha como Escolhas, as explicações do autor como notas e seus blocos de "não mexer" travados; uma predefinição exportada do Roleplay volta com todas as suas Escolhas); Dados exporta e restaura os próprios dados do Roleplay como um zip (o perfil inteiro é salvo pelo Backup das Configurações principais); Guia mostra ou oculta os pequenos tours e "O que há de novo".

## Configurações que vivem em outro lugar no Roleplay

- **Dashboard**: seu botão "Configurações", com abas Sensor, Vocabulário de eventos, "O que o modelo vê" e "Ajustar com o Molfar". Veja [[dashboard]].
- **Litopys**: a engrenagem "Configurações do Litopys" na Biblioteca. Veja [[litopys]].
- **Mestre do Mundo**: a folha Mundo no cabeçalho do chat e a seção Mundo; "Configurações do mundo" guarda o modelo de DM. Veja [[world-dm]].
- **Agentes**: os quadros Agentes e "Conjuntos de agentes" do Canvas e a aba Agentes do chat. Veja [[agents]].
- **Prompt e amostragem**: a seção **Predefinições** (seções que você pode alternar, variáveis, amostradores e uma espiada na solicitação final) e o quadro Prompt do Canvas para um chat. O painel Predefinição de um chat mostra, sob o nome da predefinição, uma linha "Funciona com": os recursos deste chat para os quais a predefinição tem regras (Dashboard, Litopys, Mestre do Mundo, dados...), e quais deles estão desligados neste chat.
- **O próprio de um cartão**: suas abas do editor, incluindo cores, regex e opções avançadas. Veja [[characters]].
- **Lorebooks**: cada livro tem suas próprias regras (profundidade de varredura, limite de tamanho, interruptor Global). Veja [[memory]].
- **A Caixa de entrada** tem interruptores por tipo para o que conta como esperando por você.

## Ferramentas

A seção **Ferramentas** é uma fileira de abas, agrupadas como Painéis (painéis de plugin como Chamada de Ferramenta), Texto e voz e Sistema.

- **Regex**: scripts de localizar e substituir que funcionam apenas nos lugares que você ativa.
- **Tradução**: provedor, dois idiomas e um modo de tradução automática; também traduz o chat aberto.
- **Geração de Imagem**: o modelo do chat descreve a cena e um modelo de imagem a desenha. Desligado por padrão. Com o modo interativo ligado, você confere cada prompt primeiro.
- **TTS**: lê as respostas em voz alta. Desligado por padrão.
- **Banco de Dados**: documentos de texto usados para recuperação ([[memory]]).
- **Planos de fundo**: as imagens atrás dos seus chats.
- **MCP**: servidores de ferramentas compartilhados pelo motor. Cada um começa desligado neste aplicativo; ative o que você precisa.
- **Plugins**: mostra quais plugins executam por trás do aplicativo e o que cada um pode fazer. Instalar, ativar e desativar acontecem com o botão Plugins no Molfar Vertep, não aqui.
- **Chamada de Ferramenta** (em Painéis): permite que o modelo use ferramentas enquanto escreve. Rolar Dados e Imagem são embutidos e ficam desligados até você ativá-los.

Também: **Atalhos** guarda respostas rápidas, que podem executar sozinhas em eventos; Temas mudam a paleta de imediato, Cores de Prosa recoloram fala e narração, e CSS Personalizado é aplicado por último.

Voltar ao [[index]].
