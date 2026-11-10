<!-- source: fdd649d68f3c -->
# Karakterler, personalar ve gruplar

Oynadığınız her şey dört bölümde yaşar: Characters, Groups, Personas ve Marketplace. Bu sayfa her birinin ne işe yaradığını söyler; *Your characters*, *The card editor tabs* ve *Groups of characters* Yardım makaleleri ayrıntıları içerir.

## Kartlar

Bir kart bir karakterdir: açıklama, kişilik, senaryo ve bir ilk mesaj. `group: Guild of Ravens` ya da `faction: Guild of Ravens` olarak yazılmış bir etiket, kartın karakterini de o gruba koyar; böylece gruba söylenen bir bellek olgusu onlar tarafından bilinir ([[litopys]]). Characters bölümü kartlarınızı ızgara veya liste olarak; arama, etiketler, klasörler, favoriler (bir yıldız) ve çeşitli sıralamalarla gösterir. Düzenlemek için bir kartı açın. Düzenlemeler "Save changes"e basana kadar taslakta kalır; kaydedilmemiş düzenlemelerle ayrılmak önce sorar.

Düzenleyicinin altı sekmesi vardır:

- **Core**: kart metni, diyalog ve selamlama.
- **Profile**: aynı açıklama yapılandırılmış alanlara bölünmüş (kimlik, görünüm, hedefler). Her kayıt onları kart metnine geri yazar. Bir anlatıcı kartı burada bütün bir kadroyu tanımlayabilir.
- **Soul**: karakterin size nasıl tepki verdiği, ayrıca alışkanlıklar. Bkz. [[soul]].
- **Memory**: karakterin hatırladığı bitmiş sohbetler. Bkz. [[memory]].
- **Lorebook**: bu karta bağlı kitaplar.
- **More**: renkler ve sesler, sprite'lar, galeri, regex, gelişmiş ayarlar.

Bir kart aynı anda birkaç karakteri oynayabilir (bir anlatıcı veya oyun yöneticisi). Colors altında, "Voices" her konuşmacıya kendi rengini verir. Hiç ses listelemezseniz sohbet bunu sizin yerinize yapar: birkaç karakter içeren bir kart (her birinin adını taşıyan bölümlerle) her karakterin satırlarını kendiliğinden, her biri farklı bir renkle boyar ve bu renkler sohbetle birlikte saklanır. Başka herhangi bir sohbette sohbet menüsünü açın, "Voice colors"ı seçin ve anahtarı açın; "Spread colors" renk seçmediğiniz herkese farklı bir renk verir. Bunun için karakterlerin listesini sağlayan Relationship dashboard'u gerekir.

## Personalar

Bir persona sizsiniz: ad, zamirler, açıklama, avatar. Model onu, istemin kullanıcıdan söz ettiği her yerde görür. "Use this persona" onu varsayılanınız yapar ve açık sohbeti ona geçirir. Bir persona kendi lorebook'larını taşıyabilir ve seçilen karakterlere kilitlenebilir; böylece onlarla yeni sohbetler onunla başlar.

## Gruplar

Bir grup birkaç karakteri tek bir sohbete koyar. "New group" üye seçmenizi sağlar. Düzenleyicide Overview, Members, Scene, Turns, Lore ve Chats bulunur. Turns sekmesi kimin yanıtlayacağına karar verir: Narrator (tek yanıt herkesi seslendirir) veya Each in turn. Yeni bir grup Narrator olarak başlar. Bir grup bir kart değildir: bir grubu silmek sohbetlerini siler, asla üyelerini silmez. Kendi rengi olmayan üyelere otomatik olarak farklı renkler verilir.

## Kart edinme

- "Import card" PNG veya JSON dosyalarını (bir veya çok) kabul eder ve Chub, RisuRealm, CharaVault, Botbooru veya doğrudan bir dosyaya bağlantı verir.
- Marketplace aynı anda birkaç kaynağı arar; içe aktarmadan önce tam kartı okumak için bir sonucu açın. Her kaynağın kendi sıralama düzeni ve yetişkin filtresi vardır ve bazıları elle indirme gerektirir.
- Export, kartı içinde barındıran bir PNG yazar.
- Home'daki (ve Lorebooks'taki) "With Molfar", Molfar'dan sizinle bir kart veya lorebook taslağı hazırlamasını ister. Bkz. [[vertep:molfar]].

## Bir karttan gelen mektuplar

Uzun süredir oynamadığınız bir kart, kendi sesiyle size kısa bir not yazabilir. Not, gelen kutusuna (Home'daki "Waiting on you" ve rayın gelen kutusu düğmesi) yeşil bir Letter olarak düşer; onu açmak sizi eski sohbete götürür ya da hiç oynamadığınız bir kart için yeni bir sohbet başlatır. Bir mektup asla bir sohbete yazmaz ve olay uydurmaz.

Mektup, siz açana kadar **kapalıdır**. Kapalıyken Characters bölümünün en üstünde ve Home'daki "Waiting on you" içinde yeşil bir "Let your characters write to you" kartı durur: **Turn on** bunu hemen açar, **Not now** kartı kalıcı olarak gizler. Sayılar (boşta geçen gün sayısı, günde mektup, bir karttan mektuplar arasındaki gün sayısı ve yazma modeli) ile durdurduğunuz kartlar Characters, More, Letters from cards içindedir. Uygulama açıkken mektuplar birkaç saatte bir kontrol edilir: 14 gün boşta kalmış bir sohbet, 14 gündür hiç oynanmamış bir kart ve Soul'u olmayan oynanmış bir kart (bir kez). Yazan model art arda üç kontrolde başarısız olursa (ya da hiç model seçilmemişse) gelen kutusunda nedeniyle birlikte kırmızı bir "Letters" hatası görünür ve **Open** sizi mektup ayarlarına götürür; gelen bir mektup, farklı bir model ya da mektupların kapatılması bu hatayı temizler.

## Kartı olmayanlar için portreler

Kendi resmi olmayan bir kart (hiç yok ya da varsayılan avatar) çizilebilir. **Tek kart:** kart düzenleyicide portrenin altındaki "Draw" bir iletişim kutusu açar: bir görüntü modeli seçin; bir metin modeli (Card tasks modeli) kartın bir açıklamasını yazar, bunu düzenleyebilirsiniz; görüntü modeli çizer. Resim hemen kartın Gallery'sine gider ve "Use as portrait" onu avatar yapar. **Birçok kart:** Characters, More, "Draw missing portraits (N)" hangi modeli kullanacağınızı sorar ve sonra ilerleme kartı üzerinden birer birer çizer; Cancel kartlar arasında durdurur ve başarısız olan bir kart nedeniyle birlikte listelenir.

"Draw with" Settings > Images'in görüntü modellerini listeler: yerel bir ComfyUI ya da Forge ile API modelleri yan yana. İlk seçenek uygulamanın kendi görüntü modelidir (Extensions > Image generation); burada yapılan seçim yalnızca portreler için hatırlanır. Etiketle eğitilmiş bir model bir satır etiket, bir API modeli bir paragraf alır. Yalnızca adı olan bir kartın tarif edecek bir şeyi yoktur ve iletişim kutusu bunu söyler. Görüntü üretimi açık olmalıdır (Extensions); iletişim kutuları bunu söyler ve sizin için açar.

## Bir kartın tutmadıkları

Dashboard durumu, bölümler ve olgular karta değil, her sohbete aittir. Kart belleği de kartın parçası değildir ve bir dışa aktarmada asla görünmez. Buna karşılık Soul, kartta kayıtlıdır.

Sonraki: ilk sohbet için [[first-story]] veya tepki profili için [[soul]].
