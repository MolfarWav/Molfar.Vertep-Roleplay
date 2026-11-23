<!-- source: 2128e30a104f -->
# Yön: sahnede kim var

Yön, grup sohbetleri içindir. Her cevaptan sonra küçük ve ucuz bir "yönetici" model sahneyi okur, ne tür bir sahne olduğunu (bir ders, bir ara, baş başa bir an, bir randevu) ve hangi üyelerin içinde olduğunu söyler. Orada olmayan üyeler cevap vermeyi bırakır ve hikâye onları geri getirene kadar istemden çıkarılır.

## Çubuk

Bir grup sohbetinde, üye çubuğunun altında "Yön" yazan ince bir çubuk vardır (telefonda yalnızca simge). Soldan sağa:

- **Sahne etiketi**: sahnenin türü ve kimin burada olduğu ("Baş başa an, Yuzu ile" veya "Ders, 4 kişi"). Dashboard'un portreleri, sahnede olmadığını söylediği üyeler için soluklaşır. Üzerine dokunarak kimin sahnede olduğunu, kimin olmadığını, son raporun ne zaman yapıldığını ve yöneticiye yeniden soran bir **Report now** düğmesini görebilirsiniz. Yönetici okurken etiket "Reading the scene…" yazar.
- **Model etiketi**: yöneticinin modeli. Hiçbiri seçilmediyse **Pick a model** yazar. Dokunduğunuzda sohbetin üst çubuğundakiyle aynı model listesi açılır: yıldızlı modeller, ardından bağlantıya göre tüm modeller, arama kutusuyla.
- **Anahtar**: bu sohbet için Yön açık ya da kapalı. Bir model seçilene kadar soluk görünür ve "Pick a model first" yazar.
- **Next**: bir tür kuralının ya da planınızdaki bir beat'in bir sonraki cevap için bekleyen bir notu olduğunda görünen etiket ("Next: Yuzu"). x onu atlar.
- **Rules**: **Rules**, **Plan** ve **Log** olmak üzere üç sekmesi olan Yön panelini açar. Anahtarın yanında durur, böylece telefonda da görünür kalır (orada yalnızca simgedir, kurallar açıkken üzerinde nokta olur).

Anahtar kapalıyken çubuk "Direction: off" olarak katlanır ve sohbet eskisi gibi çalışır.

## Tür kuralları

Bir tür, insanları şansa bağlı olarak sahneye çeken küçük kurallar kümesidir; böylece o türdeki bir hikâye durmaz. **Rules** açın ve listeden bir tür seçin. Dokuz tür vardır: **School rom-com**, **Harem**, **Slice of life**, **Drama**, **Thriller**, **Detective**, **Steamy romance**, **Adventure** ve **Horror**. Her birinin üç kuralı vardır; bunlar aynı birkaç koşul türünden (bir süre bir üyeyle yalnız kalma, bir süre kimsenin yakında olmaması, sahnenin belli bir türde olması, yalnızca birkaç kişinin bulunması) ve aynı üç eylemden (birinin ana denk gelmesi, birinin katılması, birinin geri dönmesi) oluşur. Bir kuralın kartı, ne yaptığını tek cümleyle söyler. Örneğin School rom-com şunlara sahiptir:

- **Interrupted moment**: üç cevap boyunca bir üyeyle yalnız kaldınız ve biri içeri girip sizi bölüyor.
- **Someone comes by**: üç cevap boyunca kimse yakında değildi (evde değil) ve bir üye uğruyor.
- **Friends join the break**: bir ara, öğle yemeği ya da kulüp sırasında bir ya da iki kişi varken bir arkadaş katılıyor.

Bir tür, yöneticiye hangi sahne türlerini arayacağını da söyler. Herkes olağan olanları alır (ders, ara, öğle yemeği, kulüp, yolda, gezi, randevu, baş başa an, evde, etkinlik); bir tür kendine özgü birkaç tane ekler, örneğin tehlike, soruşturma, tartışma, sır, gece, seyahat, iş, yemek ya da boş zaman. Türü olmayan ya da School rom-com olan bir sohbet yalnızca olağan olanları görür, bu yüzden onun için bir şey değişmez. Yön'de her yerde olduğu gibi, açık bir sahnede hiçbir kural tetiklenmez. Her türün sayıları yalnızca ilk tahminlerdir.

Bir sohbet tür olmadan ve kurallar kapalı başlar; siz bir tür seçene kadar hiçbir şey değişmez. Bir tür seçmek kuralları açar; **Rules in this chat** onları yeniden kapatır ve türü saklar. Kurallar yöneticinin açık olmasını gerektirir: raporlarını okurlar.

Her cevaptan sonra kuralları kod (bir model değil) sırayla kontrol eder. Bir kural, koşulları sağlandığında, dinlenmiyorsa ve iki zar atışı sayısına ulaşırsa devreye girebilir. Devreye girerse bir sonraki cevap kısa bir sahne notu alır ("Yuzu walks in on you and Hana and interrupts the moment") ve o kişi sahnede sayılır, bu yüzden kartı tamamen gönderilir. Bir cevapta en fazla bir not olur. Kilit, kilitten sonra dönüş ve Dünya'dan bir olay ya da geri dönen bir kişi önceliklidir; kural o zaman bir sonraki tura kadar bekler.

Her kural kartı durumunu gösterir: **Ready**, **Cooling down** (kalan cevap sayısı) ya da **Quiet for the payoff**, ve ödüle doğru kaç kez tetiklendiği. **Numbers** ayarlarını açar:

- **2d6 needed**: zar atışı bu sayıya ulaşmalı; yanındaki metin atış yüzdesini verir ("about 42%"). 2 her zaman tetikler, 13 hiçbir zaman.
- **Cooldown**: kural tetiklendikten sonra kaç cevap boyunca sessiz kalacağı.
- **Payoff every** ve **Then quiet**: her K. tetiklenmede kural M cevap daha dinlenir ("finally alone"). 0 ödülü kapatır.

**Fire now**, kuralın notunu zar atmadan, bekleme süresi olmadan ve ödüle sayılmadan bir sonraki cevaba koyar; birinin yokluğunu gerektirir. **Skip** bekleyen bir notu düşürür. Atladığınız bir not ya da sildiğiniz bir cevap, bekleme süresiyle birlikte unutulur; notu taşıyan cevabı kaydırmak yeni denemeye aynı notu verir.

Notu taşıyan cevabın altında, neler olduğunu anlatan küçük bir satır yer alır: "Direction: Mei joins (Friends join the break, 2d6 = 10, needed 9) · came". Son kelime yöneticinin sonraki raporudur: **came** (sahnede), **only mentioned** (yalnızca anıldı) ya da **did not come** (gelmedi). **Log** sekmesi aynı şeyi, zar ve nedeniyle birlikte listeler; ayrıca atıp tutturamayan kuralları da.

Bir grup, **Direction** sekmesinde bir **default genre** ayarlayabilir; o grubun yeni sohbetleri bu türle açık başlar. Sayılar ilk tahminlerdir: bir kural bir sohbette çok sık ya da çok seyrek tetikleniyorsa değiştirin.

**Who comes.** Her kural kartında bir **Who comes** seçeneği vardır: **Members** (varsayılan: gruptan biri, uzun süredir uzakta olan), **World people** (bu sohbetin World'ünden bir kişi, örneğin hikâyenin zaten sahip olduğu bir öğretmen ya da komşu) veya **Either** (ikisi de varsa bir madeni para karar verir). World kişileri sohbetin World book'undan gelir; emekli olanlar, kendiliğinden geri dönmemek üzere ayarlananlar ya da zaten sahnede olanlar dışarıda bırakılır. World'de kişi yoksa diğer iki seçenek soluk görünür ve nedenini söyler. Bir sonraki cevabın notu, kişinin kim olduğunu kaydından tek bir cümleyle söyler ve grubunuzdan biri olmadığını belirtir; kartını kimse burada tutmadığı için yazan model o kişiyi bu cümleye göre oynar. Yalnızca yedekte olup grubunuzda olmayan bir kişi bu yolla kesebilir, katılabilir ya da uğrayabilir.

## Plan

Bir **beat** (vuruş), olmasını istediğiniz bir şeydir: "Zil çalar ve sınıf koridora boşalır", "Mei bir pasta getirir". **Plan** sekmesini açın ve **Add beat** düğmesine dokunun. Bir beat şunlara sahiptir:

- **What happens**: bir ya da iki cümle, sahne yönergesi olarak.
- **Who takes part** (isteğe bağlı): yokta olan üyeler, bu beat için sahneye girer. **People from the World** altında hikâyenin zaten sahip olduğu kişileri (bir öğretmen, bir rakip) da seçebilirsiniz; not, yazan modele onların kim olduğunu söyler. Kişiler sohbetin World book'undan seçilir, bu yüzden onda kişi olana kadar seçilecek kimse yoktur.
- **When**: **After some replies** (beat sıradaki olduğu andan sayılır; 0 demek hemen demektir), **Scene** (yönetici o tür sahneyi okuduğunda: ders, ara, randevu...), **Place** (Dashboard'daki yer, "roof" gibi sözcüklerinizi içerdiğinde; büyük küçük harf fark etmez) ya da **By hand** (yalnızca **Fire now** düğmesine bastığınızda).
- **Wait for a new scene**: varsayılan olarak açıktır. Zamanı gelen bir beat, bir anın ortasına girmez: hikâye yer değiştirene ya da zamanda atlayana kadar en fazla 6 cevap bekler, sonra yine de gider. Yer beat'i, hikâye oraya varır varmaz gider; elle beat ise yalnızca siz onu tetiklediğinizde.

Her beat'i sıfırdan yazmak zorunda değilsiniz. **From the genre** (**Add beat** yanında) sohbetin türüne ait hazır beat'leri listeler ("İkisi hakkında bir söylenti okulda yayılmaya başlar"); birini seçtiğinizde düzenleyici doldurulmuş olarak açılır, siz de kimin katılacağını ekleyip kaydedersiniz. Bunun için **Rules** içinde bir tür seçilmiş olmalıdır. **Draft from the cards**, yöneticinin modelinden bir kez, üyelerin kartlarını (ve varsa türü) okumasını ve bu karakterlerin kim olduğuna dayanarak sırayla beş ila sekiz beat önermesini ister. Birkaç saniye ile bir dakika arasında sürer. Öneriler, her birinin yanında bir onay kutusu bulunan bir **Draft** kartında açılır: istemediklerinizin işaretini kaldırın ve geri kalanları plana eklemek için **Add** düğmesine basın. Siz eklemeden hiçbir şey kaydedilmez, sayfayı kapatmak taslağı düşürür ve planınızda zaten bulunan bir beat yeniden önerilmez. Taslak, yöneticinin modeli kadar iyidir; beat'leri sonradan diğerleri gibi düzenleyin.

Plan **sıraya göre** işler: yalnızca bitmemiş ilk beat'e bakılır; arkasındakiler "After the beats before it" yazar. Bir beat, geldiğinde, vazgeçildiğinde (yönetici onun iki kez atlandığını gördüğünde) ya da siz **Skip** ettiğinizde bitmiş sayılır. Sonraki beat, bir öncekinin bittiği andan itibaren cevaplarını sayar. Her kart, beat'inin nerede durduğunu gösterir: **Waiting** (kalan cevap), **Due, waiting for a new scene** (kalan cevap), **Goes with the next reply**, **Delivered** (came, only mentioned ya da kimse anılmadan içeri girdi), **Did not land**, **Skipped**. Bir şey beat'i geri tutuyorsa kart nedenini söyler: Yön kapalı, sahne kilitli ya da sahne açık (bir beat asla açık bir sahnede tetiklenmez; sahne onu terk ettiğinde gider). **Edit**, **Move up**, **Move down** ve **Delete** listeyi değiştirir; **Fire now** beat'i, neyi beklediğine bakılmaksızın, hemen bir sonraki cevaba koyar.

Bir beat, bir tür kuralıyla aynı mekanizmayı kullanır: her cevaptan sonra kod planı kurallardan önce kontrol eder, not bir sonraki cevabın yanında gider (cevap başına bir not; kilit, kilitten sonra dönüş ve Dünya'dan bir olay ya da geri dönen bir kişi önceliklidir ve beat bir sonraki cevapta yeniden gider) ve yöneticinin sonraki raporu, beat'in **came**, **only mentioned** ya da **did not land** olup olmadığını söyler. Yönetici yalnızca grubun üyelerini bilir, bu yüzden World kişilerini adlandıran bir notu taşıyan tek cevap için ona bu kişilerin sahnede olup olmadığı da sorulur; diğer her cevap eskisi gibi okunur. Tutmayan bir beat, daha sert bir notla bir kez daha denenir, sonra vazgeçilir. Kaydırdığınız bir cevap, yeni denemeye aynı notu verir; sildiğiniz bir cevap, beat'ini geri alır.

## Modeli seçme

Tüm sohbetler ve tüm gruplar için tek bir yönetici modeli vardır. Herhangi bir çubuktan ya da grubun **Direction** sekmesinden seçin. Varsayılan yoktur: seçimi siz yaparsınız. Küçük ve hızlı bir model yeterlidir: her cevaptan sonra tek bir kısa çağrıya mal olur.

Yeni bir grup sohbeti, bir model seçilir seçilmez Direction açık olarak başlar. Zaten sahip olduğunuz sohbetlere dokunulmaz. Her sohbetin kendi anahtarı vardır.

## Kim uzakta

Bir üye etiketi, biri sahne dışına çıktığında değişir: resim soluklaşır ve küçük bir kapı işareti gelir. Kilit işareti, kilidin (aşağıda) onları dışarıda bıraktığı anlamına gelir. Etikete dokunun: açılan pencere "Here" ya da "Not in the scene" yazar.

Olmayan bir üye kendi sırasını almaz ve kartı modele gönderilmez: yalnızca tek bir satır sahnede olmadıklarını söyler. Mesajınızda onlardan bahsetmek yine de onları çağırır. Yönetici onları yeniden gördüğünde kartlarının tamamı geri döner.

## Kilit ve dönüş

Sahneyi tek bir kişiyle tutmak için bir üye etiketine dokunun ve **Only <name> in the scene** seçeneğini seçin. Sahne etiketinin önünde "Only Yuzu" etiketi belirir ve diğerleri yönetici ne derse desin dışarıda kalır. Bırakmak için o etiketteki x'e ya da bir üyenin açılır penceresindeki **Release the lock** seçeneğine dokunun. Bir sonraki cevapta diğerlerine geri dönebilecekleri söylenir ve hikâyeden onlara bir giriş yolu bulması istenir.

## Yönetici başarısız olursa

Yöneticinin cevabı okunamazsa ya da çağrı başarısız olursa sahne etiketi **No report** yazar; nedenini görmek için açın. Sohbet o zaman Dashboard'un kimin burada olduğu bilgisini kullanır ya da herkesin eskisi gibi cevap vermesine izin verir. Hikâyenizden hiçbir şey kaybolmaz.

## Yeni gruplar

**New group** geniş bir pencere açar (telefonda tam ekran). Grubu adlandırın ya da ilk üç üyeyi kullanmak için adı boş bırakın. **All**, **Favourites** ve **Recent** ile arayın ve daraltın, etiket çiplerini ve bir sıralamayı (Name, Recently used, Most chats) kullanın, seçmek için portrelere dokunun. Seçilen üyeler konuşma sırasıyla üstte bir sırada durur; oklar birini bir önceki ya da sonraki konuma taşır, x ise kaldırır. **Next** iki karakter gerektirir.

**Next**'ten sonra grup oluşturulur ve düzenleyicisi bir notla açılır: nasıl oynandığına bakın, sonra ilk sohbeti başlatın. **Start chat** ana düğmedir. **Direction** sekmesi, bu grubun yeni sohbetlerinin Direction açık olarak başlayıp başlamayacağını ayarlar ve yöneticinin modelini gösterir. Groups sayfasındaki bir grup aynı düzenleyiciyi açar; sohbetin üstündeki grup adı da öyle.

Bir grubun sonraki bir sohbetini başlattığınızda, sohbetten önceki kısa adımda bir **Direction** anahtarı bulunur: grubun varsayılanı açık ve bir model seçiliyse açıktır.

Ayrıca bkz. [[characters]] ve [[dashboard]].
