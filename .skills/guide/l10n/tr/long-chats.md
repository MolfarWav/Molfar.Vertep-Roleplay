<!-- source: 49838714a096 -->
# Uzun sohbetler ve token maliyeti

Haftalarca süren bir sohbet büyür ve her yanıt modele daha fazlasını gönderir. Bu sayfa, yanıtları yavaşlayan ya da pahalılaşan, ya da modelin hikâyenin başlangıcını unuttuğu herkes içindir.

## Request size düğmesi

Pencerede yer olduğu sürece sohbetin tamamı varsayılan olarak gönderilir. Büyük bir pencerede maliyet sürekli artar; bu yüzden sohbet başlığında hikâye araçlarının yanında bir **Request size** düğmesi vardır (telefonda: Menu içinde). Son isteğin kaç token gönderdiğini, sağlayıcının saydığı tüm istemi ve isteği hangi modelin aldığını gösterir. Model, penceresi ve sınırınız için basın. Sınırın dörtte üçünün altında turkuaz, oradan itibaren kehribar, sınırı geçince uyarı işaretiyle kırmızıdır. Canvas Prompt panosu bir isteğin her parçasını listeler ([[canvas]]).

Bir yanıt isteği sınırın üstüne çıkardığında bir açılır pencere açılır:

- **Yes, continue in a new chat** sonraki sohbeti hemen oluşturur ve açar.
- **Not now** bu sohbet için pencereyi, istek yarıya kadar büyüyene kadar gizler. Kapatmak da Not now sayılır.
- **Send finished scenes as chapters instead** Litopys açıkken görünür (sonraki bölüm).

Sınır açılır pencerenin altında ve Library'de, dişli "Litopys settings" içinde, "In the prompt" bloğunda, "Warn me when a request gets big" olarak durur: modelin penceresinin %60'ı (varsayılan), yazdığınız bir boyut (100k) ya da seçtiğiniz bir boyut (16k ile 500k arası) veya hiçbir zaman. Sınırı zaten geçmiş bir sohbet, yeni bir yanıt büyüyene kadar kırmızı düğmeyi gösterir ve açılır pencere göstermez.

Kaydın kendi boyutu vardır. Aynı blokta "Memory size" varsayılan olarak Auto'dur: modelin penceresinin %15'i, 800 ile 16000 token arası. "Compact" onu 800'de tutar.

## Maliyeti kesen anahtarlar

Aynı blokta "Older messages leave the prompt" iki seçenek sunar:

- **Only when the window is full** (varsayılan): pencereye sığdığı sürece her mesaj gönderilir.
- **By scenes**: bir bölüm bir sahneyi kapsar kapsamaz sahne bölümle değiştirilir. Yalnızca son mesajlar kelimesi kelimesine kalır ("Direct messages after the scenes", 2 veya daha fazla). En yeni sahnenin henüz bölümü yoktur, bu yüzden tam olarak gönderilir.

"By scenes" bir miktar ayrıntıdan feragat eder: bölüm bir yeniden anlatımdır, zayıf bir model küçük bir şeyi kaybedebilir. Asla kaybolmaması gereken bir olguyu sabitleyin ([[litopys]]). Diğer kesintiler:

- Canvas Prompt panosu, geçmiş kartı, Details: yalnızca son N mesajı gönderin (masaüstünde, yalnızca o sohbet için).
- "Memory size"ı Compact'a düşürün ya da "Chapters and facts"i kapatın.

## Yeni bir sohbet başlatıp hikâyeyi korumak

Doğal bir aranın ardından, eski sohbeti sürdüren yeni bir sohbet küçük bir istemle başlar ve yine de olanları bilir.

1. Sohbette "More"u açın ve **Continue in a new chat**i seçin ya da açılır pencerede Yes'e basın.
2. Yeni sohbet hemen oluşturulur ve açılır. Preset'i ve onun seçimlerini, persona'yı, modeli, ajan setini, bir grubun tur sırasını ve World DM dünyasını korur.
3. Eski hikâyeyi arka plan olarak alır: "Backstory budget" içinde, en yakın üç önceki sohbetin bölümleri, olguları ve dönüm noktaları. Uzun bir zincirin daha eski sohbetleri kaybolmaz: tek bir özetlenmiş bölümde taşınırlar (aşağıya bakın). Eski mesajlar gönderilmez.

Önceki sohbet bundan sonra kendiliğinden Archive'a taşınır (sonraki bölüm). Bağlantı Canvas'ın çizdiği bağlantıdır ve Canvas bunu sonra değiştirebilir: bkz. [[canvas]]. Başka bir önceki sohbeti seçmek için karakterden bir sohbet başlatın ve "New chat with" adımındaki **Continues** menüsünü kullanın.

Yeni sohbet kartın ilk selamlamasıyla açılır; "Edit the first message" hikâyenin durduğu yerden devam etmenizi sağlar.

## Birçok sohbetten oluşan bir hikâye

Bir hikâye birçok sohbete yayılabilir. En yakın üç önceki sohbet, daha önce olduğu gibi bölümlerini, yaylarını (arcs) ve olgularını verir. Daha eski her sohbet, en başa yerleştirilen tek bir **far** (uzak) bölüme girer: dönüm noktaları, sabitlenmiş ve key olgular ve her yay için bir satır. Bu bölüm, Litopys'in zaten yazdıklarından ekstra bir model çağrısı olmadan oluşturulur ve varsayılan olarak Backstory budget'ın %18'ini kullanır (Library, Litopys settings, "In the prompt", **Share for the far chats**, 5 ile 40 arası). Aynı blokta **Turning points shown**, bütün hikâye boyunca bir yanıtta kaç dönüm noktasının taşınacağını belirler (varsayılan 12). Bütçe kısaysa, en eski sohbetler önce satırlarını, dönüm noktaları ise en son kaybeder. **What this chat carries** içinde bu kendi satırıdır: "Far backstory, chats 1-2"; böylece ilk sohbetlerin kaybolmadığını, tutulduğunu görürsünüz. Kısa bir zincirin uzak bölümü yoktur. Uzun bir hikâye ince geliyorsa Backstory budget değerini yükseltin.

Özetlenmiş bir bölüm küçük ayrıntıları düşürür (bir pelerinin rengi); aşağıdaki kelimesi kelimesine anılar bunları geri getirir.

## Bitmiş bir hikâyeyi arşivleme

İşiniz biten bir hikâye **Archive**'a gidebilir. Bu bir taşıma değil, sohbetin bir durumudur: sohbet olduğu yerde kalır, böylece belleği, Canvas'taki bağlantıları ve ondan yapılmış her kitap çalışmaya devam eder.

- Chats'te bir sohbet seçin ve panelindeki **Archive** düğmesine (kehribar düğme) basın ya da Select ile birkaçını işaretleyin. Bir sohbetin içinde bu, "Manage chat" altındaki menüdedir.
- Arşivlenmiş bir sohbet listeden ve Home'dan çıkar. Filtrelerin altındaki kehribar **Archive** satırı onları açar; **Back to chats** geri döndürür.
- Salt okunur açılır: okuyabilir, kopyalayabilir, bir mesajdan dal açabilir, dışa aktarabilir ve Dashboard'una ile Library'sine bakabilirsiniz; ama gönderemez, kaydırma yapamaz, düzenleyemez ya da silemezsiniz. Altındaki yer **Continue in a new chat**i sunar. **Unarchive** (panelinde ya da şeritte) onu yeniden normal yapar.
- Onay penceresi, henüz bu sohbeti devam ettiren bir sohbet yoksa **Archive and continue**yu sunar.
- Bir sohbet başka birinin önceki sohbeti olduğunda **kendiliğinden olur**: Canvas'ta bir bağlantı, Continue in a new chat, yukarıdaki açılır pencere ya da "Continues" içinde bir seçim. Geri alma (Undo) düğmeli bir bildirim bunu söyler. Dallar devam sayılmaz ve olduğu gibi kalır. Library'de, dişli "Litopys settings" içinde, "Archive the earlier chat when it is continued" ile kapatın.
- Bir hafta sessiz kalmış, 100 veya daha fazla mesajlı bir sohbet listede küçük bir "Long chat · archive?" etiketi ve panelinde bir ipucu alır. Sizin için hiçbir şey arşivlenmez.

Neden uğraşmalı: önceki sohbet artık değişmez; belleği sabit kalır ve onu devam ettiren yeni bir sohbet onu bitmiş bir hikâye olarak okur ([[litopys]]).

## Bölümlerin düşürdüğü ayrıntılar

Bir bölüm bir yeniden anlatımdır; bu yüzden önceki bir sohbetin küçük bir ayrıntısı içinden kaybolmuş olabilir. Library'de, Litopys settings, "In the prompt" içinde **Word-for-word memories of earlier chats** anahtarı (varsayılan olarak açık), diğer sohbetleri devam eden bir sohbetin, söylenenler onlarla nadir kelimeleri paylaştığında orijinal mesajlardan bir ya da iki pasajı geri getirmesine izin verir ([[litopys]]). Önceki sohbet Archive'a gittiğinde dizinlenir. Yalnızca kelimeleri eşleştirir; bu yüzden başka sözcüklerle anlatılan bir ayrıntı bulunmaz. Deneysel **Also find old chapters by meaning** anahtarı (kapalı), gömme modelleri kullandığınızda bu boşluğu biraz kapatır: bölümü anlamla bulur, ama bir pasajın yine de kendine özgü bir nadir kelimeye ihtiyacı vardır.

## Hikâyeyi kitap olarak kaydetme

Library'de, Litopys'te "Save as a book" bir sohbetin bölümlerini, yaylarını (arcs) ve olgularını, seçtiğiniz sohbetler için Data Bank rafına kopyalar: bkz. [[memory]].

## Modelin ne aldığını kontrol etme

Bir karakter bir şeyi unutursa, Canvas > Prompt'u açın ve "Parts"tan "Memory"ye geçin: hangi olguların girdiğini, hangilerinin dışarıda bırakıldığını ve nedenini gösterir. Sohbet başlığındaki **Fired** düğmesi bunu son yanıt ve tüm sohbet için gösterir.
