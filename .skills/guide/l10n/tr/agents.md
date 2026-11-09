<!-- source: 2e8e4f51b7cb -->
# Ajanlar ve ajan atölyesi

Ajan, kartlardan ve tellerden kurduğunuz küçük bir yardımcıdır. Yanıtın öncesinde ya da sonrasında, sizin seçtiğiniz gibi, sohbetin bir kısmını okur, modele bir veya birkaç kısa soru sorabilir, kendi notlarını tutar ve bir şey gösterir: yanıtın altında bir not, dokunulacak düğmeler, bir gösterge, bir harita veya bir sonraki yanıt için bir ipucu. Örnekler: önerilen üç sonraki hamle, bir gerilim göstergesi, ziyaret edilen yerlerin haritası. Bu sayfa bu tür ekstralar isteyenler içindir. Yardım bölümünde düzenleyici hakkında üç makale var: "Agent editor: how an agent works", "Agent editor: the cards" ve "Agent editor: three ready agents".

## Bir ajan nelerden oluşur

Bir ajan veridir, kod değildir. Düzenleyicide **kartların** **tellerle** birleştiği bir panodur:

- bir **Girdi** kartı ajanın ne okuyabileceğini söyler (son yanıt, sohbet geçmişi, karakter kartı, persona, yazarın notu, Litopys olguları, lorebook girdileri);
- **Modele sor** kartları modele tek bir soru sorar ve yanıtı serbest metin, evet ya da hayır veya birkaç adlandırılmış alan olarak alır;
- mantık kartları (bir If kartı yalnızca yanıtı Yes'e döndüğünde, yalnızca bir kez ya da ateşlendikten sonra bir duraklamayla çalışabilir; kuralları bir değerin son çalıştırmadan beri değişip değişmediğini sorabilir; çalıştırma günlüğü yanıtın nedenini söyler) ve modelsiz kodla çalışan kartlar: zar, bir satır seçme, metni kesme veya çıkarma;
- bir **Script** kartı: yazdığınız birkaç satırlık JavaScript, girdi olarak `(input, seed)`, çıktı olarak düz bir nesne; tipli girdiler ve çıktılar. Motorun bir kumlukta çalışır (saat yok, internet yok, dosya yok, yaklaşık yarım saniye ve 16 MB) ve motor 1.10.1 veya daha yeni olmalıdır; daha eski bir motor ajanı düz bir mesajla başarısız kılar;
- ajanın kendi **belleği** için kartlar (sayılar, metin, evet/hayır, listeler); her sohbet için ayrı tutulur ve Dashboard'dan bağımsızdır;
- bir sonuç gösteren bir **Çıktı** kartı: "A note under the reply", "Buttons to tap", bir durum değeri veya bir sonraki isteme eklenen bir ipucu.

**Paneller** (sayaçlar, numaratörler, tablolar, bir karo tahtası) ajanın tuttuklarını gösterir; bir paneldeki hiçbir şey çalışmaz, düğmeleri yalnızca mesaj kutusuna metin koyar.

Ajanın ne zaman çalışacağı bir şeride (lane) bağlıdır. Ajanın dosyası başladığı şeridi adlandırır ve her sohbet ajanı başka bir şeride taşıyabilir (sohbetin Agents sekmesi ya da Canvas'ın "Agent sets" panosu). Dört şerit:

- **Before the reply**: yanıt ajanı bekler ve ajanın bıraktığı ipucu o yanıtın içine gider. Bekleme her yanıta eklendiği için bir veya iki hızlı soruyla sınırlı tutun. Ajanın satırındaki Wait anahtarı beklemeyi kapatır; ajan o zaman yanıtın yanında çalışır.
- **Beside the reply**: aynı anda çalışır, bekleme eklemez ve yanında çalıştığı yanıta ipucu koyamaz (notlar, düğmeler ve paneller çalışır).
- **After the reply**: notlar, izleyiciler ve göstergeler için olağan şerit.
- **By hand**: yalnızca satırının çalıştır düğmesine bastığınızda çalışır.

Şeridin üstüne, bir ajan her N. yanıtta ya da yalnızca seçilen sözcükler göründüğünde de çalışabilir.

## Hazır ajanlar

Canvas'taki Agents panosunda "New agent"a basın (raydaki **Agents** öğesi onu açar). "Empty agent" bir Girdi ve bir not verir. "Start from a ready agent" altı çalışan ajan sunar: Next moves, Pacing nudge, Story map, Scene recap, Territory board ve Tension meter. "Drafts" altında Molfar'ın çalışma alanınıza yazdığı ajanlar bulunur ("Drafts from Molfar").

## Düzenleyici

Düzenlemeler, durdurduktan kısa bir süre sonra taslak olarak kaydedilir. Üç sekme: Card (seçili kart), Agent (ad, ne zaman çalışacağı, belleği, panelleri) ve Try. Bir denetim "Passes the check" yazısını, sorun ve uyarı sayısını ve "N model calls per run"ı gösterir. Sorun kalmışken kuramazsınız. "Export as a file" paylaşabileceğiniz tek bir dosya kaydeder. Sohbetin "Install and manage agents..." sayfasında, bir ajan dosyasını içeri almak için "Install an agent file" bulunur.

### If kartının seçenekleri

Bir If kartı, kurallarına göre Yes, No ya da Unknown yanıtı verir ve kendi başına, kurallar geçerli olduğu sürece her çalıştırmada Yes der. Kuralların altında **When it answers Yes** bunu değiştirir: "Every time" (varsayılan), "Only when it turns Yes" (yanıt Yes olmayandan Yes'e geçen adımda ateşlenir ve yanıt geri dönmedikçe yeniden ateşlenmez) ya da "Only once in this chat". **Pause after it fires (runs)** bir Yes'ten sonra bu kadar çalıştırmayı atlar: 0 ile 50 arası. Bir çalıştırma ajanın tek bir turudur; yani her üçüncü yanıtta çalışan bir ajanın 2'lik duraklaması altı yanıt sürer. Bir kural ayrıca "changed since the last run" da kullanabilir: değer son çalıştırmadakinden farklıysa Yes. Yalnızca Yes geri tutulur; No ve Unknown yine çıkar. Ajan bunu sohbet başına hatırlar; ajandaki "start over" bunu unutturur. Try sekmesi bir kartın neden yanıt verdiğini gösterir (kural, okuduğu değer, sonuç) ve bir Yes'i tuttuysa hangi seçeneğin tuttuğunu; bir yanıtın altındaki ajan günlüğü aynı satırları tutar.

## Deneme çalıştırması

Try sekmesi hiçbir şeye dokunmadan uydurma bir tur çalıştırır. Girdileri değiştirirsiniz; panodaki teller neyin hareket ettiğini gösterir. Model yoksa her "Ask the model" kartı düzenleyebileceğiniz bir örnek yanıt kullanır. "A real chat" altında bir sohbet seçin ve ajanın gerçekten alacağı şeyi yüklemek için "Fill from this chat"e basın. "Run with the model" gerçek soruyu gerçek modele sorar: en fazla N çağrı, gerçek token; sohbete ya da ajana hiçbir şey kaydedilmez.

## Kurun, izin verin, bir sohbette açın

1. "Install"a basın ("Update" kurulu bir ajanın değiştirilmiş kopyası için; birini değiştirmek için "Edit a copy" kullanın).
2. Bir kez izin verin: "Review permissions", sonra "Allow all" ya da satır satır. Her satır açıkken çalışır. Daha fazlasını isteyen bir güncelleme yeni bir Allow bekler. Bir Script kartı "Run its own small program" izni ister; izin listesi, onu açmadan önce kodunu gösterir ("Read the code") ve bir güncelleme kodu değiştirirse izin yeniden sorulur.
3. Onu bir sohbete ekleyin. Sohbet başlığındaki hapta **Agents** sekmesini açın: "In this chat" etkin ajanları, "Installed" geri kalanları listeler (eklemek için birini seçin). Bir satır şimdi yeniden çalışabilir, kaldırılabilir veya yanıtın onu beklemesini durdurabilir. Yeni bir sohbette, siz bazılarını eklemeden ya da bir set seçmeden hiç ajan yoktur.

Bir **set**, adlandırılmış bir ajan listesidir ("Save this chat's list as a set"; "Make default" onu yeni sohbetlere verir). Canvas'ın "Agent sets" panosu her setin zaman ve çağrı maliyetini gösterir ve her ajanın notlarını gizleyen "Agents' notes in chats" anahtarını tutar. Her ajanın sonuç yeri, sohbetin Agents sekmesinde, ona uyan yerler arasından değiştirilebilir.

Her "Ask the model" kartı çalıştırma başına bir çağrıdır; düzenleyici sayıyı gösterir. "Every Nth reply" maliyeti böler.
