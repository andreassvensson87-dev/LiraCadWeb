# Stresstest 2026-10-03

Kontrollerat i Codex inbyggda Chromium-webbläsare på denna dator med 100 000
blandade objekt (linjer, cirklar, bågar, polylinjer och text). Provet finns på
`http://127.0.0.1:5174/tests/performance/` när den lokala servern körs. Det ingår
inte i den byggda appen. Det isolerade prestandaprovet ändrar inga projekt;
interaktionstestet återställer befintligt lokalt utkast och navigeringsval även
vid fel och tar bort sin app-iframe innan lagringen återställs.

## Hittade problem och ändringar

- Varje bildruta beräknade gränser för hela ritningen, även vid inzoomning.
  Ett packat områdesindex återanvänder gränser och söker synliga objekt.
- Varje pekarrörelse sökte alla snap-punkter och kanter. Separata områdesindex
  söker nu bara kring pekaren. Skärningsberäkningar begränsas till överlappande
  kantgränser, med bibehållna geometriska toleranser och ordning.
- Även en liten förhandsvisning ritade om hela dokumentet. Modellbakgrunden
  cachas; förhandsvisningar, grepp, spårning och snap målas ovanpå den.
- Pan/zoom i stora modellvyer återanvänder bilden under rörelsen och ritar exakt
  igen efter 120 ms utan navigation. Tillfälligt bildåterbruk ackumulerar inte
  omskalningsfel; dokumentändringar och ändrad markering ogiltigförklarar cachen.
- En ritning med exakt 100 000 objekt avvisade nästa objekt. Dokumentgränsen är
  nu 200 000, så det största genererade stresstestet har utrymme för redigering.

## Mätningar

Median för JavaScript-anrop i det isolerade Canvas-provet (1000 × 600, DPR 1).
Detta mäter CPU-arbetet att lämna ritkommandon, inte total GPU-/skärmlatens.

| Operation | Före | Efter första index/cache-ändringen |
| --- | ---: | ---: |
| Exakt panorering, översikt | 238,9 ms | 87,6 ms |
| Exakt zoom, översikt | 231,3 ms | 58,2 ms |
| Lokal panorering, inzoomad | 198,4 ms | < 0,1 ms |
| Lokal snap-sökning | 4,7 ms | < 0,1 ms |
| Snap-sökning i översikt | 3,9 ms | 0,6 ms |
| Ändrad förhandsvisning, översikt | 260,8 ms | < 0,1 ms |

Det slutliga interaktionstestet kör appens riktiga händelsehanterare med 60
syntetiska pekar-/hjulhändelser, med LINE aktivt, pan följt av zoom. Bildrutornas
medianintervall var 16,7 ms och 95:e percentilen 16,8 ms (ungefär 60 bilder/s).
Snap-feedback visades i 53 av 60 steg. Provet verifierade ett nytt objekt
(100 001 totalt), Ångra objektet och Ångra genereringen tillbaka till den
ursprungliga ritningen. Inga konsolfel registrerades.

Bekräftelse av ett nytt objekt tog 583,6 ms efter snabbare packning av index
(tidigare 1309,9 ms i samma interaktionstest). Den återstående pausen åtgärdades
i uppföljningen nedan.
Lokal autosparning av 100 000 blandade objekt överskred webbläsarens kvot i
provet; appen visade sitt befintliga meddelande om att spara projekt till fil.

Automatiska tester jämför områdes- och snap-sökningar med full genomgång,
kontrollerar att breda sökningar undviker alla kantpar, och verifierar cache,
exakt omritning, dokumentbyte, markering och lagerändringar. Upplevd respons
med fysisk mus/styrplatta, paperspace med flera stora viewport-vyer och större
produktionsfiler kräver fortsatt kontroll. Siffrorna är lokala provresultat,
inte en generell prestandagaranti.

## Uppföljning: bekräftelse av nya objekt

Det särskilda tilläggsflödet återanvänder oförändrad, rekursivt fryst geometri i
historikens ögonblicksbilder. Inmatade objekt, objektarrayer och metadata är
isolerade; hela nästa dokument valideras fortfarande. Områdesindex uppdaterar
berörda grenar och snap-index beräknar enbart det nya objektets geometri.
Modellbakgrunden målar bara tillägget när cachevillkoren tillåter det.

Samma interaktionstest med 100 000 blandade objekt gav **24,6 ms** för
bekräftelsen, mot tidigare **583,6 ms** (cirka 96 % mindre arbete i anropet).
Tid från bekräftelsens början till nästa omritning var **27,2 ms**. Pan/zoom
behöll 16,7 ms i median mellan bildrutor. Ett nytt objekt, Ångra objektet och
Ångra genereringen passerade; befintligt lokalt utkast återställdes.

Ett utökat prov med samma ritningsstorlek verifierade även cirkel, skraffering
och text genom appens riktiga kommandon/editor. Bekräftelsen tog 29,8 ms,
29,5 ms respektive 42,3 ms. Linjen tog i denna körning 22,8 ms och nådde sin
nästa omritning efter 24,7 ms. Samtliga objekt gick att ångra, och Ångra
genereringen återställde den ursprungliga ritningen.

Nya regressionstester täcker delad geometris skrivskydd, privata arrayer och
metadata, avvisade tillägg, bibehållen redo, vanlig redigering efter tillägg,
beständiga index vid upprepade noddelningar, snap-skärningar mellan gamla och
nya objekt samt bakgrundens tilläggsmålning och lagerinvalidering.

## Uppföljning: redigering och historik (2026-10-04)

Flytt, rotation, radering, greppändringar och redigeringskommandon utan nya
blockdefinitioner accepterar nu en färdig objektlista i `replaceEntities`.
Oförändrade objekt delas med historiken; ersättningar kopieras och hela
ritningen valideras. Ångra/Gör om återanvänder samma frysta geometri.
Områdes- och snap-träden ändrar berörda grenar i stället för att omberäkna all
geometri. Snap-geometri cachas per oföränderligt objekt. Stora ändringar
använder fortsatt full packning av trädet.

Ett lokalt Node-prov med 100 000 blandade objekt mätte en ändring av en linje,
radering av linjen samt Ångra/Gör om. Dokumentändring och båda indexen ingår;
Canvas-målning och autosparning ingår inte. Före och efter kördes med samma
ritningsstorlek och mätsekvens:

| Åtgärd | Före, ms | Efter, ms |
| --- | ---: | ---: |
| Flytt | 690,8 | 80,1 |
| Rotation | 808,9 | 88,2 |
| Radering | 699,2 | 84,2 |
| Ångra | 358,1 | 61,9 |
| Gör om | 424,1 | 66,7 |

Webbläsarprovet i `tests/performance/` har en separat knapp **Kör redigering och
historik**. Det använder samma dokument- och indexmoduler som appen och en
isolerad testdatabas. Slutprovet gav 61,9 ms för flytt, 88,8 ms för rotation,
71,6 ms för radering, 45,5 ms för Ångra och 49,2 ms för Gör om. Geometri, snap
för flyttat/raderat objekt, hela historikkedjan samt exakt återöppning från
IndexedDB passerade. Själva sparningen tog 49,8 ms.

Appens separata interaktionsprov kontrollerar också MOVE och ROTATE av alla
100 000 objekt, sparad geometri, markering/radering av samtliga objekt och
Ångra/Gör om, förutom befintliga rit- och navigeringstester. Stora markeringar
kontrollerar medlemskap med Set, vilket undviker en full objektsökning för
varje valt ID. Befintligt utkast och navigeringsinställningar återställs efter
provet, även vid ett testfel.

Regressionstester jämför ändrade områdes- och snap-index med fulla ombyggnader
vid ersättning, radering, omordning, tom ritning och återställning. De verifierar
även att historiska index förblir oförändrade, indata inte kan ändra accepterad
geometri och att likvärdiga eller ogiltiga ersättningar bevarar redo.

Små ändringar har fortfarande linjära kostnader för dokumentvalidering,
objektarrayer och rangtabeller. Ersatt eller raderad geometri kräver exakt
omritning av modellbakgrunden. Siffrorna gäller lokala syntetiska prov och
mäter inte hela tiden till en synlig bildruta efter redigeringen.

## Uppföljning: lokal snap och begränsad cache (2026-10-04)

Appen använder nu `local-snapping.js` och delar ritindexet. Snap-geometri
beräknas för närliggande objekt, med begränsad LRU-cache och ett återanvänt
sökfönster. Inga globala punkt-/kantindex byggs för appens hela dokument.
Konservativa kompletterande gränser skyddar bågcentrum, blockinsättning och
andra ankare utanför den synliga geometrin.

Det lokala minnesprovet minskade dokument/index från 319,5 till 78,2 MiB levande
JavaScript-heap, och från 467,3 till 206,0 MiB efter 200 små redigeringar med
80 historikposter. Snap i webbläsarens översiktsprov tog fortsatt 0,3 ms i
median. Appens pan/zoom hade 16,7 ms mellan bildrutorna i median; linje, cirkel,
skraffering och text tog 23,7, 22,5, 21,7 respektive 28,8 ms att bekräfta.

Se [minnesprovet](memory.md) för reproduktion, cachegränser, korrekthet och
mätningarnas omfattning.
