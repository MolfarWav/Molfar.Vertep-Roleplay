<!-- source: 51684176be4b -->
# İlk hikâyeniz

Bu, boş bir Roleplay'den çalışan bir hikâyeye giden en kısa yol ve hiçbir şeyin sizi şaşırtmaması için kendiliğinden olanların listesidir. Önce bir model bağlantısına ihtiyacınız var: bkz. [[vertep:models]].

## Adımlar

1. **Bir kart edinin.** Home'da "New character"e basın ve bir tane yazın ya da bir dosyadan PNG veya JSON kart getirmek için "Import card"a basın. Ayrıca Marketplace bölümünde arama yapabilir veya Molfar'ın fikrinizden bir kart taslağı hazırlaması için "With Molfar"a basabilirsiniz. Bkz. [[characters]].
2. **Kaydedin.** Kart düzenleyici, "Save changes"e basana kadar düzenlemeleri taslakta tutar.
3. **Bir persona seçin** (oynadığınız kişi) Personas bölümünde veya varsayılanı koruyun. "Use this persona" onu varsayılanınız yapar.
4. **Bir sohbet başlatın.** Kartta "New chat"e basın. Sohbet kartın ilk mesajıyla açılır.
5. **Modeli kontrol edin.** Sohbet başlığındaki hapda bir Model sekmesi vardır; orada bir model seçmek yalnızca bu sohbeti değiştirir.
6. **Yazın.** Her yanıtın altında diğer sürümler arasında gezinebilirsiniz (kaydırmalar); son sürümdeki sağ ok yenisini ister. Bir yanıtı yön vererek yeniden yapmak için "+" menüsündeki "Regenerate with a hint"i kullanın. Bir mesajdaki "More" düğmesi düzenleme, çatal, istem önizlemesi ve daha fazlasını sunar.

## Kendiliğinden çalışanlar

Sohbette yanıtlar olduğunda, arka plan yardımcıları çalışır; her birinin kendi model çağrıları vardır:

- Dashboard her yanıttan sonra sahneyi okur ([[dashboard]]).
- Litopys bir sahne kapandığında bir bölüm yazar ([[litopys]]).
- World DM, en düşük etkin düzeyinde (Chronicler), bu sohbet için bir kitaba insanları ve yerleri kaydeder ([[world-dm]]).
- Soul'u olmayan bir karta otomatik olarak bir tane önerilir ([[soul]]).

Bu işlerin başarısızlıkları Inbox'ta listelenir.

## Model küçük, yavaş veya çağrı başına ücretliyse

En ucuz tasarruflar, sırayla:

1. Dashboard'un "Settings"inde modu "Manual" yapın (o zaman yalnızca Refresh'e bastığınızda güncellenir) veya "Sensor model" olarak küçük bir model seçin.
2. Library'nin "Litopys settings"inde "Memory size"ı düşürün veya "Chapters and facts"i kapatın.
3. World sayfasında "Off" düzeyini seçin (sahne yeni bir yer adlandırdığında yine küçük bir çağrı yapar) veya ucuz bir "DM model (all chats)" seçin.
4. Dashboard ayarlarında "Rate characters automatically"i kapatın.
5. Canvas'ta Prompt panosu sonraki isteğin her parçasını token'larıyla gösterir ve tek bir sohbet için parçaları kapatmanızı sağlar.

Küçük bağlam pencereli ücretsiz modeller, Manual bir dashboard ve Compact bir bellek ile en iyi sonucu verir.

## Sonraki

[[memory]] bellek türlerini açıklar; [[settings]] her şeyin nerede ayarlandığını söyler.
