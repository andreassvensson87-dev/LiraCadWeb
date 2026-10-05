# Minnesprov 2026-10-04

Appens snap använder ritindexet för att hitta objekt nära pekaren och beräknar
snappunkter/kanter först när de behövs. Bågcentrum, blockens insättningspunkter,
bulger och måttankare täcks av ett kompletterande objektindex med konservativa
gränser. Långa linjer kan snappa och bilda skärningar nära pekaren även när
ändpunkterna ligger långt utanför vyn.

En LRU-cache håller högst 512 objekt och 8 192 punkter/kanter. Ett förberett
sökfönster återanvänds medan pekarens toleransområde ryms inom det; även detta
fönster har gränserna 512 objekt och 8 192 punkter/kanter. Det innehåller endast
geometri som kan beröra fönstret. Överstora objekt behålls inte i objektcachen.
Breda sökningar kan använda mer temporärt minne för att ge kompletta resultat,
men behåller inget överstort fönster. Cacheposter för borttagna eller ersatta
objekt tas bort vid dokumentuppdatering.

## Reproducerbart prov

Kör `node --expose-gc tests/performance/memory.mjs`. Provet använder 100 000
blandade objekt, 20 000 lokala och 2 000 översiktliga snap-sökningar, 200 små
redigeringar samt 80 Ångra. Rapporten visar levande JavaScript-heap efter
explicit garbage collection, processens RSS och cacheantal.

Före jämförelsen använde samma moduler ett globalt snap-index med 420 000
punkter och 140 000 kanter. Lokal uppmätt levande heap, i MiB:

| Steg | Global snap | Lokal snap |
| --- | ---: | ---: |
| Dokument och ritindex | 71,1 | 71,1 |
| Med snap-index/provider | 319,5 | 78,2 |
| Efter 22 000 snap-sökningar | 319,6 | 78,7 |
| Efter 200 små redigeringar, historik begränsad till 80 poster | 467,3 | 206,0 |
| Efter tömd historik | 345,0 | 83,8 |

Dokument och index använder cirka 75 % mindre levande heap innan historiken
fyllts. Den globala samlingen av snappunkter/kanter har försvunnit ur appen;
fullständiga index finns kvar i det fristående API:t och som testreferens.
Historiken delar geometri men håller fortfarande kopior av objektarrayer.
Den är därmed nästa större kvarvarande minnespost för många små ändringar.

## Korrekthet och svarstid

Lokala tester jämför kandidater och ordning mot den tidigare fullständiga
snappningen vid flera zoomnivåer. De täcker bågar, cirklar, block, bulger, mått,
text, viewports, leader, numeriska toleranser vid långa kanter, cacheeviktion,
mycket stora polylinjer, synlighet, omordning, tillägg, radering och återställning.
Alla kandidater behålls även när sökområdet är större än cachegränsen.

Webbläsarprovet med 100 000 objekt gav under 0,1 ms i median för lokal snap och
0,3 ms för översiktlig snap (95:e percentil 0,7 ms). Appens riktiga
interaktionstest behöll 16,7 ms i median mellan bildrutor och visade snap-feedback
i 53 av 60 steg. Nya objekt, sparad flytt/rotation, radering och Ångra/Gör om
passerade. Tid för ny linje var 23,7 ms och nästa omritning nåddes efter 25,6 ms.

Heap-provet körs i Node och omfattar inte webbläsarens grafikbuffertar,
IndexedDB-skrivningar, återställningslogg eller DWG-import. RSS omfattar även
minne som JavaScript-motorn behåller för återanvändning; det är inte samma sak
som levande objekt. Komplexa block och polylinjer beräknas fortfarande som hela
objekt vid en kall cache innan deras lokala geometri väljs ut. Produktionsfiler
med sådan geometri behöver egna mätningar. Siffrorna är lokala syntetiska prov.
