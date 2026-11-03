<!-- source: a06a17fd0667 -->
# Ajanlar ve ajan atölyesi

Ajan, kartlardan ve tellerden kurduğunuz küçük bir yardımcıdır. Bir yanıttan sonra sohbetin bir kısmını okur, modele bir veya birkaç kısa soru sorabilir, kendi notlarını tutar ve bir şey gösterir: yanıtın altında bir not, dokunulacak düğmeler, bir sayaç, bir harita veya bir sonraki yanıt için bir ipucu. Örnekler: önerilen üç sonraki hamle, bir gerilim sayacı, ziyaret edilen yerlerin haritası. Bu sayfa bu tür ekstralar isteyenler içindir. Yardım bölümünde düzenleyici hakkında üç makale var: "Agent editor: how an agent works", "Agent editor: the cards" ve "Agent editor: three ready agents".

## Bir ajan nelerden oluşur

Bir ajan veridir, kod değildir. Düzenleyicide **kartların** **tellerle** birleştiği bir panodur:

- bir **Girdi** kartı ajanın ne okuyabileceğini söyler (son yanıt, sohbet geçmişi, karakter kartı, persona, yazarın notu, Litopys olguları, lorebook girdileri);
- **Modele sor** kartları modele tek bir soru sorar ve yanıtı serbest metin, evet ya da hayır veya birkaç adlandırılmış alan olarak alır;
- mantık kartları ve modelsiz kodla çalışan kartlar: zar, bir satır seçme, metni kesme veya çıkarma;
- ajanın kendi **belleği** için kartlar (sayılar, metin, evet/hayır, listeler); her sohbet için ayrı ve Dashboard'dan bağımsız tutulur;
- bir sonuç gösteren **Çıktı** kartı: "Yanıtın altında bir not", "Dokunulacak düğmeler", bir durum değeri veya sonraki isteme eklenen bir ipucu.

**Paneller** (sayaçlar, numaratörler, tablolar, bir karo tahtası) ajanın tuttuklarını gösterir; panelde hiçbir şey çalışmaz ve düğmeleri yalnızca mesaj kutusuna metin koyar.

Ne zaman çalışacağı ajan başına ayarlanır: her yanıttan sonra (bu sürümün çalıştırdığı tek zamanlama); her N. yanıtta; veya yalnızca seçilen sözcükler göründüğünde.

## Hazır ajanlar

**Canvas**'taki Agents panosunda "New agent" düğmesine basın (raydaki **Agents** öğesi onu açar). "Empty agent" bir Girdi ve bir not verir. "Start from a ready agent" altı çalışan ajan sunar: Next moves, Pacing nudge, Story map, Scene recap, Territory board ve Tension meter. "Drafts" altında Molfar'ın çalışma alanınıza yazdığı ajanlar bulunur ("Drafts from Molfar").

## Düzenleyici

Düzenlemeler, durdurduktan kısa bir süre sonra taslak olarak kaydedilir. Üç sekme: Card (seçili kart), Agent (ad, ne zaman çalışacağı, belleği, panelleri) ve Try. Bir onay işareti "Passes the check", sorun ve uyarı sayısını ve "N model calls per run"ı gösterir. Sorun kalmışken kuramazsınız. "Export as a file" paylaşabileceğiniz tek bir dosya kaydeder. Sohbetin "Install and manage agents..." sayfasında bir dosyayı içeri almak için "Install an agent file" bulunur.

## Deneme çalıştırması

Try sekmesi hiçbir şeye dokunmadan uydurma bir tur çalıştırır. Girdileri değiştirirsiniz ve panodaki teller neyin hareket ettiğini gösterir; model yokken her "Ask the model" kartı düzenleyebileceğiniz örnek bir yanıt kullanır. "A real chat" altında bir sohbet seçin ve ajanın gerçekten alacağı şeyi yüklemek için "Fill from this chat"e basın. "Run with the model" daha sonra gerçek soruyu gerçek modele sorar: en fazla N çağrı, gerçek token ve sohbete ya da ajana hiçbir şey kaydedilmez.

## Kurun, izin verin, bir sohbette açın

1. "Install" düğmesine basın (kurulu bir ajanın değiştirilmiş kopyası için "Update"; birini değiştirmek için "Edit a copy" kullanın).
2. Bir kez izin verin: "Review permissions", sonra "Allow all" veya satır satır. Her satır açıkken çalışır. Daha fazlasını isteyen bir güncelleme yeni bir Allow bekler.
3. Onu bir sohbete ekleyin. Sohbet başlığındaki hapda **Agents** sekmesini açın: "In this chat" etkin ajanları listeler, "Installed" geri kalanını listeler (eklemek için birini seçin). Bir satır şimdi yeniden çalışabilir, kaldırılabilir veya onu bekleyen yanıtı durdurabilir. Yeni bir sohbette siz bazılarını ekleyene veya bir set seçene kadar ajan yoktur.

Bir **set**, adlandırılmış bir ajan listesidir ("Save this chat's list as a set"; "Make default" onu yeni sohbetlere verir). Canvas'ın "Agent sets" panosu her setin zaman ve çağrı maliyetini gösterir ve her ajanın notlarını gizleyen "Agents' notes in chats" anahtarını tutar. Her ajanın sonuç yeri, sohbetin Agents sekmesinde, ona uyan yerler arasından değiştirilebilir.

Her "Ask the model" kartı çalıştırma başına bir çağrıdır; düzenleyici sayıyı gösterir. "Every Nth reply" maliyeti böler.
