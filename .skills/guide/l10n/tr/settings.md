<!-- source: 155df9c0d938 -->
# Roleplay'in ayarları nerede

Roleplay'in her şey için tek bir ayar sayfası yoktur. Ayarlar değiştirdikleri şeyin yanında durur ve ikisi ana Molfar Vertep Settings'tedir. Bu sayfa bir bulucudur.

## İki Settings, karıştırılmamalı

- **Ana Settings**, Molfar Vertep'in (tüm sayfanın dişlisi): modeller ve bağlantılar, tüm profilin yedekleri, güncellemeler. Modelleri orada seçin ve test edin; bkz. [[vertep:settings]] ve [[vertep:models]]. Orada yıldızlanan modeller bir sohbette hızlı anahtarlar olarak görünür.
- **Roleplay settings**: Home başlığındaki "Roleplay settings" düğmesi (telefonda, menüde). Ana Settings bu uygulamayı da listeler: en üstteki "Uygulama ayarları" altında uygulamaya dokunun (orada adı "Vertep"tir) ve bu sayfada açılır. On bölümü vardır: Appearance, Chat Behavior, Streaming, Themes, Prose Colors, Custom CSS, Card tasks, Import, Data ve Guide. Üstteki arama kutusu onları filtreler.

Bölümlerin kısaca yaptıkları: Appearance dil, yazı tipleri, sohbet genişliği ve avatarlardır; Chat Behavior, Enter ile gönderme, silmeleri onaylama, "Spell check in the message box" ve "Autocorrect in the message box" gibi anahtarlara sahiptir (son ikisi varsayılan olarak kapalıdır: yazım denetimi yanlış yazılmış sözcüklerin altını çizer ve düzeltme önerir, bu da uydurma adlarda çok fazla kırmızı demektir; otomatik düzeltme klavyenin sözcükleri değiştirmesine izin verir, bu da telefonda yıldızlar, tırnak işaretleri ve makrolarla çakışabilir; mesaj kutusunda ve genişletilmiş düzenleyicide geçerlidir); Streaming, yanıtların yazıldıkça mı yoksa bitince mi gösterileceğini seçer; Card tasks, bir kartın kendine ait modeli yokken kart yardımcılarının ("Structure it", "Fill empty") kullandığı modeli seçer; Import, preset'leri, karakterleri, lorebook'ları, sohbetleri ve bir yedek zip'i getirir (bir SillyTavern preset'i seçim listeleriyle Choices olarak, yazarın açıklamalarıyla not olarak ve "dokunma" blokları kilitli olarak gelir; Roleplay'den dışa aktarılan bir preset tüm Choices'ıyla geri gelir); Data, Roleplay'in kendi verilerini zip olarak dışa aktarır ve geri yükler (tüm profil ana Settings'in Backup'ı ile kaydedilir); Guide, kısa turları ve "What's new"i gösterir veya gizler.

## Roleplay'de başka yerde yaşayan ayarlar

- **Dashboard**: "Settings" düğmesi; Sensor, Event vocabulary, "What the model sees" ve "Tune with Molfar" sekmeleriyle. Bkz. [[dashboard]].
- **Litopys**: Library'deki "Litopys settings" dişlisi. Bkz. [[litopys]].
- **World DM**: sohbet başlığındaki World sayfası ve World bölümü; "World settings" DM modelini tutar. Bkz. [[world-dm]].
- **Agents**: Canvas'ın Agents ve "Agent sets" panoları ve sohbetin Agents sekmesi. Bkz. [[agents]].
- **Prompt ve sampling**: **Presets** bölümü (değiştirebileceğiniz bölümler, değişkenler, örnekleyiciler ve son isteğin önizlemesi) ve tek bir sohbet için Canvas'ın Prompt panosu. Bir sohbetin Preset paneli, preset'in adının altında bir "Works with" satırı gösterir: bu sohbetin preset'in kuralları olduğu özellikleri (Dashboard, Litopys, World DM, zarlar...) ve bunlardan hangilerinin bu sohbette kapalı olduğu.
- **Bir kartın kendine ait**: düzenleyici sekmeleri; renkler, regex ve gelişmiş seçenekler dahil. Bkz. [[characters]].
- **Lorebook'lar**: her kitabın kendi kuralları vardır (tarama derinliği, boyut sınırı, Global anahtarı). Bkz. [[memory]].
- **Inbox**, sizi bekleyen sayılan şeyler için tür başına anahtarlara sahiptir.

## Tools

**Tools** bölümü, Panels (Tool Calling gibi eklenti panelleri), Text & voice ve System olarak gruplanmış bir sekme sırasıdır.

- **Regex**: yalnızca açtığınız yerlerde çalışan bul-değiştir betikleri.
- **Translation**: sağlayıcı, iki dil ve otomatik çeviri modu; ayrıca açık sohbeti de çevirir.
- **Image Generation**: sohbet modeli sahneyi tanımlar ve bir görüntü modeli çizer. Varsayılan olarak kapalıdır. Etkileşimli mod açıkken önce her istemi kontrol edersiniz.
- **TTS**: yanıtları sesli okur. Varsayılan olarak kapalıdır.
- **Data Bank**: getirim için kullanılan metin belgeleri ([[memory]]).
- **Backgrounds**: sohbetlerinizin arkasındaki resimler.
- **MCP**: motorun paylaştığı araç sunucuları. Her biri bu uygulamada kapalı başlar; gerekeni açın.
- **Plugins**: uygulamanın arkasında hangi eklentilerin çalıştığını ve her birinin ne yapabileceğini gösterir. Kurma, etkinleştirme ve devre dışı bırakma burada değil, Molfar Vertep'teki Plugins düğmesiyle olur.
- **Tool Calling** (Panels içinde): modelin yazarken araç kullanmasını sağlar. Dice Roller ve Picture yerleşiktir ve siz açana kadar kapalı kalır.

Ayrıca: **Shortcuts**, olaylarda kendiliğinden çalışabilen hızlı yanıtları tutar; Themes paleti hemen değiştirir, Prose Colors konuşmayı ve anlatımı yeniden renklendirir ve Custom CSS en son uygulanır. Bir sohbetin kendi CSS'i de olabilir: sohbette **More** > **Chat CSS**. Yazdıkça görünür, yalnızca o sohbete uygulanır ve genel Custom CSS'i ile karakterin CSS'ini geçersiz kılar.

[[index]] sayfasına geri dön.
