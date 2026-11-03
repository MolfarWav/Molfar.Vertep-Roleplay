<!-- source: 6095bc511c69 -->
# Sahne Dashboard'u

Dashboard, sohbetin yanında sahneyi izleyen bir paneldir: kimin orada olduğu, her karakterin size karşı ne hissettiği, ne giydikleri ve ne bildikleri, açık hikâye izlekleri. Yanıtlar arasında hikâyenin ilişkileri ve ayrıntıları hatırlamasını isteyen herkes içindir. *Scene dashboard* Yardım makalesi alanlarını listeler.

## Neyi izler

Sohbette bir portreye tıklayıp Dashboard'u seçerek açın. Yan panelde dört sekme vardır: **Person** (tutum, ruh hali ve durum, kıyafet ve eşyalar), **Here** (yer, hava, kimin orada olduğu), **Quests** (açık izlekler: ana, yan, gündelik) ve **Notes** (defter: bir karakterin ne bildiği ve onu görüp görmediği, duyup duymadığı veya tahmin edip etmediği). "Constellation", bir karakterin size karşı nasıl durduğunu adlandırır; örneğin Friendship veya Romance. Bir sekmedeki sayı, son yanıtınızdan bu yana değişiklikleri sayar (bir şey düştüğünde kırmızı). Geniş görünümde ayrıca bir karakterin düşüncesi ve anımsamalarıyla bir Journal bulunur. Telefonda aynı içerik bir sayfa olarak açılır.

Sayılar (güven, rahatlık, çekim, saygı, sevgi ve daha fazlası) bir modelin bildirdiği olaylardan kodla hesaplanır ve her karakterin [[soul]]'u tarafından eğilir. Durum mesaj başına tutulur; böylece bir kaydırma veya silinen bir mesaj asla bayat sayılar bırakmaz.

Send'in yanındaki "Story, move" düğmesi bir sonraki yanıt için tek seferlik bir dürtü kurar; oku açık bir görevi veya bir sürprizi seçer.

## Ne zaman güncellenir

Dashboard içindeki "Settings" düğmesi ayarlarını açar; Sensor sekmesinde mod bulunur:

- **Sensor** (varsayılan): her yanıttan sonra bir model yeni mesajları okur ve ne olduğunu bildirir.
- **Fast: inside the story reply**: güçlü modeller için. Hikâye modeli raporu kendi yanıtının sonunda, ayrı bir çağrı olmadan yazar ve her yanıta birkaç token ekler. Raporu atlarsa normal sensör çalışır.
- **Manual**: yalnızca "Refresh"e bastığınızda güncellenir.

## Maliyeti nedir

Sensor modunda, yanıt başına bir ekstra model çağrısı, "Sensor model" üzerinde (boş bırakırsanız sohbetin modeli). Ucuz, küçük bir model yeterlidir. Dashboard ayrıca hikâye modelinin okuduğuna kısa bir "Prompt insert" ekler; böylece karakterler nerede durduklarını bilir: bunu kapatabilir ve "Tokens per character"ı ayarlayabilirsiniz. Ayarlardaki "What the model sees" eki gösterir.

## Nasıl kapatılır

Burada listelenen ekranlarda ayrı bir kapatma anahtarı yoktur. Modu "Manual" yapın; böylece kendiliğinden asla model çağırmaz. Tamamen kaldırmak için Molfar Vertep'in Plugins düğmesinde Dashboard eklentisini devre dışı bırakın; Roleplay'de Tools > Plugins yalnızca neyin çalıştığını listeler. İstek dışında kalmasını istiyorsanız "Prompt insert"ü kapatın.

## İlgili

[[soul]] onu besler; [[litopys]] notlarını kullanır; [[memory]] onu diğer bellek türleriyle karşılaştırır.
