<!-- source: 67addd68fb05 -->
# Uzun sohbetler ve token maliyeti

Haftalarca süren bir sohbet büyür ve her yanıt, onun daha fazlasını modele gönderir. Bu sayfa, yanıtları yavaşlayan ya da pahalılaşan veya modeli hikâyenin başını unutan kişiler içindir.

## Request size düğmesi

Varsayılan olarak, pencere yeterli olduğu sürece tüm sohbet gönderilir. Büyük bir pencerede maliyet artmaya devam eder, bu yüzden sohbet başlığında, hikâye araçlarının yanında (telefonda: Menü'de) bir **Request size** düğmesi vardır. Son isteğin kaç token gönderdiğini, sağlayıcının saydığı şekliyle tüm istemi ve hangi modelin aldığını gösterir. Modeli, penceresini ve sınırınızı görmek için ona basın. Sınırın dörtte üçünün altında turkuaz, oradan itibaren amber renginde ve ötesinde uyarı işaretiyle kırmızıdır. Canvas Prompt panosu bir isteğin her parçasını listeler ([[canvas]]).

Bir yanıt isteği sınırın ötesine taşıdığında bir açılır pencere açılır:

- **Yes, continue in a new chat** hemen sonraki sohbeti oluşturur ve açar.
- **Not now** açılır pencereyi, istek yarı yarıya büyüyene kadar bu sohbet için gizler. Kapatmak da Not now sayılır.
- **Send finished scenes as chapters instead** Litopys açıkken görünür (sonraki bölüm).

Sınır, açılır pencerenin alt kısmında ve Library'de, dişli "Litopys settings", "In the prompt" bloğu, "Warn me when a request gets big" içinde: modelin penceresinin %60'ı (varsayılan), yazdığınız bir boyut (100k) ya da seçtiğiniz bir boyut (16k ile 500k arası) veya asla. Zaten sınırı aşmış bir sohbet kırmızı düğmeyi gösterir ve yeni bir yanıt onu büyütüne kadar açılır pencere çıkmaz.

Kaydın kendi boyutu vardır. Aynı blokta, "Memory size" varsayılan olarak Auto'dur: modelin penceresinin %15'i, 800 ile 16000 token arasında. "Compact" onu 800'de tutar.

## Maliyeti düşüren anahtarlar

Aynı blokta, "Older messages leave the prompt" iki seçenek sunar:

- **Only when the window is full** (varsayılan): sığdığı sürece her mesaj gönderilir.
- **By scenes**: bir bölüm bir sahneyi barındırır barındırmaz, sahnenin yerini bölüm alır. Yalnızca son mesajlar kelimesi kelimesine kalır ("Direct messages after the scenes", 2 veya daha fazla). En yeni sahnenin henüz bölümü yoktur, bu yüzden tam olarak gönderilir.

"By scenes" biraz ayrıntıya mal olur: bir bölüm bir yeniden anlatımdır, bu yüzden zayıf bir model küçük bir şeyi kaybedebilir. Asla kaybolmaması gereken bir olguyu sabitleyin ([[litopys]]). Diğer kısaltmalar:

- Library, Litopys settings, **Direct messages, by size**: sabit bir sayı yerine bir token sayısına sığan en yeni mesajları tutar (en az 2 mesaj). 0, mesajları sayar ([[litopys]]).
- Library, Litopys settings, **Leave out what a speaker was not present for** (varsayılan olarak "Groups only"): bir karakterin söylediği bir yanıt, o karakterin içinde bulunmadığı sahnelerin son mesajlarını almaz ([[litopys]]).
- Canvas Prompt panosu, history kartı, Details: yalnızca son N mesajı gönderir (masaüstü, yalnızca o sohbet).
- "Memory size" değerini Compact'a düşürün veya "Chapters and facts" seçeneğini kapatın.

## Yeni bir sohbet başlatıp hikâyeyi koruyun

Doğal bir arada, eski sohbeti sürdüren yeni bir sohbet küçük bir istemle başlar ve yine de ne olduğunu bilir.

1. Sohbette "More" seçeneğini açın ve **Continue in a new chat** seçin ya da açılır pencerede Yes'e basın.
2. Yeni sohbet hemen oluşturulur ve açılır. Ön ayarı ve seçimlerini, persona'yı, modeli, ajan setini, bir grubun sıra düzenini ve World DM dünyasını korur.
3. Eski hikâyeyi, "Backstory budget" dahilinde arka plan hikâyesi olarak alır. En yakın üç önceki sohbet tam olarak okunur: bölümler, olgular ve dönüm noktaları. Uzun bir zincirin daha eski sohbetleri atılmaz: tek bir yoğunlaştırılmış parça içinde taşınırlar (aşağıya bakın). Eski mesajlar gönderilmez.

Önceki sohbet sonra kendiliğinden Archive'e taşınır (sonraki bölüm). Bağlantı, Canvas'ın çizdiği bağlantıdır ve Canvas onu sonradan değiştirebilir: bkz. [[canvas]]. Başka bir önceki sohbet seçmek için karakterden bir sohbet başlatın ve "New chat with" adımındaki **Continues** menüsünü kullanın.

Yeni sohbet, kartın ilk karşılamasıyla açılır; "Edit the first message" hikâyenin durduğu yerden devam etmenizi sağlar.

## Birçok sohbetten oluşan bir hikâye

Bir hikâye birçok sohbet boyunca sürebilir. En yakın üç önceki sohbet, bölümlerini, arklarını ve olgularını eskisi gibi verir. Daha eski her sohbet, ilk sıraya yerleştirilen tek bir **far** parçaya girer: dönüm noktaları, sabitlenmiş ve kilit olgular ve her ark için bir satır. Parça, Litopys'in zaten yazdıklarından oluşturulur, ekstra bir model çağrısı olmadan ve varsayılan olarak Backstory budget'ın %18'ini alır (Library, Litopys settings, "In the prompt", **Share for the far chats**, 5 ile 40). Aynı bloktaki **Turning points shown**, tüm hikâye boyunca bir yanıtta kaç tanesinin taşınacağını belirler (varsayılan 12). Bütçe kısa kalırsa, en eski sohbetler önce satırlarını kaybeder, dönüm noktalarını en son. **What this chat carries** içinde kendi satırı vardır, "Far backstory, chats 1-2", böylece ilk sohbetlerin kaybolmadığını, korunduğunu görebilirsiniz. Kısa bir zincirin far parçası yoktur. Uzun bir hikâye yetersiz geliyorsa Backstory budget'ı yükseltin.

Yoğunlaştırılmış bir parça küçük ayrıntıları düşürür (bir pelerinin rengi); aşağıdaki kelimesi kelimesine anılar bunları geri getirir.

## Bitmiş bir hikâyeyi arşivleyin

Bitirdiğiniz bir hikâye **Archive**'e gidebilir. Bu, sohbetin bir durumudur, bir taşıma değil: sohbet olduğu yerde kalır, böylece hafızası, Canvas'taki bağlantıları ve ondan yapılmış herhangi bir kitap çalışmaya devam eder.

- Chats'te bir sohbet seçin ve **Archive**'e basın (panelindeki amber düğme) ya da Select ile birkaçını işaretleyin. Bir sohbette, "Manage chat" altındaki menüdedir.
- Arşivlenmiş bir sohbet listeden ve Home'dan çıkar. Filtrelerin altındaki amber **Archive** satırı onları açar; **Back to chats** geri döner.
- Salt okunur açılır: okuyabilir, kopyalayabilir, bir mesajdan dal oluşturabilir, dışa aktarabilir ve Dashboard ile Library'sine bakabilirsiniz, ama gönderemez, kaydıramaz, düzenleyemez veya silemezsiniz. Alt kısmındaki yer **Continue in a new chat** sunar. **Unarchive** (panelinde veya banner'da) onu yeniden normal yapar.
- Onay, bu sohbeti henüz sürdüren bir sohbet yoksa **Archive and continue** sunar.
- **Kendiliğinden olur** bir sohbet başka birinin önceki sohbeti olduğunda: Canvas'taki bir bağlantı, Continue in a new chat, yukarıdaki açılır pencere veya "Continues" içinde bir seçim. Undo'lu bir toast bunu bildirir. Dallar devamlar değildir ve oldukları gibi kalır. Library'de, dişli "Litopys settings", "Archive the earlier chat when it is continued" içinde kapatın.
- Bir hafta boyunca sessiz kalmış 100 veya daha fazla mesajlı bir sohbet, listede küçük bir "Long chat · archive?" etiketi ve panelinde bir ipucu alır. Sizin için hiçbir şey arşivlenmez.

Neden zahmet edesiniz: önceki sohbet artık değişmez, böylece onun hafızası sabit kalır ve onu sürdüren yeni bir sohbet onu bitmiş bir hikâye olarak okur ([[litopys]]).

## Bölümlerin düşürdüğü ayrıntılar

Bir bölüm bir yeniden anlatımdır, bu yüzden daha eski bir sohbetin küçük bir ayrıntısı ondan gitmiş olabilir. Library, Litopys settings, "In the prompt" içinde, **Word-for-word memories of earlier chats** anahtarı (varsayılan olarak açık), başkalarını sürdüren bir sohbetin, söylenen şey onlarla nadir kelimeler paylaştığında orijinal mesajlardan bir iki pasajı geri getirmesini sağlar ([[litopys]]). Önceki sohbet Archive'e gittiğinde dizinlenir. Kelimeleri eşleştirir, bu yüzden başka kelimelerle anlatılan bir ayrıntı bulunmaz; deneysel **Also find old chapters by meaning** anahtarı (kapalı) embeddings kullandığınızda bu boşluğu biraz daraltır: bölümü anlamla bulur, ama bir pasajın yine de kendine ait bir nadir kelimeye ihtiyacı vardır.

## Bir hikâyeyi kitap olarak kaydedin

Library, Litopys, "Save as a book", seçtiğiniz sohbetler için bir sohbetin bölümlerini, arklarını ve olgularını Data Bank rafına kopyalar: bkz. [[memory]].

## Modelin ne aldığını kontrol edin

Bir karakter bir şeyi unutursa, Canvas > Prompt'u açın ve "Parts" yerine "Memory"ye geçin: hangi olguların girdiğini ve hangilerinin dışarıda bırakıldığını ve nedenini gösterir. Sohbet başlığındaki **Fired** düğmesi bunu son yanıt ve tüm sohbet için gösterir.
