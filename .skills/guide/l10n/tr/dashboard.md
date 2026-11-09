<!-- source: 0383923e835d -->
# Sahne Dashboard'u

Dashboard, sohbetin yanında sahneyi izleyen bir paneldir: kimin orada olduğu, her karakterin size karşı ne hissettiği, ne giydikleri ve ne bildikleri, açık hikâye izlekleri. Yanıtlar arasında hikâyenin ilişkileri ve ayrıntıları hatırlamasını isteyen herkes içindir. *Scene dashboard* Yardım makalesi alanlarını listeler.

## Neyi izler

Sohbette bir portreye tıklayıp Dashboard'u seçerek açın. Yan panelde dört sekme vardır: **Person** (tutum, ruh hali ve durum, kıyafet ve eşyalar: üzerlerinde, ellerinde ve yanlarında olanlar ve yakında bulunanlar), **Here** (yer, hava, kimin orada olduğu), **Quests** (açık izlekler: ana, yan, gündelik) ve **Notes** (defter: bir karakterin ne bildiği ve onu görüp görmediği, duyup duymadığı veya tahmin edip etmediği). "Constellation", bir karakterin size karşı nasıl durduğunu adlandırır; örneğin Friendship veya Romance. Bir sekmedeki sayı, son yanıtınızdan bu yana değişiklikleri sayar (bir şey düştüğünde kırmızı). Geniş görünümde ayrıca bir karakterin düşüncesi ve anımsamalarıyla bir Journal bulunur. Telefonda aynı içerik bir sayfa olarak açılır.

**Aynı kişi iki kez listelenmiş.** Dashboard aynı kişiyi iki ad altında gösteriyorsa (diyelim "Sina" ve "Sina Rose"), birini açın ve Person başlığındaki küçük insanlar düğmesini kullanın, ardından "Same person as..." deyin ve diğerini seçin. Önce size sorulur: notlar, geçmiş ve eşyalar seçtiğiniz kişiye taşınır, onların ilişki sayıları kalır, ad onların bir diğer adı olur ve bu geri alınamaz. Dashboard olası kopyaları kendisi de önerir: Person sekmesinin üstündeki bir kutu (ve "Since your last reply" içindeki "Possible duplicate" etiketi) "X may be the same person as Y" der ve nedenini gösterir. "Merge into Y" menüyle aynısını yapar; "Different people" onları ayrı tutar ve Dashboard o çifti önermeyi bırakır. Aynı menüde, yalnızca yanlış olan bir ad için "Remove from the Dashboard" bulunur.

Sayılar (güven, rahatlık, çekim, saygı, sevgi ve daha fazlası) bir modelin bildirdiği olaylardan kodla hesaplanır ve her karakterin [[soul]]'u tarafından eğilir. Durum mesaj başına tutulur; böylece bir kaydırma veya silinen bir mesaj asla bayat sayılar bırakmaz.

Send'in yanındaki "Story, move" düğmesi bir sonraki yanıt için tek seferlik bir dürtü kurar; oku açık bir görevi veya bir sürprizi seçer.

## Ne değişti, sohbette

En yeni yanıtın altında sessiz bir satır, Dashboard'un ona ne kaydettiğini söyler: "Changed: Ada · trust fell, mood calm → tense, +2". Açmak için dokunun; aynı çipler Dashboard'un "Since your last reply" satırındaki gibi açılır; bir çip eşleşen Dashboard sekmesini açar (telefonda alt sayfasını). Eski yanıtlar hiçbir şey göstermez ve satır, bir yanıt yazılırken ya da Dashboard hâlâ güncellenirken bekler. Gizlemek için Settings > Chat Behavior içinde "Show what changed under the newest reply" anahtarını kapatın.

## Karakterler arasındaki bağlar

Sensör, sizin olmayan iki karakterin birbirine nasıl durduğunu, tek kelimelik bir rol ve tek kelimelik bir sıcaklık olarak not eder ("rival, cold"). Yanıtın istemi bunlardan en fazla dördünü, yalnızca sahnedeki kişiler için, tek kısa bir satır olarak taşır. Bir karakterin kendi yanıtı yalnızca o karakterin parçası olduğu bağları alır; bir anlatıcı ise tur hakkında olan kişilerin bağlarını önce alır.

## Bir karakterin söyledikleri ve yalanlar

Bir kişinin defterinin altındaki **Said** listesi, söyledikleri ve tutmak zorunda oldukları güçlü şeyleri saklar: bir yemin, bir tehdit, bir itiraf, bir emir. Bir yalan da orada tutulur; "Show hidden"ı seçene kadar gizlidir.

Bir karakter başkalarının önünde yalan söylediğinde, diğerleri bunu doğru kabul eder. Sonraki yanıtları bunu, kendilerine söylenmiş ve kuşkulanmaları için bir neden olmayan bir şey gibi ele alır; hikâye aksini gösterene kadar. Yalnızca sahnede olan insanlar kandırılır ve yalnızca kendi yanıtlarında: başka biri konuşurken yalanı tekrarlamaz.

Bir yalana açtığınızda **Believe it:** görürsünüz; bunun altında hâlâ inanan her kişi için bir düğme bulunur. Bu kişi gerçeği öğrendiğinde bir adına basın. Satırın menüsünde ayrıca, sensörün yalan olarak adlandırmadığı bir ifade için **This was a lie** (sahnedeki kişiler o zaman buna inanır) ve sensörün yanıldığı durumda **Not a lie** vardır. Bir yanıt gerçeğin ortaya çıktığını gösterdiğinde sensör inancı kendiliğinden bitirir. Yalanı listeden kaldırmak, onunla birlikte her inancı da kaldırır.

> Anlatıcı tek bir yanıtta herkesi seslendirir, bu yüzden gerçeği her zaman bilir. Bu yalnızca bir karakterin, bir başkasının bildiğine dayanarak hareket etmesini engeller.

## Ne zaman güncellenir

Dashboard içindeki "Settings" düğmesi ayarlarını açar; Sensor sekmesinde mod bulunur:

- **Sensor** (varsayılan): her yanıttan sonra bir model yeni mesajları okur ve ne olduğunu bildirir.
- **Fast: inside the story reply**: güçlü modeller için. Hikâye modeli raporu kendi yanıtının sonunda, ayrı bir çağrı olmadan yazar ve her yanıta birkaç token ekler. Raporu atlarsa normal sensör çalışır.
- **Manual**: yalnızca "Refresh"e bastığınızda güncellenir.

## Maliyeti nedir

Sensor modunda, yanıt başına bir ekstra model çağrısı, "Sensor model" üzerinde (boş bırakırsanız sohbetin modeli). Ucuz, küçük bir model yeterlidir. Yeni mesajları bütün olarak okur (birlikte yaklaşık 12000 karaktere kadar; daha uzun bir yanıtta yalnızca ortası kaybolur) ve kod önce kıyafet, giyinme veya bir öpücük gibi görünen cümleleri işaretleyip modeli onlara yöneltir; böylece uzun bir yanıtın ortasında bir kez geçen bir etek yine de kıyafete ulaşır. Bir karakter kartında "Attire:" satırı varsa, metnin sözünü ettiği bir giysinin tam ifadesi için referans olarak sensöre de gösterilir (metnin göstermediği bir giysiyi asla eklemez). Bir karakterin giydiği ve tuttuğu şeyler bir eşya listesi olarak tutulur; yırtılan veya kirlenen bir giysi tek eşya olarak kalır. Her şey gittiği her yerde tek bir kimlik korur: giyilmiş, kapının yanında çıkarılmış, başka birine verilmiş. Bir yerde bırakılan şeyler orada kalır: hikâye kafeye geri döndüğünde fincan hâlâ masadadır. Hikâye yaklaşık altı tur boyunca birinin ne giydiğini göstermediğinde, yazma modelinden bundan kısaca söz etmesi istenir. Taramanın bilmediği bir dil için kelimeler eklemek isterseniz `data/dashboard/lexicon.json` içinde listeleyin (`{"wear": ["..."], "touch": ["..."]}`); `{"off": true}` taramayı kapatır. Dashboard ayrıca hikâye modelinin okuduğuna kısa bir "Prompt insert" ekler; böylece karakterler nerede durduklarını bilir: bunu kapatabilir ve "Tokens per character"ı ayarlayabilirsiniz. Ayarlardaki "What the model sees" eki gösterir.

## Nasıl kapatılır

Burada listelenen ekranlarda ayrı bir kapatma anahtarı yoktur. Modu "Manual" yapın; böylece kendiliğinden asla model çağırmaz. Tamamen kaldırmak için Molfar Vertep'in Plugins düğmesinde Dashboard eklentisini devre dışı bırakın; Roleplay'de Tools > Plugins yalnızca neyin çalıştığını listeler. İstek dışında kalmasını istiyorsanız "Prompt insert"ü kapatın.

## İlgili

[[soul]] onu besler; [[litopys]] notlarını kullanır; [[memory]] onu diğer bellek türleriyle karşılaştırır.
