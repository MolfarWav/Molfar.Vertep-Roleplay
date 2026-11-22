<!-- source: 3b04df871946 -->
# Yön: sahnede kim var

Yön, grup sohbetleri içindir. Her cevaptan sonra küçük, ucuz bir "yönetici" model sahneyi okur ve ne tür bir sahne olduğunu (bir ders, bir ara, bir baş başa an, bir randevu) ve hangi üyelerin içinde olduğunu söyler. Olmayan üyeler cevap vermeyi durdurur ve hikaye onları geri getirene kadar istem dışı bırakılır.

## Çubuk

Bir grup sohbetinde, üye çubuğunun altında "Yön" yazan (telefonda sadece simge) ince bir çubuk vardır. Soldan sağa:

- **Sahne etiketi**: sahnenin türü ve kimin burada olduğu ("Baş başa an, Yuzu ile" veya "Ders, 4 kişi"). Üzerine dokunarak kimin burada olduğunu, kimin sahnede olmadığını, son raporun ne zaman yapıldığını ve yöneticiye tekrar soran bir **Şimdi raporla** düğmesini görebilirsiniz. Yönetici okurken etiket "Sahne okunuyor…" der.
- **Model etiketi**: yöneticinin modeli. Hiçbiri seçilmediyse **Bir model seç** gösterir. Üzerine dokunarak sohbetin üst çubuğundakiyle aynı model listesini alırsınız: yıldızlı modeller, ardından bağlantıya göre her model, bir arama kutusuyla.
- **Anahtar**: Bu sohbet için Yön açık veya kapalı. Bir model seçilene kadar grileşir ve "Önce bir model seç" der.
- **Günlük**: son raporlar (sahnenin türü, kimin burada olduğu, ne kadar sürdüğü, kaç token), ve her anahtar, kilit, bırakma ve hata, en yenisi en üstte.

Anahtar kapalıyken çubuk "Yön: kapalı" olarak katlanır ve sohbet eskisi gibi çalışır.

## Modeli seçme

Tüm sohbetler ve tüm gruplar için tek bir yönetici modeli vardır. Herhangi bir çubuktan veya grubun **Yön** sekmesinden seçin. Varsayılan yoktur: siz seçersiniz. Küçük, hızlı bir model yeterlidir: her cevaptan sonra kısa bir çağrıya mal olur.

Yeni bir grup sohbeti, bir model seçildiği anda Yön açık olarak başlar. Zaten sahip olduğunuz sohbetler etkilenmez. Her sohbetin kendi anahtarı vardır.

## Kim uzakta

Bir üye etiketi, biri sahneden çıktığında değişir: resim kararır ve küçük bir kapı işareti taşır. Bir kilit işareti, kilidin (aşağıda) onları dışarıda bıraktığı anlamına gelir. Bir etikete dokunun: açılır penceresi "Burada" veya "Sahnede değil" der.

Yok olan bir üye kendi sırasını almaz ve kartı modele gönderilmez: sadece bir satır sahnede olmadıklarını söyler. Mesajınızda onları adlandırmak hâlâ onları çağırır. Yönetici onları geri gördüğünde, tüm kartları geri döner.

## Kilit ve dönüş

Bir kişiyle bir sahneyi korumak için bir üye etiketine dokunun ve **Sahnede yalnızca <isim>** seçeneğini seçin. Sahne etiketinden önce "Yalnızca Yuzu" etiketi belirir ve diğerleri yönetici ne derse desin dışarıda kalır. O etiketteki x'e dokunun veya bir üyenin açılır penceresinde **Kilidi bırak** seçeneğine dokunun. Bir sonraki cevapta diğerlerine geri gelebilecekleri söylenir ve hikayeden onlara bir giriş yolu vermesi istenir.

## Yönetici başarısız olursa

Yöneticinin cevabı okunamazsa veya çağrı başarısız olursa, sahne etiketi **Rapor yok** der; nedenini görmek için açın. Sohbet, Dashboard'un kimin burada olduğu fikrini kullanır veya herkesin eskisi gibi cevap vermesine izin verir. Hikayenizde hiçbir şey kaybolmaz.

## Yeni gruplar

**Yeni grup**, geniş bir pencere açar (telefonda tam ekran). Grubu adlandırın veya ilk üç üyeyi kullanmak için adı boş bırakın. **Tümü**, **Favoriler** ve **Son** ile arayın, daraltın, etiket çipleri ve bir sıralama (Ad, Son kullanılan, En çok sohbet) ve seçmek için portrelere dokunun. Seçilen üyeler konuşma sırasına göre üstte bir satırda oturur; oklar birini daha erken veya daha sonra taşır, x kaldırır. **İleri** iki karakter gerektirir.

**İleri**'den sonra grup oluşturulur ve düzenleyicisi bir notla açılır: nasıl çalıştığını kontrol edin, ardından ilk sohbeti başlatın. **Sohbeti başlat** ana düğmedir. **Yön** sekmesi, bu grubun yeni sohbetlerinin Yön açık olarak başlayıp başlamayacağını ayarlar ve yöneticinin modelini gösterir. Gruplar sayfasındaki bir grup aynı düzenleyiciyi açar ve sohbetinin üst kısmındaki grubun adı da aynısını yapar.

Bir grubun sonraki bir sohbetini başlattığınızda, sohbetten önceki kısa adımda bir **Yön** anahtarı bulunur: grubun varsayılanı açık olduğunda ve bir model seçildiğinde açıktır.

Ayrıca bkz. [[karakterler]] ve [[dashboard]].