<!-- source: fe19559d281a -->
# Welches Gedächtnis wofür

Roleplay hat mehrere Dinge, die „sich erinnern“. Sie unterscheiden sich darin, wer sie behält, was sie enthalten und wie lange sie halten. Wenn ein Charakter etwas vergisst, sagt dir diese Seite, zu welchem du greifen solltest.

## Die Arten

**Chatverlauf.** Die Nachrichten selbst. Das Modell sieht so viele der jüngsten, wie sein Fenster erlaubt.

**Dashboard** ([[dashboard]]). Pro Chat der *aktuelle* Zustand der Szene: wer anwesend ist, Gefühle, Kleidung, offene Quests, was jeder Charakter weiß. Es ändert sich mit jeder Antwort.

**Litopys** ([[litopys]]). Pro Chat die *Vergangenheit* der Geschichte: ein Kapitel pro abgeschlossener Szene und eine Liste von Fakten. Darauf stützt sich ein langer Chat, nachdem ältere Nachrichten den Prompt verlassen haben.

**Kartengedächtnis.** Pro Charakter, über Chats hinweg: was der Charakter aus abgeschlossenen Geschichten erinnert, seine Fakten, Notizen, gesagten Zeilen und erworbenen Gewohnheiten. Es lebt im „Memory“-Tab des Karteneditors. Du importierst einen abgeschlossenen Chat, siehst, was behalten würde, hakt an, was behalten werden soll, und ein Schalter blendet eine Geschichte für neue Chats aus. Es hat eine eigene Größe (Standard Compact 800 Tokens). Es ist kein Teil des Kartentexts und erscheint nie in einer exportierten Karte.

**Lorebooks.** Referenzeinträge, die in den Prompt kommen, wenn ihre Schlüsselwörter erscheinen, oder immer für einige. Sie enthalten die Regeln, Orte, Personen der Welt. Verknüpfe ein Buch mit einer Karte oder Gruppe oder markiere es als Global, damit es jeden Chat erreicht. Ein Chat bekommt außerdem sein eigenes Weltbuch, das der World DM schreibt ([[world-dm]]).

**Data Bank** (Tools). Textdokumente, die du hochlädst (nur Textformate, je bis zu 2 MB). Bei jeder Nachricht werden die relevantesten Passagen hinzugefügt. Nutze sie für langes Referenzmaterial, nicht für die Geschichte selbst.

**Autorennotiz** (Chat-Kopfzeile, „Note“). Text, den du nur für diesen Chat schreibst, platziert auf einer Tiefe und Rolle, die du wählst. Nutze sie zum Steuern: einen Stilhinweis, einen Plot-Anstoß.

**Soul** ([[soul]]). Kein Gedächtnis von Ereignissen, sondern wie ein Charakter reagiert; sie verändert sich während des Spiels nie.

## Welche wofür

- „Sie sollte sich an den Streit von letzter Nacht erinnern“: Das Dashboard bewältigt es kurzfristig; Litopys behält es langfristig. Füge einen angehefteten Fakt hinzu, wenn es niemals verloren gehen darf.
- „Sie sollte sich in einem neuen Chat an die vorherige Geschichte erinnern“: Kartengedächtnis, oder verknüpfe die Chats auf dem Canvas, damit der frühere Chat seine Geschichte als Hintergrund mitbringt.
- „Die Welt hat eine Regel oder einen Ort“: ein Lorebook.
- „Ich will, dass die nächsten Antworten in diese Richtung gehen“: Autorennotiz oder der Button „Story, move“.
- „Ich habe ein langes Dokument“: Data Bank.

## Kosten

All dies nimmt Platz im Prompt ein. Das Prompt-Brett des Canvas zeigt jeden Teil mit seiner Tokenzahl und lässt dich Teile für einen Chat ausschalten. Senke bei einem kleinen Modell Litopys' „Memory size“, halte das Kartengedächtnis Compact und bevorzuge wenige kurze Lorebook-Einträge.
