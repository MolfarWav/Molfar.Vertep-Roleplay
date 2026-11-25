<!-- source: 5a9b9de3fd40 -->
# Mekânlar haritası

Mekânlar haritası, sohbetin üzerinde duran küçük, yüzen bir haritadır. Hikâyenin adını verdiği her mekânı, hikâyenin aralarında yürüdüğü yolları ve şu an nerede olduğunuzu gösterir. World DM ile oynayan ve içinde bulunduğu dünyayı görmek isteyen herkes içindir. Hiçbir model çağrısı maliyeti yoktur.

## Nerede

Bir sohbetin dünya kitabında en az bir mekân olduğunda, sohbet sütununun sol alt köşesinde yuvarlak bir harita düğmesi görünür (bkz. [[world-dm]]). Haritayı açmak için ona basın; haritayı tekrar düğmeye katlamak için haritadaki **×** işaretine basın. Düğmeyi ve pencereyi istediğiniz yere sürükleyebilir, pencereyi yeniden boyutlandırmak için alt köşesini sürükleyebilirsiniz (varsayılan boyut için köşeye çift tıklayın). Pencere, bu tarayıcıda sohbet başına, bıraktığınız yerde durur. Ayarlar'da, düğmeyi her yerde gizleyen tek bir anahtar vardır: "Places Map".

Hikâyeden önce (kartlardan, bir tariften veya kütüphaneden) oluşturulmuş bir dünya, hikâyenin size henüz göstermediği mekânlar içerebilir; bu yüzden harita, onları göstermeden önce World bölümünün sorduğu aynı soruyu sorar.

Telefonda açık harita, mesaj kutusunun üzerinde duran bir paneldir. Harita açıkken sprite penceresi ve karakter sırası kenara çekilir; siz yazarken harita da kenara çekilir ve kutu boşaldığında geri gelir.

## Üzerinde neler var

- **Noktalı bir tahta.** Tahtayı kaydırmak için boş tahtayı sürükleyin, yakınlaştırmak için iki parmakla veya tekerlekle yakınlaştırın, üst bilgideki **+**, **−** ve köşeler düğmesini (Show all places) kullanın. Mekânlar ekrandaki boyutlarını korur; uzakta küçülür ve adlarını kaybederler, ancak içinde bulunduğunuz ve seçtiğiniz mekân hariç.
- **Bir mekân**, altında adı yazan küçük, boyalı bir resimdir. Kartındaki üç nokta ("More for this place"), "Change the icon of this place" içeren bir menü açar; bu, simgeyi elle değiştirir: iletişim kutusu "Automatic" (adın söylediği simge) ve simge setinin tüm resimleriyle birlikte her türü sunar; birini seçin ve bu mekânda kalır. Automatic, seçimi kaldırır. Seçimler sohbete aittir. Resim, mekânın adından gelir (bir taverna, bir demirci, bir orman, bir mutfak...); adı hiçbir şey söylemeyen bir mekân pirinç bir iğne alır. Her türün birkaç resmi vardır (genellikle dört) ve bir mekân aldığı resmi korur, böylece iki taverna farklı görünebilir. Fantastik türler (bir taverna, bir demirci, bir kale, bir mağara...) ve modern şehrin türleri (bir hastane, bir karakol, bir kafe, bir gökdelen, bir metro girişi, bir benzin istasyonu, bir postane, bir sinema, bir karaoke bar, bir atari salonu ve daha fazlası) vardır. Motor daha eskiyse ve resimleri yoksa, onların yerine yuvarlak bir emoji durur. Hikâyenin şu an içinde bulunduğu mekânın bir halkası ve bir noktası vardır. Hikâyenin hiç ziyaret etmediği bir mekân biraz daha soluktur.
- **Odalar ve köşeler** (World DM'nin "spots"ları) daha küçüktür ve içinde bulundukları mekânın etrafında, ona ince bir çizgiyle dururlar. Bir mekânı sürükleyin, odaları da onunla gelir; bir odayı sürükleyin, yalnızca oda hareket eder.
- **Yollar**, hikâyenin aralarında hareket ettiği iki mekân arasındaki kesikli çizgilerdir. Hikâye bir mekândan diğerine ilk kez gittiğinde bir yol kendiliğinden belirir; bir mekânın odaları arasında hareket etmek bir yolculuk değildir. Seçtiğiniz mekânın yolları daha belirgin çizilir.
  Harita, hikâyenin nerede olduğunu Dashboard'ın mekân satırından, adı World kitabındaki bir mekânla eşleştirerek öğrenir. Bu satır, kitapta olmayan bir yeri adlandırdığında, üst bilginin altındaki bir satır bunu söyler ("The story is at ... which is not one of the places"), hiçbir mekân sizin olarak işaretlenmez ve hikâye kitabın sahip olduğu bir mekâna ulaşana kadar hiçbir yol çizilmez. Mekânı World bölümüne ekleyin (veya var olan birine hikâyenin orada kullandığı adı verin), ya da haritaya elle söyleyin (sonraki madde). Bir yol yalnızca haritanın gördüğü hareketler için çizilir: hikâyenin geçmişini geriye doğru okumaz.
  **Hikâyenin nerede olduğunu elle işaretleyin:** bir mekân seçin ve kartının üç nokta menüsünden "The story is here (mark by hand)" seçeneğini seçin. Harita ardından o mekânı hikâyenin içinde bulunduğu mekân olarak kabul eder: işaretlenir, yolculuk ondan başlar ve başka bir mekânı işaretlediğinizde veya yolculuk ettiğinizde bir yol çizilir. Bu, Dashboard'ın adlandıramadığı bir mekâna sahip hikâyeler içindir (Dashboard kapalıdır veya mekân satırı kitapta kaydı olmayan bir yerdedir). İşaret, Dashboard kitabın hiçbir mekânını adlandırmadığı ve mekân satırı işaretlediğinizdeki gibi kaldığı sürece geçerlidir; Dashboard kitabın bir mekânını adlandırdığında veya mekân satırı değiştiğinde, Dashboard yeniden karar verir. Dashboard hiçbir mekânı adlandırmazken yapılan bir yolculuktan sonra işaret, ulaştığınız mekâna taşınır. Aynı menüdeki "Take the hand mark off" işareti kaldırır.
  **Elle bir yol çizin:** bir mekân seçin, kartının üç nokta menüsünden "Draw a road from this place" seçeneğini seçin, ardından başka bir mekâna dokunun: bir yol onları birleştirir. Zaten yol olan bir mekâna dokunun, yol kaldırılır. Bir odaya veya boş bir noktaya dokunmak yalnızca iptal eder. Yalnızca bütün mekânlar birleştirilebilir, odalar değil. Elle çizilen yollar, hikâyenin çizdikleri gibi saklanır.
- **Bir mekâna dokunun** ve alttaki kartını görün: tam ad (simgenin altındaki ad kısaltılır, kart kısaltılmaz ve işaretçiyi bir adın üzerinde tutmak onu tam gösterir), "You are here", içinde ne olduğu, hikâyenin onu kaç kez ziyaret ettiği ve World bölümünde ona bağlı bir resim varsa o resim.
- **Bir yeri veya odayı haritalardan gizleyin**: kartın üç nokta menüsündeki "Hide from all maps" ile (bir mesaj **Undo** seçeneği sunar) veya dişli simgesindeki **Hide places...** ile: görmek istemediklerinizin işaretini kaldırdığınız tüm yerlerin ve odaların listesi (apartmanın koridoru, hikâyenin geride bıraktığı bir mahzen). Gizlenen bir yer hiçbir haritada görünmez, Dünya kitabı ve hikâye onu korur ve yeniden işaretlediğinizde durduğu yere geri döner. Bir yeri tümüyle gizlemek odalarını da onunla birlikte gizler; tek bir odayı gizlemek geri kalanı olduğu gibi bırakır. Bu, sohbetin tüm haritaları için birden geçerlidir; bir yeri yalnızca tek bir haritadan kaldırmak için **Places on this map** seçeneğini kullanın (bkz. [[places-map-levels|Several maps and drawing a map]]). Her şey gizlenmişse harita kaç öğenin gizlendiğini söyler ve listeyi sunar.
- **Haritadaki bir mekânı yeniden adlandırın** kartın üç nokta menüsünden. Yalnızca haritanın gösterdiğini değiştirir: World kitabı, Dashboard ve hikâye mekânın kendi adını korur, böylece mekâna göre işleyen hiçbir şey (odaları, yolları, sonraki dokunuşla seyahat) etkilenmez. Kart ardından "In the book: ..." da söyler. Kitabın adını geri koymak için boş bir ad kaydedin. Simgenin türü her iki addan okunur.

## Mekânlar nerede durur

Yeni mekânlar bir model tarafından değil, uygulama tarafından yerleştirilir: ilki ortada, sonrakiler hikâyenin geldiği mekânın yanında, odalar kendi mekânlarının etrafında. Herhangi bir mekânı istediğiniz yere sürükleyin; uygulama yerleştirdiğiniz bir mekânı asla hareket ettirmez. Konumlar, yollar ve harita resmi tarayıcıya değil, sohbete aittir.

- **Kilit** (üst bilgideki asma kilit) mekânları oldukları yerde tutar: bir mekânın üzerinde başlayan sürükleme bunun yerine haritayı hareket ettirir, dokunma yine de mekânı seçer. Haritayı kaydıran bir parmağın simgeleri itip durduğu telefonlar için yapılmıştır. Bu tarayıcıda sohbet başına saklanır, böylece telefon kilitliyken masaüstü kilitli olmayabilir.

Üst bilgideki dişli şunu açar:

- **Mekânların altındaki resim** (aşağıdaki "Ready maps" bölümüne bakın): kendi resminizi yükleyin, hazır bir harita seçin veya noktalı ızgaraya geçin. Değiştirmek, mekânların durduğu yeri korur; ardından mekânları onun üzerine sürükleyin.
- **Draw a map with the image model**, **Maps of this chat** ve birkaç tane olduğunda **Places on this map**: bkz. [[places-map-levels|Birkaç harita ve harita çizimi]].
- **Spread the places over the picture** sahip olduğunuz mekânları tüm tahtaya yayar (asla sıkıştırmaz: ayrı olan hiçbir şey yakınlaşmaz; odalar kendi mekânlarına olan mesafesini korur). Yeni mekânlar ortada birbirine yakın başlar ve hazır bir plan tüm tahtayı doldurur, böylece bu, onları tek tek sürükleme zahmetinden kurtarır. Bir mesaj **Undo** sunar; mekânlar zaten tahtayı dolduruyorsa bunu söyler.
- **Arrange the places again** her mekânı otomatik düzene geri koyar (önce sorar). Yollar kalır.

## Dokunuşla seyahat

Hikâyenin içinde olmadığı bir mekân seçin ve kartındaki oka (üç noktanın yanında) ("Go to this place") basın. Küçük bir pencere açılır:

- **How:** yürüyerek, binerek, taksiyle, metroyla veya yolu atlayarak. Binmek, yürüme süresinin 0.4'ünü alır; taksi 0.2'sini, metro dörtte birini artı on dakika bekleme; yolu atlamak, yanıttan en fazla bir satır ister. Taksi kasaba ve bölge haritalarında, metro yalnızca kasaba haritalarında sunulur (bkz. [[places-map-levels|Birkaç harita]]).
- **Minutes:** tahtadaki iki mekân arasındaki mesafeden ve haritanın ölçeğinden hesaplanır (bir kasaba haritası: dakikada 10 tahta birimi, 5'e yuvarlanır; bir bölge haritası ve bir dünya haritası birim başına kat kat daha yavaştır, bu yüzden uzun bir yolculuk saat veya gün olarak anlatılır ve pencere bunu sayının yanında gösterir, "= 2 d 4 h") ve değiştirmek size kalmıştır. Yolda saklanırlar, böylece aynı iki mekân arasındaki bir sonraki yolculuk onlardan başlar. **Ask the model** (dakikaların yanında) World DM'nin modelinde bir çağrı yapar: kitabın iki mekân ve mesafe hakkında söylediklerini okur ve alana yazılan yürüme süresini verir. Yalnızca bastığınızda, tek bir küçük çağrı maliyeti vardır ve World DM kapalıyken kapalıdır.
- **Road name:** isteğe bağlı. Yolda saklanır; bir sonraki yolculuk yanıta o yola bağlı kalmasını söyler, böylece aynı sokak tekrar yürünür. Boş bırakılırsa yanıt kısa bir ad uydurur. Yolda ad yokken ve World DM açıkken, onun modelinde tek bir küçük çağrı yolculuktan sonra yanıtı okur ve üst bilginin altında bir satır belirir: "The reply called this road ..." ve **Keep**. Keep adı yola koyar; yok sayın, hiçbir şey değişmez. Yolu zaten adlandırdıysanız hiçbir şey okunmaz.
- **Road event** (siz açana kadar kapalı, bu tarayıcıda sohbet başına hatırlanır): DM zaten bir olay tutuyorsa, o olay yolda oynanır. Aksi halde, belirlediğiniz şansa karşı tohumlanmış bir zar atılır (başlangıçta %25): pencere, göndermeden önce atışı gösterir ve isabet olduğunda yanıtın dolduracağı küçük bir olay türü (bir yabancı, bir engel, hava durumu, bir buluntu, izlenme hissi, dertte bir yolcu, bir söylenti, bir uyarı işareti) adlandırır. Pencereyi yeniden açarsanız aynı atış görünür ve mesajınızdaki talimat çipinde yer alır.
  **DM makes it up** (yanındaki ikinci anahtar, varsayılan olarak kapalı, World DM açık olmalıdır): zar isabet ettiğinde, bir **Make the event up** düğmesi DM'nin modelinden kitabın kişilerinden, nesnelerinden ve mekânlarından küçük, somut bir olay ister (yolda karşılaşılan tanıdık biri, kaybolan bir eşya, geçilen bir yer). Yalnızca bastığınızda, tek bir küçük çağrı maliyeti vardır. Olay pencerede gösterilir (**Make another** yeniden dener) ve talimattaki listeden gelen türün yerini alır; düğmeye basmazsanız listeden gelen tür kullanılır.
- **Your move:** sohbete giren satır, varsayılan olarak "I head to ...", yeniden yazmak size kalmıştır.

**Go**, hareketinizi o tek yanıt için gizli bir talimatla gönderir: nereden, nereye, nasıl, yaklaşık ne kadar sürede, yolu birkaç satırda anlatıp ardından varışı ve günün yeni saatini göstermesi. Yalnızca yanıt maliyeti vardır, başka bir şey yok. Dashboard saati harita tarafından hareket ettirilmez: Skip time'dan sonra olduğu gibi yanıtı takip eder, böylece kaydırılan bir yanıt zamanı da geri alır. Talimat, mesajınızda bir çip olarak görünür. Telefonda harita, yanıtı okuyabilmeniz için Go'dan sonra katlanır.

Harita hikâyenin nerede olduğunu bilmediğinde (üst bilginin altındaki satır bunu söyler), yolculuğun yolu ve süresi yoktur: yalnızca hareket ve varış. Hikâyenin içinde bulunduğu mekânın bir odası, onun içinde bir harekettir, o da süresizdir.

## Hazır haritalar ve mekânların altındaki resim

Hiçbir şey seçilmemiş bir harita çıplak değildir: uygulama, mekânlara uygun hazır, boyalı bir plan gösterir (odalar için bir ev planı, mahzenler ve zindanlar için mağaralar, deniz için bir kıyı, sokaklar ve dükkânlar için surlarla çevrili bir kasaba veya bir köy, ormanlar ve nehirler için vahşi doğa, aksi halde bir bölge; mekânlar modern bir şehre ait olduğunda modern bir plan, örneğin bir şehir merkezi, bir banliyö, bir sanayi bölgesi, bir havaalanı veya bir kampüs: bir hastane, bir karakol, bir sinema, bir banka...). Plan, adlardan kodla seçilir, bir sohbet için her zaman aynıdır ve hiçbir maliyeti yoktur.

Dişli menüsünde geri kalanı vardır:
- **Choose a ready map**, motorun paketlerinin galerisini türe göre açar (Region, Wilderness, Coast, Walled town, Village, Harbour town, House plan, Caves; Downtown, Suburb, Industrial district, Campus, Waterfront, Old town, Airport, Metropolis, City park, Small town), her birinde dört harita. Birini seçin ve bu sohbette kalır.
- **Upload a map picture** kendi resminizi mekânların altına koyar, en-boy oranı korunarak tahtaya sığdırılır.
- **No picture (the dotted grid)** resmi kaldırır; menü ardından **Use the automatic map again** sunar.

Mekânları hareket ettirmek veya resmi değiştirmek birini diğerine asla taşımaz: mekânlar koyduğunuz yerde kalır.

## Birkaç harita ve harita çizimi

Bir sohbet, her biri kendi resmi, mekânları, yolları ve ölçeğiyle (Town, Region, World) birkaç harita tutabilir ve dişli menüsü görüntü modeliyle bir resim çizebilir. Her ikisi de [[places-map-levels|Birkaç harita ve harita çizimi]] sayfasındadır. Bir haritada seyahat, ölçeğine göre dakikalar, saatler veya günler sürer (aşağıdaki "Dokunuşla seyahat" bölümüne bakın).

## Yapmadığı şeyler

Mekânlar uydurmaz (bunu World DM yapar, bkz. [[world-dm]]). DM'nin emekliye ayırdığı mekânlar haritadan ayrılır.
