<!-- source: 22d2bcc1795f -->
# Litopys: hikâye kaydı

Litopys (vakayiname), tek bir sohbetin uzun belleğidir. Hikâyeyi arka planda okur ve biten her sahne için bir bölüm, ayrıca hikâyenin yerleştirdiği olguları yazar. Bir sohbet modelin penceresi için çok uzadığında, kayıt hikâyeyi ileri taşır. Uzun hikâyeler için kullanın; başlatmanız gerekmez.

## Bölümler ve olgular

- Bir **bölüm**, bir sahnede neyin değiştiğini söyler, yeniden anlatım değildir. Bir sonraki sahne başladığında yazılır; bu yüzden en son sahnenin henüz bir bölümü olmayabilir. Yeni bir yer ya da zamanda sıçrama bir sahneyi kapatır; bir mesaj dizisini, bir mesajın "More" menüsünde Story altından, kendiniz de sahne olarak işaretleyebilirsiniz.
- Bir **olgu**, doğru kalan kısa bir cümledir: "Medli pazarda kanatlarını gizler." Olguların bir türü, bir ağırlığı (Everyday, Important, Key) ve onları kimin bildiği vardır. Olguları elle ekleyebilir, düzenleyebilir, sabitleyebilir veya emekliye ayırabilirsiniz.
- **Bir olgu tüm bir gruba bilinebilir**, örneğin bir lonca: "Known to" alanına `group: Guild of Ravens` yazın; sahnede bulunan her üye bunu bilir, diğerleri bilmez. Bir grup, bir kartın `group: Guild of Ravens` ya da `faction: Guild of Ravens` biçiminde yazılmış bir etiketi olduğunda (diğer etiketler grup değildir) ya da Grup veya Yer türünde bir World DM kaydı Members listelediğinde vardır ([[world-dm]]). Bir üye sahnedeyken, bölümleri yazan modele grup bildirilir ve grubun tümünün öğrendiği haberler için kullanabilir. Bir anlık kopya (snapshot) kitabı, kaydettiğiniz anda üyelerin adlarını kopyalar.
- Bir **inanç** (belief), Belief türünde bir olgudur: bir karakterin bir yalanla söylenmiş ve yine de doğru kabul ettiği bir şey. Bir yalan Dashboard'un Said listesinde bir süre durduktan sonra görünür, ona inanan kişiye aittir ve yalnızca o karakterin yanıtlarına girer. O karakter gerçeği öğrendiğinde ya da yalanı kaldırdığınızda biter; **Knows the truth now** ile elle de bitirebilirsiniz, bu da Dashboard'a bildirilir. Memory görünümü, bir inanç bir yanıta girdiğinde onu işaretler. Bkz. [[dashboard]].
- **Proposals**, Litopys'in önerileridir: iki olguyu birleştirme, birini emekliye ayırma, yeniden ifade etme, sabitleme. Her birini kabul edersiniz ya da reddedersiniz.
- Bir karakterin açıkça gösterdiği **Habits** de görünebilir ve birkaç sahnede tekrarlandıktan sonra bir alışkanlığa dönüşebilir.

## Nereye bakmalı

Bu sohbetin kaydını bir yan panelde görmek için sohbet başlığındaki **Record**a basın (telefonda, Menu içinde). Rayın **Library** bölümü her sohbetin kaydını gösterir. İki görünümü vardır: Overview (bir zaman çizelgesi, karakter başına bir kart, bekleyen öneriler) ve Chapters, Facts, Proposals, Habits, Activity ve Settings sekmeleriyle Details. Activity sekmesi Litopys'in ne yaptığını, mümkünse Undo ile birlikte günlükler. Dişli simgesi ("Litopys settings") kaydın nasıl yazılacağını ayarlar.

## Önceki sohbetlerin kelimesi kelimesine anıları

Bir bölüm bir yeniden anlatımdır; bu yüzden küçük bir ayrıntı (bir pelerinin rengi, tam bir söz) içinden eksik kalabilir. Bu sohbet önceki sohbetleri sürdürdüğünde ([[long-chats]]), Library'de Litopys settings, "In the prompt" bloğunda **Word-for-word memories of earlier chats** anahtarını açın. O zaman söylenenler nadir kelimelerin birkaçını eski bir pasajla paylaştığında, ORİJİNAL mesajlardan bir veya iki pasaj, olgulardan daha eski olarak etiketlenmiş biçimde isteme girer. Tüm zinciri okur, yalnızca en yakın üç sohbeti değil; bir karakter yalnızca o karakterin bulunduğu bir sahnenin pasajını alır. Model çağrısı yoktur; varsayılan olarak kapalıdır ve en fazla "Word-for-word budget" token'ı (varsayılan 400) kullanır. Yeterli nadir kelime paylaşılmazsa hiçbir şey eklenmez. Memory görünümü ve Fired paneli son yanıt için eklenenleri listeler; Canvas Prompt panosunun bu sohbet için kendi anahtarı vardır.

## İsteme ne girer

Varsayılan olarak kayıt otomatik eklenir. "Memory size" kaç token alabileceğini söyler: varsayılan Auto (modelin penceresinin %15'i, en az 800 ve en fazla 16000), Compact (800 token) veya 200'den 16000'e kadar Custom. Auto, büyük bir pencerenin hikâyeden daha fazlasını taşımasına izin verir; küçük bir modelde 800 civarında kalır. Daha önce kendiniz kaydettiğiniz bir boyut olduğu gibi kalır. Her şey sığdığında tamamı gönderilir; aksi halde sahne için en önemli parçalar. Küçük bir model küçük bir boyut ister. "Chapters and facts" kapalıysa yeni bölüm ya da olgu olmaz ve isteme hiçbir şey eklenmez.

Daha eski mesajlar, ancak pencere dolduğunda ya da bir bölüm onları sahne sahne kapsadığında istemden çıkabilir; bunu "Older messages leave the prompt" ayarı seçer: "Only when the window is full" (varsayılan) ya da "By scenes". [[long-chats]] hangisini seçeceğinizi söyler.

## Anlama göre eşleştirme

Bellek olguları ve bölümleri kelimelerle bulur. Bir gömme modeliyle anlamla da bulur: başka kelimelerle sorulan bir soru yine olguya ulaşır. **Matching by meaning** kartı (bir sohbet kaydının en üstünde ve Canvas > Prompt > Memory içinde) durumunu gösterir: off, failing, no vectors yet, partly done, done ya da başka bir modelle yapılmış. Modeli Settings > Memory içinde bir kez kurun: varsayılan olarak uygulama önce kendi bilgisayarınızdaki bir modeli (LM Studio ya da Ollama), sonra anahtarlı bir API bağlantısını, ardından OpenRouter'ı kullanır. Gömme modeline bir çağrı çalıştığında (kartın düğmesine basınca ya da bir yanıtla), motor her sohbetin ve Data Bank dosyasının eksik vektörlerini birkaç dakikada bir bakarak kendiliğinden doldurur; 300.000 token'ı aşan her şey düğmeyi bekler ve Settings > Memory içindeki **Make vectors by itself** anahtarı bunu kapatır. **Embed N items** düğmesi önce kaç öğe olduğunu ve yaklaşık kaç token tutacağını söyler, sonra hemen yapar. Yeni sahneler yeni öğelerini her durumda gömer. Gömme modelini değiştirirseniz, **Embed again** düğmesine basana kadar eski vektörler kullanılmaz. Data Bank'in kendi kartı, **Data Bank by meaning**, Settings > Data Bank'ın en üstündedir: dosyalarınızın ve anlık kopya (snapshot) kitaplarının pasajları için aynı şekilde çalışır; kısmen kapsanan bir dosya "7 of 12 by meaning" yazar.

## Öneriler ve toparlama

"Suggestions" üç seçenek sunar. "Ask me first": her öneri sizin onayınızı bekler. "Only risky ones" (yeni kurulumun varsayılanı): rutin öneriler hemen uygulanır, Activity'de Undo ile günlüğe geçer ve yalnızca riskli olanlar bekler; her birinde neden yazılıdır: yalnızca bazılarının bildiği bir olguyu daha çok kişiye söyleyecek bir birleştirme; sabitlediğiniz, yazdığınız, düzenlediğiniz ya da key olarak işaretlediğiniz bir olguda değişiklik; kalıcı bir değişiklik ya da bir inanç; ve sabitlediğiniz bir olguyla çelişebilecek yeni bir olgu. Aynı neden Inbox'ta da görünür. "Apply pins and rewrites quietly": yalnızca sabitlemeler ve yeniden yazımlar geçer; emekliye ayırma ve birleştirme sizi bekler. "Tidy facts automatically", 30 yeni olgudan sonra, 60 olgu başına bir ekstra model çağrısıyla yinelenenleri ve çelişkileri arar.

## Yeniden kurma

"Rebuild from scratch", bölümleri ve olguları mesajlardan arka planda, yaklaşık her 30 saniyede bir model çağrısıyla yeniden yazar. Kendi, düzenlediğiniz ve sabitlediğiniz olgular ile düzenlenmiş bölümler kalır; yenisi hazır olana kadar mevcut kayıt kullanılır. Hiçbir sahne kapanmamışsa başlamayı reddeder.

Bir bölüm yazıldıktan sonra mesajları düzenlerseniz, o bölüm bayat işaretlenir ve yeniden yazılır.

## Bu sohbet için ayarlar

Bir sohbetin kaydının **Settings** sekmesi (Record yan panelinde ve Library'de, Activity'nin yanında) Litopys'i yalnızca bu sohbet için ayarlar: en kısa ve en uzun sahne, kaç son mesajın kelimesi kelimesine kalacağı (ya da eski mesajlar "By scenes" ile çıkarken sahnelerden sonra kaç doğrudan mesajın kalacağı), eski mesajların istemden çıkış biçimi ve bir karakterin sabitleyebileceği olgu sayısı. Boş bıraktığınız bir alan dişlideki "Litopys settings"i izler ve o değeri "Library: N" olarak gösterir. Bir değer alandan çıkınca kaydedilir. "Use the Library settings" hepsini temizler. Sahne değişiklikleri sık olan bir sohbet, en kısa sahneyi düşük (örneğin 3) tutarak iyi çalışır: kısa bir sahne kendi bölümünü alır. Önceden yazılmış bölümler olduğu gibi kalır; yeni uzunluklarla yeniden yazmak için Rebuild kullanın.

## İlgili

Bir karakterin kartı, bitmiş sohbetlerin belleğini de tutabilir: bkz. [[memory]]. *Litopys: chapters and proposals*, *Facts and proposals* ve *Overview vs Details* Help makaleleri ekranları kapsar.
