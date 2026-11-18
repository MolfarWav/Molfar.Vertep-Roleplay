<!-- source: f7cfe4722702 -->
# Sprite'lar ve sprite pencereleri

Sprite'lar, bir karakterin her duygu için bir tane olan küçük resimleridir; sohbetin üzerinde görünür ve hikâye ilerledikçe değişir. Bu sayfa, birden fazla karakteri aynı anda görmek isteyenler (bir grupta ya da anlatıcı kartıyla) ve görsel roman görünümü kurmak isteyenler için.

## Sprite penceresi nedir

Bir sprite penceresi sohbetin üzerinde süzülür ve **tek bir karakteri** gösterir. Resmi, o karakterin kendi son repliklerinden seçer (eskisiyle aynı anahtar sözcük kurallarıyla; hiçbir model çağrılmaz) ve resim, karakter yeniden konuşana kadar kalır. Bir pencereyi istediğin yere sürükle, yeniden boyutlandırmak için alt köşesini sürükle (varsayılan boyuta dönmek için köşeye çift tıkla) ve onu küçük yuvarlak bir çipe katlamak için **×** düğmesine bas; geri getirmek için çipe bas.

Sprite'lar, düzenleyicide bir karta **More** sekmesinden, **Sprites** bölümünden eklenir. Ayarlar'da tüm pencereleri kapatan tek bir anahtar var: "Expression Sprites".

## Tek pencere ya da birkaç pencere

Yeni bir sohbette her zamanki gibi **konuşanı** izleyen tek bir pencere vardır. **Sprite windows** menüsünü açmak için bir pencerenin üzerindeki dişliye bas:

- **Add window** (en fazla 8). Yeni bir pencere "Next in the scene" gösterir.
- **Shows**, pencere başına: "Whoever speaks", "Next in the scene" ya da adı seçilmiş tek bir karakter (grubun bir üyesi veya bir anlatıcı kartının tek bir sesi).
- **Transparent background**, pencere başına: çerçeve ve arka plan yok, yalnızca resim. Tıklamalar resmin içinden geçip sohbet metnine ulaşır, bu yüzden böyle bir pencere sol üst köşesindeki küçük tutamaçla taşınır.
- **Visible part**: yüzde 35'ten yüzde 100'e bir kaydırıcı (varsayılan yüzde 100). Yüzde 100'den azı, her resmin yalnızca üst kısmını gösterir; böylece bacaklar kesilir (belden yukarısı, ya da yüzde 40'ta bir büst). Pencerenin yüksekliği o zaman görünen kısım kadar olur ve resim bunun için daha büyük çizilir. Metnin altındaki şeritle birlikte bu, görsel roman görünümünü verir ve sohbete yüksekliğinin neredeyse tamamını bırakır.
- **Windows are**: "In front of the text" (varsayılan), "Behind the text" (sohbet metni resimlerin üzerine çizilir, resimler onun altında kalır; okunabilir kalması için her mesaja sayfa renginde bir zemin eklenir ve **Text backing** kaydırıcısı bunun gücünü yüzde 0'dan yüzde 100'e ayarlar, varsayılan yüzde 55; bir pencerenin düğmeleri sönükleşir ve pencere tutamacından taşınır) ya da "In a strip under the text" (sohbet, metninin altında pencereler için bir şerit ayırır, böylece hiçbir metin bir resmin altında kalmaz; pencereler o zaman altta durur ve yalnızca yana kayar, şeridin yüksekliği en uzun pencere kadardır). Bunlar tabletler ve bilgisayarlar içindir; telefon pencereleri önde tutar.
- **Arrange**: "Row at the bottom" (görsel roman görünümü) ya da "Grid". Yalnızca pencereleri yerleştirirler; sonrasında onları kendin sürüklersin.
- **Hide empty windows**.
- **Back to one window**.

Yerleşim **sohbet başına, bu tarayıcıda** kaydedilir. Başka bir cihaza geçmez.

## "Sahnede" kim var

"Next in the scene" pencereleri, konuşan dışındaki sahne kişilerini gösterir ve bir karakter, kaldığı sürece **penceresini korur**: başkası konuştuğunda kimse başka bir pencereye atlamaz. Bir karakter sahneden ayrılınca penceresi boşalır ("Nobody here") ya da "Hide empty windows" açıksa kaybolur ve gelen sonraki kişi boş bir pencereyi alır.

Pano hikâyeyi okuduysa sahne, Pano'nun "Present" listesidir ([[dashboard]] sayfasına bak). Pano yoksa sahne, son altı mesajda konuşanlardan oluşur.

## Kıyafetler

Birden fazla kıyafeti olan bir karakterin penceresinde küçük bir kıyafet anahtarı bulunur. Seçim sohbet için saklanır ve bir grubun her üyesi için ayrıdır.

## Telefonda

Telefon **tek pencere** gösterir; sahnedeki diğer kişiler sol altta küçük yuvarlak resimlerdir. Bir karakteri pencerede göstermek için birine dokun, konuşanı izlemeye geri dönmek için yeniden dokun. Saydam pencereler, yerleştirme ve ek pencereler tabletler ve bilgisayarlar içindir.

## Ne yapmaz

Hiçbir şey çizmez ve hikâyeyi bir modelle okumaz: sprite'ı olmayan bir karakterin penceresi yoktur, hiç konuşmamış bir karakter ise varsayılan resmini gösterir. Sprite'ı olmayan bir grup üyesi atlanır.
