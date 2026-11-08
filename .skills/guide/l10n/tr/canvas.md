<!-- source: 045cbad8d708 -->
# Canvas: sohbet bağlantıları, istem ve ajanlar

Canvas, Roleplay'in teknik çalışma tezgâhıdır: sohbetlerin nasıl bağlandığını ve her sohbetin modele ne gönderdiğini gördüğünüz ve değiştirdiğiniz, panolardan oluşan tek bir ekran. Oynamak için buna ihtiyacınız yoktur. Bir hikâyenin devamına ihtiyaç duyduğunuzda, bir yanıt sizi şaşırttığında ya da ajan kurduğunuzda açın.

Üstteki **Board** anahtarıyla bir pano seçin: **Chat links**, **Prompt**, **Agents** ve **Agent sets**. Rayda Agents öğesi aynı Canvas'ı kendi Agents panosunda açar. En son kullandığınız pano hatırlanır.

## Chat links

Sohbetlerinizin bir haritası. Her sohbet bir karttır. Bir sohbetten diğerine giden çizgi, "bu sohbet şu sohbeti sürdürür" anlamına gelir: önceki sohbetin hikâyesi, Library'de ayarlanan arka plan öyküsü bütçesi dahilinde, sonraki sohbetin yanıtlarında arka plan olarak taşınır. En yakın üç önceki sohbet tam olarak okunur, daha eskileri ise özetlenir ([[long-chats]]). Düz çizgi bir devamdır. Kesik çizgi, bir mesajdan çatallanan bir daldır.

- Panoya koymadığınız sohbetler soldaki listede (**Chats**) bekler. Birini panoya sürükleyin ya da **Put on the board** düğmesini kullanın (**its linked chats** ile zincirin tamamını getirmek için). Bir kartı listeye geri sürükleyin ya da **Remove** ile panodan çıkarın. Sohbetin kendisi Library'de kalır.
- Kartları bağlamak veya bağlantısını kesmek için **Edit** anahtarını açın. Döngü oluşturacak, bir sohbeti kendisine bağlayacak ya da mevcut bir bağlantıyı tekrarlayacak bağlantı reddedilir ve pano nedenini söyler. **Undo** ve **Redo** de oradadır. **Fit** tüm grafiği çerçeveye alır.
- Telefonda pano **View** modunda, bağlantıların **List** görünümüyle açılır. Grafik kurmak büyük ekranda daha kolaydır, ama bağlantıları listede yine de düzenleyebilirsiniz.

Library'nin bir sohbet haritası aynı zinciri gösterir ama yalnızca görüntülemeye yöneliktir. Onun **Edit on canvas** düğmesi sizi buraya getirir.

## Prompt

Modele gönderdiği isteği görmek için bir sohbet seçin. Panonun iki görünümü vardır: **Parts** ve **Memory**.

- **Parts** isteğin her parçasını listeler: ana istem, karakter kartı, persona, lorebook girdileri, örnek diyalog, preset bölümleri ve geçmiş; her birinin token sayısı ve durumu ile. Bir parça preset'te kapalı, bu sohbet için kapalı, boş ya da bu tür yanıt için geçerli olmayan olabilir. Preset'e dokunmadan bir parçayı yalnızca bu sohbet için kapatabilirsiniz. **Only what is sent** gerisini gizler ve toplam modelin aldığını gösterir.
- **Memory**, bellek son yanıt için neyi neden koyduğunu açıklar: tam açıklama [[memory]] sayfasındadır.

Yalnızca son yanıtta neyin tetiklendiğine daha hızlı bakmak için sohbet başlığındaki **Fired** düğmesini kullanın. Memory görünümü ve **Fired** aynı kaydı okur; Fired ayrıca tüm sohbet boyunca sayar.

## Agents ve Agent sets

Ajan atölyesi: bir ajan oluşturun, deneyin ve ajanları kümelere ayırın. Bkz. [[agents]].

## Olduğu gibi kalanlar

Prompt panosunda bir parçayı kapatmak yalnızca o sohbeti etkiler. Preset ve kartlar değişmez.
