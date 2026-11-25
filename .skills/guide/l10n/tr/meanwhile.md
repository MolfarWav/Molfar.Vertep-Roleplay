<!-- source: bea962ecf922 -->
# Bu arada: ekran dışındaki hayat

Meanwhile, sahnede olmayan kişilerin hikâye devam ederken bir şeyler yapmasını sağlar: Bram limanda bir at satar, Ada defteri saklar, bir cephe hedefine bir adım daha yaklaşır. Bu bir test sürümüdür, varsayılan olarak kapalıdır.

## Açmak

Sohbetin **World** sayfasını açın ve **Meanwhile** kartını bulun. "Let people off screen act" seçeneğini açın. Bu anahtar tüm sohbetler için geçerlidir. **Dashboard**'ın açık olmasına ihtiyaç duyar, çünkü Meanwhile sahneleri oradan okur ve harekete geçecek birine ihtiyaç duyar: sahnede olmayan bir karakter kartı ya da World DM'nin defterindeki bir kişi.

## Ne zaman çalışır

Bir geçiş, en az iki yeni yanıt geldikten sonra ve ya yeni bir sahne başladığında ya da hikâye saati altı saat ilerlediğinde bir yanıttan sonra çalışır. Bir geçiş, bir model çağrısıdır. Kendi modelinizi ayarladıysanız onu kullanır, aksi halde World DM'nin, Dashboard sensörünün, Library'nin, sohbetin, uygulamanın modelini kullanır. Kart hangisini kullandığını söyler. "Run a pass now" hemen bir geçiş çalıştırır.

Bir geçiş en fazla üç küçük olay ister. Uygulama her birini kontrol eder: kişiler sohbetin tanıdığı kişiler olmalı, asla sizin karakteriniz ve asla sahnede olan biri olmamalı, ve etkiler kısa bir listeden gelmelidir. Kontrolden geçemeyen bir olay tamamen düşürülür ve günlük nedeni söyler. Aynı kişi hakkındaki daha önceki bir olayın söylediğini yeniden söyleyen bir olay da düşürülür ("repeats an earlier event"). Bir model hiçbir şey yanıtlamazsa, geçiş daha fazla alanla bir kez daha dener; başarısız olan bir geçiş on dakika bekler.

## Kartın gösterdikleri

- **What this card shows**: Nothing (yalnızca bir şey olduğunu), Hints (kim ve nerede) veya Everything. Varsayılan Hints'tir, böylece hikâye sizin için bozulmaz.
- **Off screen so far**: olaylar, o ayarın izin verdiği ölçüde.
- **Log**: her geçiş: neden çalıştı (sahne kapandı, zaman geçti, elle), modelin kaç olay sunduğu ve kaçının tutulduğu, geri kalanının neden düşürüldüğü ve başarısız olduğunda hata.

## Olayların hikâyeye etkisi

Tutulan her olay, gerçekleştiği kişilerin ve onu görenlerin bir anısı olur, başka kimsenin değil: asla sizin karakterinizin. Bir yanıta hikâye kaydının olağan kurallarıyla ulaşır ([[litopys]]): o kişilerden biri konuştuğunda ya da bir anlatıcının veya bir grubun yanıtı için o kişilerden biri sahnede olduğunda. Bilen biri bunu açabilir, ima edebilir veya üzerine hareket edebilir; diğerleri edemez. Gizli bir olay ayrıca "kept secret" olarak işaretlenir, böylece bir grup yanıtına bunu kimin sakladığı söylenir. Olaylar Library'nin Facts bölümüne kopyalanmaz: her yanıt için Meanwhile dosyasından okunurlar, böylece saklamanın maliyeti yoktur ve kaydırmayla birlikte giderler. Prompt'un "What fired" paneli onları herhangi bir fact gibi listeler.

Meanwhile'ı kapatırsanız, olaylar anında yanıtlara ulaşmayı bırakır.

## Dashboard'ın günlüğünde

Geniş Dashboard'da, bir karakterin **Journal**'ında, o karaktere olan olayları içeren bir **Off screen (Meanwhile)** bölümü vardır, en yeniden eskiye, kartın ayarının göstermesine izin verdiği ölçüde: Hints altında yalnızca nerede ve ne zaman, Everything altında metin ve Nothing altında hiçbir şey. Yalnızca Meanwhile dosyasını okur; Dashboard'a hiçbir şey yazmaz, böylece kaydırmayla gider ve ekstra ayar gerektirmez. Telefonda Journal gösterilmez.

## Kaydırmalar ve silmeler

Bir olay, gerçekleştiği yanıta aittir. O yanıtı yeniden oluşturursanız, yeni sürüm olay olmadan yazılır; o yanıtı kaydırır veya silerseniz, o geçişin olayları da hikâyeden gider ve sonraki geçiş hikâyeyi hâlâ orada olan son yanıttan yeniden okur.

İlgili: [[world-dm]], [[dashboard]], [[litopys]]. Sırların nasıl gösterildiği için [[litopys]] "Who knows" bölümüne bakın.
