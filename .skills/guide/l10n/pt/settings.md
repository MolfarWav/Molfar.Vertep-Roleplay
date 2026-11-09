<!-- source: 82d4a821463b -->
# Onde ficam as configurações do Roleplay

O Roleplay não tem uma única página de configurações para tudo. As configurações ficam perto do que mudam, e duas delas estão nas Configurações principais do Molfar Vertep. Esta página é um localizador.

## Duas Configurações, para não misturar

- **As Configurações principais** do Molfar Vertep (a engrenagem da página inteira): modelos e conexões, backups de todo o perfil, atualizações. Escolha e teste modelos lá; veja [[vertep:settings]] e [[vertep:models]]. Modelos marcados lá aparecem como trocas rápidas em um chat.
- **Configurações do Roleplay**: o botão "Roleplay settings" no cabeçalho da Home (no telefone, no menu). Ele ainda não está listado dentro das Configurações principais, então procure-o no próprio Roleplay. Tem dez seções: Appearance, Chat Behavior, Streaming, Themes, Prose Colors, Custom CSS, Card tasks, Import, Data e Guide. Uma caixa de busca no topo as filtra.

O que as seções fazem, em resumo: Appearance é idioma, fontes, largura do chat e avatares; Chat Behavior tem interruptores como enviar com Enter, confirmar exclusões e "Spell check in the message box" e "Autocorrect in the message box" (ambos desativados por padrão: o corretor ortográfico sublinha palavras escritas errado e oferece correções, o que com nomes inventados significa muito vermelho; a autocorreção deixa o teclado mudar palavras, o que em um telefone pode brigar com asteriscos, aspas e macros; valem para a caixa de mensagem e para o editor expandido); Streaming escolhe mostrar as respostas conforme são escritas ou quando terminadas; Card tasks escolhe o modelo usado pelos auxiliares de cartão ("Structure it", "Fill empty") quando um cartão não tem um próprio; Import traz predefinições, personagens, lorebooks, chats e um zip de backup (uma predefinição do SillyTavern chega com suas listas de escolha como Choices, as explicações do autor como notas e seus blocos de "não mexer" travados; uma predefinição exportada do Roleplay volta com todas as suas Choices); Data exporta e restaura os próprios dados do Roleplay como um zip (o perfil inteiro é salvo pelo Backup das Configurações principais); Guide mostra ou oculta os pequenos tours e "What's new".

## Configurações que vivem em outro lugar no Roleplay

- **Dashboard**: seu botão "Settings", com abas Sensor, Event vocabulary, "What the model sees" e "Tune with Molfar". Veja [[dashboard]].
- **Litopys**: a engrenagem "Litopys settings" na Library. Veja [[litopys]].
- **World DM**: a folha World no cabeçalho do chat e a seção World; "World settings" guarda o modelo de DM. Veja [[world-dm]].
- **Agents**: os quadros Agents e "Agent sets" do Canvas e a aba Agents do chat. Veja [[agents]].
- **Prompt e amostragem**: a seção **Presets** (seções que você pode alternar, variáveis, amostradores e uma espiada na solicitação final) e o quadro Prompt do Canvas para um chat. O painel Preset de um chat mostra, sob o nome da predefinição, uma linha "Works with": os recursos deste chat para os quais a predefinição tem regras (Dashboard, Litopys, World DM, dice...), e quais deles estão desligados neste chat.
- **O próprio de um cartão**: suas abas do editor, incluindo cores, regex e opções avançadas. Veja [[characters]].
- **Lorebooks**: cada livro tem suas próprias regras (profundidade de varredura, limite de tamanho, interruptor Global). Veja [[memory]].
- **A Inbox** tem interruptores por tipo para o que conta como esperando por você.

## Tools

A seção **Tools** é uma fileira de abas, agrupadas como Panels (painéis de plugin como Tool Calling), Text & voice e System.

- **Regex**: scripts de localizar e substituir que funcionam apenas nos lugares que você ativa.
- **Translation**: provedor, dois idiomas e um modo de tradução automática; também traduz o chat aberto.
- **Image Generation**: o modelo do chat descreve a cena e um modelo de imagem a desenha. Desligado por padrão. Com o modo interativo ligado, você confere cada prompt antes.
- **TTS**: lê as respostas em voz alta. Desligado por padrão.
- **Data Bank**: documentos de texto usados para recuperação ([[memory]]).
- **Backgrounds**: as imagens atrás dos seus chats.
- **MCP**: servidores de ferramentas compartilhados pelo motor. Cada um começa desligado neste aplicativo; ative o que você precisa.
- **Plugins**: mostra quais plugins executam por trás do aplicativo e o que cada um pode fazer. Instalar, ativar e desativar acontecem com o botão Plugins no Molfar Vertep, não aqui.
- **Tool Calling** (em Panels): permite que o modelo use ferramentas enquanto escreve. Dice Roller e Picture são embutidos e ficam desligados até você ativá-los.

Também: **Shortcuts** guarda respostas rápidas, que podem executar sozinhas em eventos; Themes mudam a paleta de imediato, Prose Colors recolorem fala e narração, e Custom CSS é aplicado por último. Um chat também pode ter seu próprio CSS: no chat, **More** > **Chat CSS**. Ele aparece enquanto você digita, vale só para esse chat e tem prioridade sobre o Custom CSS global e o CSS do personagem.

Voltar ao [[index]].
