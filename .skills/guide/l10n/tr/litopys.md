<!-- source: c68da6730f1a -->
# Litopys: hikâye kaydı

Litopys (vakayiname), tek bir sohbetin uzun belleğidir. Hikâyeyi arka planda okur ve biten her sahne için bir bölüm, ayrıca hikâyenin yerleştirdiği olguları yazar. Bir sohbet modelin penceresi için çok uzadığında, kayıt hikâyeyi ileri taşır. Uzun hikâyeler için kullanın; başlatmanız gerekmez.

## Bölümler ve olgular

- Bir **bölüm**, bir sahnede neyin değiştiğini söyler, yeniden anlatım değildir. Bir sonraki sahne başladığında yazılır; bu yüzden en son sahnenin henüz bir bölümü olmayabilir. Yeni bir yer ya da zamanda sıçrama bir sahneyi kapatır; bir mesaj dizisini, bir mesajın "More" menüsünde Story altından, kendiniz de sahne olarak işaretleyebilirsiniz.
- Bir **olgu**, doğru kalan kısa bir cümledir: "Medli pazarda kanatlarını gizler." Olguların bir türü, bir ağırlığı (Everyday, Important, Key) ve onları kimin bildiği vardır. Olguları elle ekleyebilir, düzenleyebilir, sabitleyebilir veya emekliye ayırabilirsiniz.
- **Proposals**, Litopys'in önerileridir: iki olguyu birleştirme, birini emekliye ayırma, yeniden ifade etme, sabitleme. Her birini kabul edersiniz ya da reddedersiniz.
- Bir karakterin açıkça gösterdiği **Habits** de görünebilir ve birkaç sahnede tekrarlandıktan sonra bir alışkanlığa dönüşebilir.

## Nereye bakmalı

Bu sohbetin kaydını bir yan panelde görmek için sohbet başlığındaki **Record** düğmesine basın (telefonda, Menu içinde). Rayın **Library** bölümü her sohbetin kaydını gösterir. İki görünümü vardır: Overview (bir zaman çizelgesi, karakter başına bir kart, bekleyen öneriler) ve Chapters, Facts, Proposals, Habits ve Activity sekmeleriyle Details. Activity sekmesi Litopys'in ne yaptığını, mümkünse Undo ile birlikte günlükler. Dişli simgesi ("Litopys settings") kaydın nasıl yazılacağını ayarlar.

## İsteme ne girer

Varsayılan olarak kayıt otomatik eklenir. "Memory size" kaç token alabileceğini söyler: varsayılan olarak Auto (modelin penceresinin %15'i, en az 800 ve en fazla 16000), Compact (800 token) veya 200'den 16000'e kadar Custom. Auto, büyük bir pencerenin hikâyeden daha fazlasını taşımasına izin verir; küçük bir modelde 800 civarında kalır. Daha önce kendiniz kaydettiğiniz bir boyut olduğu gibi kalır. Her şey sığdığında tamamı gönderilir; aksi halde sahne için en önemli parçalar. Küçük bir model küçük bir boyut ister. "Chapters and facts" kapalıysa yeni bölüm ya da olgu olmaz ve isteme hiçbir şey eklenmez.

Daha eski mesajlar, ancak pencere dolduğunda ya da bir bölüm onları kapsadığında sahne sahne istemden çıkabilir; bunu "Older messages leave the prompt" ayarı seçer.

## Anlama göre eşleştirme

Bellek olguları ve bölümleri kelimelerle bulur. Bir gömme modeliyle anlamla da bulur: başka kelimelerle sorulan bir soru yine olguya ulaşır. **Matching by meaning** kartı (bir sohbet kaydının en üstünde ve Canvas > Prompt > Memory içinde) durumunu gösterir: off, failing, no vectors yet, partly done, done ya da başka bir modelle yapılmış. Modeli Settings > Memory içinde bir kez kurun: varsayılan olarak uygulama önce kendi bilgisayarınızdaki bir modeli (LM Studio ya da Ollama), sonra anahtarlı bir API bağlantısını, ardından OpenRouter'ı kullanır. Gömme modeline bir çağrı çalıştığında (kartın düğmesine basınca ya da bir yanıtla), motor her sohbetin ve Data Bank dosyasının eksik vektörlerini birkaç dakikada bir bakarak kendiliğinden doldurur; 300.000 token'ı aşan her şey düğmeyi bekler ve Settings > Memory içindeki **Make vectors by itself** anahtarı bunu kapatır. **Embed N items** düğmesi önce kaç öğe olduğunu ve yaklaşık kaç token tutacağını söyler, sonra hemen yapar. Yeni sahneler yeni öğelerini her durumda gömer. Gömme modelini değiştirirseniz, **Embed again** düğmesine basana kadar eski vektörler kullanılmaz. Data Bank'in kendi kartı, **Data Bank by meaning**, Settings > Data Bank'ın en üstündedir: dosyalarınızın ve anlık kopya (snapshot) kitaplarının pasajları için aynı şekilde çalışır; kısmen kapsanan bir dosya "7 of 12 by meaning" yazar.

## Öneriler ve toparlama

"Suggestions" varsayılan olarak "Ask me first"tür: her sabitleme ve yeniden yazım sizin onayınızı bekler. Sessiz seçenek, sabitlemeleri ve yeniden yazımları hemen uygular ve Activity'de günlükler. Emekliye ayırma ve birleştirme her zaman sizi bekler. "Tidy facts automatically", 30 yeni olgudan sonra, 60 olgu başına bir ekstra model çağrısıyla yinelenenleri ve çelişkileri arar.

## Yeniden kurma

"Rebuild from scratch", bölümleri ve olguları mesajlardan arka planda, yaklaşık her 30 saniyede bir model çağrısıyla yeniden yazar. Kendi, düzenlediğiniz ve sabitlediğiniz olgular ile düzenlenmiş bölümler kalır; yenisi hazır olana kadar mevcut kayıt kullanılır. Hiçbir sahne kapanmamışsa başlamayı reddeder.

Bir bölüm yazıldıktan sonra mesajları düzenlerseniz, o bölüm bayat işaretlenir ve yeniden yazılır.

## İlgili

Bir karakterin kartı, bitmiş sohbetlerin belleğini de tutabilir: bkz. [[memory]]. *Litopys: chapters and proposals*, *Facts and proposals* ve *Overview vs Details* Help makaleleri ekranları kapsar.
