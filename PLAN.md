# LiraCAD Web – utvecklingsplan

Plan 2026-09-28, baserad på källkod i LiraCAD och LiraStructureWeb.

Status: första interaktiva utgåvan 0.1 är byggd. Den innehåller kommandorad, inspector, lager, grundobjekt, transformationer, offset för linje/cirkel, historik, lokal projektlagring och DXF-export. Se README.md för exakt omfattning. Prototypen använder JavaScript och Canvas 2D utan byggberoenden för att snabbt kunna utvärdera känslan. DWG/DXF-import, GPU-rendering, stora ritningars prestanda och resterande produktionsfunktioner återstår; etapperna nedan beskriver fortsatt målbild.

## Mål och första avgränsning

En snabb CAD-app för datorns webbläsare, med AutoCAD-liknande arbetsflöde, ständigt tillgänglig kommandorad och modern högerinspector inspirerad av LiraStructureWeb. Första produkten är en användbar 2D-editor. Datamodellen ska kunna bevara Z-koordinater och senare utökas till fler objekt och vyer.

Fastställt formatflöde: öppna DWG eller DXF, redigera riktiga objekt och spara som DXF. DWG-export ingår inte i planen. Lokal projektlagring används också för autosparning och appspecifika inställningar. Stöd för att läsa, visa, redigera och skriva verifieras separat per objekttyp. Full AutoCAD-, Civil 3D- eller Architecture-kompatibilitet ingår inte i första versionen.

## Vad vi tar med från befintliga appar

- LiraCAD: principerna i CommandRegistry, kommandosessioner, CoordinateParser, Drawing/CADObject, EditHistory och SnapIndex. Swift-koden är en beteendereferens; webbkoden behöver egen implementation.
- LiraCAD: DXFReader hanterar flera entitetstyper, bland annat polylinjer, bågar, splines, hatch och INSERT. Vi ska inventera vilka som blir egna redigerbara objekt respektive förenklad visningsgeometri före portning.
- LiraStructureWeb: mörk blågrön topp, ljusa paneler, grön accent, diskreta kontroller och inspector till höger. Dess Vite/Three.js-upplägg och åtskillnad mellan tangentbordsrouting, verktyg och projekt är användbara referenser.
- Återanvänd beteenden och lämpliga små delar. Kopiera inte hela appar med deras domänspecifika funktioner.

## Arkitektur

Föreslagen grund: TypeScript och Vite, modulärt HTML/CSS-gränssnitt och en isolerad renderingsmodul. Utvärdera WebGL2/Three.js för egen rendering; DWG-läsaren är en separat importmodul. Ett eventuellt UI-ramverk får inte styra omritning vid varje musrörelse.

```text
src/
  app/          start, dokumentflikar och fokusregler
  ui/           verktygsfält, inspector, kommandorad och statusrad
  core/         dokument, entiteter, lager, block och enheter
  geometry/     exakta beräkningar, koordinater och toleranser
  commands/     register, alias, parser och kommandosessioner
  interaction/  markering, grips, snappning och tangentbord
  history/      transaktioner, undo och redo
  render/       kamera, GPU-cache och temporära förhandsvisningar
  io/           projektformat samt DXF/DWG-adaptrar
  workers/      inläsning och tunga beräkningar
tests/          geometri, kommandoflöden, filer och prestandafall
```

Dokumentet är sanningskällan; renderingsgeometrin är en cache. Objekt behåller typ, stabil identitet, koordinater, lager och stilegenskaper. Bågar lagras som bågar, block som definitioner och instanser. Tessellering sker för visning. Importerade handles och referenser bevaras genom formatadaptern.

DWG-adaptern överför stödda objekt till vår dokumentmodell, direkt eller via DXF. Därefter arbetar kommandon, inspector och DXF-skrivare mot samma dokument. Importbibliotekets datamodell hålls bakom adaptern.

## Interaktion som ska kännas rätt

- Skriv `L` och Enter direkt i ritytan för LINE. Ingen föregående klickning i kommandoraden.
- Kommandon har tydliga steg: objektval, baspunkt, målpunkt, avstånd och alternativ. Klick och textinmatning matar samma kommandosession.
- Enter/Space bekräftar eller upprepar senaste kommandot när läget tillåter det; Escape avbryter förhandsvisningen utan att ändra dokumentet.
- Historik, alias och kompletteringsförslag. Engelska kommandon med svensk hjälptext som första standard.
- Absoluta koordinater, relativa koordinater (`@100,50`), polära koordinater (`@100<45`) och längd i utpekad riktning. Entydig regel för decimalkomma kontra koordinatavskiljare.
- Kommandorouting gäller när appen har fokus. Textfält i inspector, textredigering och dialoger äger sin inmatning. Respektera IME, klistra in och webbläsarens reserverade genvägar.
- Zoom kring pekaren, panorering med mushjulsknapp, korshår och gummibandsförhandsvisning. Testa även styrplatta.
- Vänster–höger markeringsruta väljer helt inneslutna objekt; höger–vänster väljer även korsande objekt. Förvalda objekt och kommando-först ska fungera.
- OSNAP, ortho och polar med synlig status. Funktionsknappar där webbläsaren tillåter dem och klickbara alternativ i statusraden.
- Högerinspector med Egenskaper och Lager, gemensamma värden vid flerval, tydligt Blandat-läge och en ångringspost per bekräftad ändring.

## Etapper och godkännandekriterier

| Etapp | Leverans | Klar när |
|---|---|---|
| 0. Tekniskt prov | Representativa ritningar, objektsupportmatris, DWG-importprov och renderingsbenchmark | Vi vet vilka objekt som läses/visas/bevaras och har ett motiverat biblioteksval. Provet omfattar DWG → objekt → DXF → återöppning i en oberoende CAD-läsare. |
| 1. CAD-känsla | Appskal, högerinspector, kommandorad, pan/zoom, LINE, markering, ERASE och undo/redo | Hela flödet rita–markera–ändra–ångra fungerar med tangentbord och mus utan fokustapp. Lokal projektsparning och återöppning fungerar. |
| 2. Användbar 2D-editor | PLINE, CIRCLE, ARC, RECTANG, MOVE, COPY, ROTATE, SCALE, MIRROR, lager, grips, koordinatinmatning och grundläggande snap | En mindre riktig ritning kan skapas och ändras exakt. Varje kommando kan avbrytas och ångras korrekt. |
| 3. DWG in, DXF ut | Öppna DWG/DXF och spara DXF för överenskomna grundobjekt, lager, färg, linjetyp och enheter | DWG-import–ändring–DXF-export–återöppning bevarar avtalad geometri och egenskaper. Importen redovisar sådant som saknar stöd. |
| 4. Ritningsproduktion | TEXT/MTEXT, block/attribut, mått, hatch, OFFSET, TRIM, EXTEND och FILLET | Utvalda vardagsritningar kan bearbetas med kontrollerat stöd för dessa objekt. Block behöver inte exploderas för att visas. |
| 5. Bredare filstöd | Fler DWG-objekttyper och filversioner samt motsvarande DXF-export | Ett representativt DWG-testbibliotek klarar stödmatrisen genom hela flödet till sparad DXF. |
| 6. Layout och breddning | Paperspace, viewports, skalor, PDF/utskrift, XREF och fler avancerade objekt | Utvalda leveransritningar blir korrekta i både modell och utskrift. |

DWG-provet görs i etapp 0 även om den kompletta användarfunktionen kommer senare. Slutlig ordning för block, mått och layout anpassas efter de verkliga ritningarna.

Första demonstrationen: skriv `L`, ange två punkter, avsluta, markera linjen, ändra dess koordinat i högerpanelen, kör MOVE och ångra. Panorering och zoom ska förbli följsamma hela tiden. Detta är första konkreta byggleveransen.

## Prestanda och precision

- Föreslagna mål, inte uppmätta löften: omkring 60 bilder/s vid vanlig pan/zoom på överenskommen referensdator; p95 för synlig interaktionsrespons under 50 ms.
- Benchmarka 10 000 och 100 000 enkla objekt, samt verkliga ritningar med mycket text, hatch och block. Registrera dator, webbläsare, upplösning, importtid, minne och bildtider. Objektantal ensamt räcker inte som mått.
- GPU-batchning, visningsurval och återanvänd geometri. Markör, snap och förhandsvisning ska kunna uppdateras utan att bygga om hela ritningen.
- Rumsligt index för markering och snap; uppdatera bara ändrade objekt. Sök nära markören innan dyrare exakta beräkningar.
- Tung import och bearbetning i workers där backend tillåter det. Visa förlopp, tillåt avbrott och ersätt inte aktuellt dokument förrän importen lyckats.
- Dubbelprecision i dokument/beräkningar. Kamerarelativa GPU-koordinater för att undvika skakning vid stora koordinater, till exempel SWEREF.
- Ångra lagrar förändringar per transaktion. Musförhandsvisningar skapar inga historikposter eller fullständiga dokumentkopior.
- Versionsmärkt projektformat, lokal autosparning och explicit nedladdningsbar säkerhetskopia. Webbläsarlagring ensam är inte permanent filförvaring.

## DWG-beslut

Prioritera ett avgränsat importprov med acadrust för lokal DWG-inläsning via WebAssembly. ACadSharp är ett alternativ om en separat importtjänst blir lämpligare. Biblioteksvalet är preliminärt tills verkliga filer har provats; ingen implementation är ännu verifierad.

Vi behöver DWG-läsning och DXF-skrivning. Direkt import till objektmodellen och konvertering via DXF är båda tillåtna vägar. Välj efter objekttrohet, laddningstid, licens och integrationsarbete. ODA/RealDWG är reservspår om de öppna alternativen inte klarar nödvändiga ritningar. Ingen uppladdning av användarfiler till en tjänst införs implicit.

En DWG-till-DXF-konvertering kan användas i ett avgränsat första importflöde, men är inte ett löfte om full objekttrohet eller förlustfri återexport. Visa per fil vad som är redigerbart, endast synligt eller saknar stöd. Behåll originalfilen och stoppa tyst dataförlust vid export. Att behålla okända rådata garanterar inte att referenser fortsatt är giltiga efter redigering.

Återstående beslut: bibliotek och version, webbläsare kontra eventuell tjänst, DWG-versioner, DXF-målversion, objektlista och fontstrategi. Dessa blockerar inte första CAD-prototypen.

Källor kontrollerade 2026-09-28:

- https://github.com/hakanaktt/acadrust
- https://github.com/DomCR/ACadSharp
- https://www.opendesign.com/products/drawings
- https://www.opendesign.com/products/inweb
- https://forge.autodesk.com/developer/overview/realdwg-api

## Verifiering

Geometritester för snitt, toleranser och transformationer; kommandotester för varje steg, Escape och undo; webbläsartester för fokus, koordinatinmatning, markering och inspector. Filtester jämför objekt och egenskaper, inte bara skärmbilder. Kör prestandafallen innan större renderings- eller importändringar godkänns.

En representativ testuppsättning bör omfatta enkel 2D, block/attribut, mått/hatch, stora koordinater, olika fonter, externa referenser och okända objekt. Senare behövs användarens faktiska ritningar för att prioritera stödet och bedöma om appen kan ersätta AutoCAD i just de arbetsflödena.
