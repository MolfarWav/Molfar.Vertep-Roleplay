<!-- source: 59593d4e7cf8 -->
# Karakterler, personalar ve gruplar

Oynadığınız her şey dört bölümde yaşar: Characters, Groups, Personas ve Marketplace. Bu sayfa her birinin ne için olduğunu anlatır; *Your characters*, *The card editor tabs* ve *Groups of characters* Yardım makalelerinde ayrıntılar bulunur.

## Kartlar

Kart bir karakterdir: açıklama, kişilik, senaryo ve bir ilk mesaj. `group: Guild of Ravens` veya `faction: Guild of Ravens` şeklinde yazılmış bir etiket, kartın karakterini o gruba da koyar; böylece gruba söylenen bir hafıza bilgisi onlar tarafından da bilinir ([[litopys]]). Characters bölümü kartlarınızı ızgara veya liste olarak gösterir; arama, etiketler, klasörler, favoriler (bir yıldız) ve çeşitli sıralamalarla. Düzenlemek için bir kart açın. Düzenlemeler "Save changes" denene kadar taslakta kalır; kaydedilmemiş düzenlemelerle ayrılmak önce sorar.

Düzenleyicinin altı sekmesi vardır:

- **Core**: kart metni, diyalog ve karşılama.
- **Profile**: aynı açıklamanın yapılandırılmış alanlara bölünmüş hali (kimlik, görünüm, hedefler). Her kayıt bunları kart metnine geri yazar. Bir anlatıcı kartı burada bütün bir kadroyu tanımlayabilir. Aşağıda "Profile sekmesi" bölümüne bakın.
- **Soul**: karakterin size nasıl tepki verdiği, artı alışkanlıklar. Bkz. [[soul]].
- **Memory**: karakterin hatırladığı bitmiş sohbetler. Bkz. [[memory]].
- **Lorebook**: bu karta bağlı kitaplar.
- **More**: renkler ve sesler, sprite'lar (bkz. [[sprites]]), galeri, regex, gelişmiş ayarlar.

Bir kart aynı anda birkaç karakteri oynatabilir (bir anlatıcı veya oyun yöneticisi). Colors altında "Voices" her konuşmacıya kendi rengini verir. Hiç ses listelemezseniz sohbet bunu sizin için yapar: birkaç karakter barındıran bir kart (her biri adına göre adlandırılmış bölümlerle) her karakterin satırlarını kendiliğinden renklendirir, her biri farklı bir renkle ve sohbetle birlikte saklanır. Başka herhangi bir sohbette sohbet menüsünü açın, "Voice colors" ve anahtarı açın; "Spread colors" seçmediklerinizin her birine farklı bir renk verir. Bunun için karakter listesini sağlayan Relationship dashboard gerekir. Sesler renklendirildiğinde bir satır, onu söyleyenin rengini alır: satırın başındaki ad ("Rhea:"), konuşma fiilinin yanındaki ad ("— Hayır, — diyor Esh") veya aynı yanıtta daha önce adı geçen, o cinsiyetten tek karaktere işaret eden o ("— Tamam, — diyor o"). Listede hiç olmayan bir konuşmacı (yalnızca hikâyede adı geçen bir geçen kişi) her seferinde aynı, kullanılmış renklerden uzak kendi rengini alır. Kimseyi adlandırmayan bir satır önceki konuşmacının rengini korur; kimse adlandırılana kadar temanın rengi kalır. Hikâye bir karaktere kartta olandan farklı bir ad verirse (kartta "Afrodit", hikâyede "Ada"), sohbet iki kişi listeleyip ayrı renklendirebilir. İkisini tek yapmanın iki yolu: Relationship panelinde karakterin menüsünü açıp "Same person as..." seçin veya karta "Also called: Ada" gibi bir satır ekleyin; böylece ad ilk yanıttan itibaren bilinir. Bir cümlenin ortasında tırnak içindeki kısa bir sözcük ("buna «ihanet» dedi ve gitti") konuşma değil terim olarak okunur ve renklendirilmez. Bir satırın neden o rengi aldığını görmek için sohbet menüsünü açın, "Voice colors" seçin ve "Show who speaks and why" anahtarını açın: her alıntının ardındaki küçük işaret konuşmacıyı ve kuralı gösterir.

## Profile sekmesi

Sekme, kartın Description ve Personality'sini yazan bir formdur; sohbetlerin okuduğu da budur. Bunu söyleyen bir satırla ve altındaki "Free write" anahtarıyla açılır: Free write açıkken Description ve Personality'yi kendiniz yazarsınız ve alanlar onları değiştirmeyi bırakır (korunurlar, ama sohbetler onları görmez). "Structure it" kabul edildiğinde Free write yeniden kapanır.

Identity ve Notes dışındaki her bölümde bir "In chats" anahtarı vardır. Kapatılan bir bölüm alanlarını korur ama metin yazmaz, böylece sohbetler onu görmez ve her sohbet daha az token taşır; "Fill empty" da onu atlar. Sexuality, Trauma ve Circles siz onları açana veya doldurana kadar kapalı başlar.

"Models" panelinin altında, her birinin altında kullandığı model yazılı üç düğme vardır:

- "Structure it" kartın metnini alanlara ayırır. Uzun bir kartı parçalar halinde okur.
- "Fill empty" yalnızca boş alanlar için değerler önerir. Portre yalnızca Appearance alanlarıyla birlikte resim modeline gider; geri kalan her şey resim olmadan metin modeline gider. İkisi için bir istek iki çağrı ve incelenecek bir öneridir. Modelin penceresinden uzun bir kartta, doldurduğu alanlar için önemli olan parçaları okur (özellikler, korkular ve hedefler için Personality metni, görünüm ve geçmiş için Description) ve öneri kartın ne kadarını okuduğunu söyler.
- "Read from picture" Appearance alanlarını portreden veya eklediğiniz bir resimden yeniden yazar. "Rewrite fields that are already filled" siz işareti kaldırmadıkça işaretlidir ve pencere seçiminizi hatırlar.

"Models" bu kart için iki seçenek tutar ve "Save changes" ile kaydedilir: metin modeli (Structure it, Fill empty, Soul derecelendirmesi) ve "Reading the portrait". "Don't send the portrait" Fill empty'ı yalnızca metinle çalıştırır; Read from picture yine de çalışır. Her kart için bir seçim Roleplay settings, "Card tasks" altındadır.

## Personalar

Persona sizsiniz: ad, zamirler, açıklama, avatar. Model bunu, istemin kullanıcıdan söz ettiği her yerde görür. "Use this persona" onu varsayılanınız yapar ve açık sohbeti ona geçirir. Bir persona kendi lorebook'larını taşıyabilir ve seçilen karakterlere kilitlenebilir; böylece onlarla yeni sohbetler onunla başlar. Bir personanın Lorebooks sekmesi taşıdığı kitapları listeler (birini açın, bağlantısını kaldırın, arayabileceğiniz bir listeden daha fazla ekleyin veya yeni bir tane başlatın). Bir persona kendi kitabına sahip olabilir (boş bir sekmede "New book" onu yapar, "Replace" değiştirir): personanın dosyası içinde yol alır, böylece Export ve Backup onu taşır ve dosyayı başka bir cihazda içe aktarmak onu bağlı olarak geri getirir. Yalnızca bağlantı verdiği kitaplar o cihazın kütüphanesinde kalır; kitabı eksik olan bir bağlantı, kaldırabileceğiniz bir "Not in your library" satırı olarak görünür. Personas ekranındaki içe aktarma, başka bir uygulamadan tek bir persona (bir ad ve bir açıklama), birkaçının yedeğini veya bir `{ name: description }` listesini alır; henüz içe aktarmadığınız kitapları adlandıran bir persona yine de içe aktarılır, hangilerinin eksik olduğuna dair bir notla.

## Gruplar

Bir grup, birkaç karakteri tek bir sohbete koyar. "New group" bir seçici açar (arama, favoriler, etiketler, konuşma sırası); "Next" grubu oluşturur ve düzenleyicisini açar, burada "Start chat" ilk sohbeti başlatır. Düzenleyicide Overview, Members, Scene, Turns, Direction, Lore ve Chats bulunur. Direction sekmesi ve bir grup sohbetindeki çubuk [[direction]] içinde açıklanmıştır. Turns sekmesi kimin yanıtlayacağına karar verir: Narrator (bir yanıt herkesi seslendirir) veya Each in turn. Yeni bir grup Narrator olarak başlar.

Turns sekmesinde ayrıca **How they talk** vardır: **Interruptions** (üyeler karakterlerine uyduğunda söze girer, birbirinin üstüne konuşur veya bir soruyu görmezden gelir), **Own goals** (üyeler bir plan kim olduklarına aykırı düştüğünde, sizinle gerilim yaratsa bile itiraz eder, pazarlık eder veya reddeder) ve **Draw in quiet members** (bir süredir sessiz olan biri daha fazla yanıt şansı bulur ve anlatılan bir sahnenin onu içeri katması istenir). İlk ikisi Off, Can veya Should'dur: Can sahneye uyduğunda izin verir, Should bekler ve her yanıt bir tartışmaya dönüşüyorsa Can'a geri dönün. Yeni gruplar Can ve Draw in açık olarak başlar; eski gruplar siz açana kadar her şey kapalı kalır. Sohbetin kendi Turns düğmesi bunları yalnızca tek bir sohbet için değiştirebilir. Members sekmesinde bir üyenin "In this group" bölümünü açarak ona yalnızca bu grubun kullandığı bir **voice** verin: en fazla iki konuşma alışkanlığı (parçalar halinde konuşur, asla soru sormaz) ve en fazla beş örnek satır. Birkaç satır, sıfatlardan daha iyi ritim öğretir ve farklı karakterler aynı habere farklı yanıt vermelidir.

Bir grup kart değildir: bir grubu silmek sohbetlerini siler, asla üyelerini değil. Kendi rengi olmayan üyeler otomatik olarak farklı renkler alır.

## Kart edinme

- "Import card" PNG veya JSON dosyalarını, bir veya çok, kabul eder ve Chub, RisuRealm, CharaVault, Botbooru veya doğrudan bir dosyaya bağlantı verir.
- Marketplace aynı anda birkaç kaynakta arar; içe aktarmadan önce tam kartı okumak için bir sonucu açın. Her kaynağın kendi sıralama düzeni ve yetişkin filtresi vardır ve bazıları elle indirme gerektirir.
- Export, kartın içinde olduğu bir PNG yazar.
- Home'daki (ve Lorebooks'taki) "With Molfar", Molfar'dan sizinle birlikte bir kart veya bir lorebook taslağı hazırlamasını ister. Bkz. [[vertep:molfar]].

## Kartlardan mektuplar

Bir süredir oynamadığınız bir kart size kendi sesiyle kısa bir not yazabilir. Not, gelen kutusuna (Home'un "Waiting on you" bölümü, raydaki gelen kutusu düğmesi) yeşil bir Letter olarak düşer; açmak sizi eski sohbete götürür veya hiç oynamadığınız bir kart için bir sohbet başlatır. Bir mektup asla bir sohbete yazmaz ve asla olaylar uydurmaz.

**Siz açana kadar kapalıdır**. Kapalıyken, Characters bölümünün üstünde ve Home'un "Waiting on you" bölümünde yeşil bir "Let your characters write to you" kartı durur: **Turn on** onu hemen açar, **Not now** kartı kalıcı olarak gizler. Sayılar (boşta geçen günler, günde mektuplar, bir karttan mektuplar arasındaki günler, yazma modeli) ve durdurduğunuz kartlar Characters, More, Letters from cards altındadır. Mektuplar uygulama açıkken birkaç saatte bir kontrol edilir: 14 gün boşta kalan bir sohbet, 14 gündür oynamadığınız bir kart ve Soul'u olmayan oynanmış bir kart (bir kez). Yazma modeli üst üste üç kontrolde başarısız olursa (veya hiçbiri ayarlanmamışsa), gelen kutusu nedeniyle birlikte kırmızı bir "Letters" hatası gösterir ve Open sizi Letters ayarlarına götürür; gelen bir mektup, farklı bir model veya mektupları kapatmak bunu temizler.

## Kendi resmi olmayan kartlar için portreler

Kendi resmi olmayan (hiçbir şey veya varsayılan avatar) bir kart çizilebilir. **Tek kart:** kart düzenleyicisinde portrenin altındaki "Draw" bir iletişim kutusu açar: görüntü modelini seçin, bir metin modeli (Card tasks modeli) kartın bir açıklamasını yazar, bunu düzenleyebilirsiniz ve görüntü modeli onu çizer. Resim hemen kartın Gallery'sine gider ve "Use as portrait" onu avatar yapar. **Çok kart:** Characters, More, "Draw missing portraits (N)" hangi modeli sorar ve sonra ilerleme kartı aracılığıyla onları tek tek çizer; Cancel kartlar arasında durdurur ve başarısız olan bir kart nedeniyle listelenir.

"Draw with", Settings > Images'ın görüntü modellerini listeler: API modellerinin yanında yerel bir ComfyUI veya Forge. İlk seçenek uygulamanın kendi görüntü modelidir (Extensions > Image generation); buradaki bir seçim yalnızca portreler için hatırlanır. Etiketle eğitilmiş bir model bir satır etiket alır, bir API modeli bir paragraf. Yalnızca bir adı olan bir kartın tanımlayacak hiçbir şeyi yoktur ve iletişim kutusu bunu söyler. Görüntü oluşturma açık olmalıdır (Extensions); iletişim kutuları bunu söyler ve sizin için açar.

## Bir kartın tutmadığı şeyler

Dashboard durumu, bölümler ve gerçekler her sohbete aittir, karta değil. Kartın Memory sekmesi (korunan alışkanlıklar, "How they changed") de karta dahil değildir ve hiçbir zaman bir dışa aktarımda görünmez. Soul ise tam tersine kartta kaydedilir.

Sonraki: ilk sohbet için [[first-story]] veya tepki profili için [[soul]].
