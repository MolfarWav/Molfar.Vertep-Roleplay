<!-- source: 0348c269773a -->
# Enquanto isso: a vida fora da tela

O Enquanto isso deixa as pessoas que não estão na cena fazerem coisas enquanto a história continua: Bram vende um cavalo no porto, Ada esconde o livro-caixa, uma frente avança um passo rumo ao seu objetivo. É uma versão de teste, desligada por padrão.

## Como ligar

Abra a ficha **World** do chat e encontre o cartão **Meanwhile**. Ligue "Let people off screen act". O interruptor vale para todos os chats. Ele precisa do **Dashboard** ligado, porque o Meanwhile lê as cenas dele, e precisa de alguém para agir: um cartão de personagem que não está na cena, ou uma pessoa no livro do World DM.

## Quando ele roda

Uma passagem roda depois de uma resposta quando chegaram pelo menos duas respostas novas e ou uma nova cena começou ou o relógio da história andou seis horas. Uma passagem é uma chamada de modelo. Ela usa o próprio modelo, se você definir um; senão, o do World DM, o do sensor do Dashboard, o da Library, o do chat, o do app. O cartão diz qual. "Run a pass now" roda uma na hora.

Uma passagem pede até três eventos pequenos. O app verifica cada um: as pessoas devem ser conhecidas do chat, nunca o seu personagem e nunca alguém que está na cena, e os efeitos devem vir de uma lista curta. Um evento que falha numa verificação é descartado por inteiro, e o log diz por quê. Se um modelo não responder nada, a passagem tenta mais uma vez com mais espaço; uma passagem que falha espera dez minutos.

## O que o cartão mostra

- **What this card shows**: Nothing (só que algo aconteceu), Hints (quem e onde) ou Everything. O padrão é Hints, para a história não ser estragada para você.
- **Off screen so far**: os eventos, conforme essa configuração permite.
- **Log**: cada passagem: por que rodou (cena fechada, tempo passou, à mão), quantos eventos o modelo ofereceu e quantos foram mantidos, por que o resto foi descartado, e o erro quando falhou.

## O que os eventos fazem com a história

Cada evento mantido vira uma memória das pessoas a quem aconteceu e de quem o viu, e de mais ninguém: nunca o seu personagem. Ele chega a uma resposta pelas regras usuais do registro da história ([[litopys]]): quando uma dessas pessoas fala, ou uma delas está na cena numa resposta do narrador ou de um grupo. Quem sabe pode então trazer o assunto à tona, insinuá-lo ou agir com base nele; os outros não podem. Um evento secreto também é marcado como "kept secret", então uma resposta de grupo é informada de quem o guarda. Os eventos não são copiados para os Facts da Library: eles são lidos do arquivo do Meanwhile a cada resposta, então não custam nada para manter e vão embora com o swipe. O painel "What fired" do prompt os lista como qualquer fato.

Se você desligar o Meanwhile, os eventos param de chegar às respostas na hora.

## No diário do Dashboard

No Dashboard amplo, o **Journal** de um personagem tem uma seção **Off screen (Meanwhile)** com os eventos que aconteceram com aquele personagem, do mais novo para o mais antigo, conforme a configuração do cartão deixa mostrar: só onde e quando em Hints, o texto em Everything, e nada em Nothing. Ele só lê o arquivo do Meanwhile; não escreve nada no Dashboard, então vai embora com um swipe e não precisa de configuração extra. No celular o Journal não é mostrado.

## Swipes e exclusões

Um evento pertence à resposta depois da qual aconteceu. Se você regenerar essa resposta, a nova versão é escrita sem o evento; se você fizer swipe ou excluir essa resposta, os eventos daquela passagem vão junto, da história também, e a próxima passagem lê a história de novo a partir da última resposta que ainda está lá.

Relacionado: [[world-dm]], [[dashboard]], [[litopys]]. Veja [[litopys]] "Who knows" para saber como os segredos são mostrados.
