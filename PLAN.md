# LiraCAD Web – utvecklingsplan

Plan 2026-09-28, baserad på källkod i LiraCAD och LiraStructureWeb.

Status uppdaterad 2026-10-03: första interaktiva utgåvan 0.1 är byggd och har utökats med lokal DWG/DXF-import, blockeditor och attributfält, bågpolylinjer, måttkedjor, trim/förläng samt layouter och viewports. Se README.md för exakt omfattning och filbegränsningar. Appen använder JavaScript och Canvas 2D utan byggberoenden. GPU-rendering, stora ritningars prestanda och verifiering med representativa användarritningar återstår; etapperna nedan beskriver fortsatt målbild och är inte en lista över enbart återstående funktioner.

### Aktuell kodgrund

Den stabila kodgrunden är huvudfokus enligt avgränsningen 2026-10-02.
Kärnan har separata moduler för ren geometri, objektoperationer, dokumentvalidering
och exempeldata. De egna modulernas beroendegraf är acyklisk och testad.
`DocumentSession` validerar isolerade utkast före historik/autosparning och
bevarar dokument/redo vid fel. Lagerpanel, kommandokatalog och ikoner är separerade.
Se `docs/architecture.md` för modulansvar och regler för vidareutveckling. LINE, CIRCLE, ARC,
RECTANG, PLINE, MOVE, COPY, ROTATE, SCALE och MIRROR använder nu editorns testbara verktygsprotokoll. PLINE behåller
bågsegment, A/L/U/C och en historikpost för hela det färdiga objektet.
Alla transformationskommandon stöder förval och kommando-först med en historikpost för hela urvalet.
OFFSET, TRIM och EXTEND ligger också i editorn: objektval, faser och preview är
separerade från UI, med transaktionssäker uppdatering av markering och gräns-ID.
FILLET/CHAMFER och PINSERT/PDELETE använder också verktygsprotokollet.
Hörnoperationer sparar hela resultatet atomiskt och editorn äger accepterade standardmått.
JOIN/EXPLODE ligger i editorn med atomisk ersättning av hela urvalet. Inspectorns
gemensamma egenskaper, utseende, attribut och objektfält är separata moduler.
Layout-/blockeditorpanelerna är separerade. Scenrenderaren äger Canvas-målning
och viewportklippning med egen kamerakontext utan att ändra appens kamera.
Alla måttkommandon ligger nu i editorn. `BlockEditSession` äger det isolerade
blockutkastet och behåller det öppet vid sparfel. BLOCK/INSERT/ATTDEF och MVIEW
använder också verktygsprotokollet. Texteditorns utkast och UI har separata ägare,
med bevarat utkast vid sparfel. TEXT/LEADER/HATCH och DIST/PAN/ERASE är också
separerade. Appskalet använder nu gemensam dispatch och preview för kommandona;
arkitekturtesterna kontrollerar att varje interaktivt katalogkommando har en
unik verktygsägare. DIST har åter fungerande mätning med avstånd och ΔX/ΔY.
En samlad stabilitetskontroll av filflödet är genomförd; se
`docs/stability.md`. Filoperationer har en testbar ägare och skydd för textutkast
och ändringar under asynkron import.
Bygg vidare inom dessa modulgränser och mät stora dokument innan rumsligt index
eller ny rendering införs.
Verifiera också DWG → redigering → DXF med riktiga ritningar och en oberoende
CAD-läsare; dagens importstöd är avgränsat.

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

Implementerat första importflöde: ACadSharp 3.8.0 körs lokalt i .NET 10
WebAssembly i en separat worker. En DXF-representation skapas i minnet och
går genom samma importör som DXF-filer. Inga ritningar skickas till en server.
ACadSharps `sample_AC1032.dwg` har provats i webbläsaren; bredare verifiering
med verkliga ritningar återstår. Se README.md och `tools/DwgBridge/README.md`.

Vi behöver DWG-läsning och DXF-skrivning. Direkt import till objektmodellen och konvertering via DXF är båda tillåtna vägar. Välj efter objekttrohet, laddningstid, licens och integrationsarbete. ODA/RealDWG är reservspår om de öppna alternativen inte klarar nödvändiga ritningar. Ingen uppladdning av användarfiler till en tjänst införs implicit.

En DWG-till-DXF-konvertering kan användas i ett avgränsat första importflöde, men är inte ett löfte om full objekttrohet eller förlustfri återexport. Visa per fil vad som är redigerbart, endast synligt eller saknar stöd. Behåll originalfilen och stoppa tyst dataförlust vid export. Att behålla okända rådata garanterar inte att referenser fortsatt är giltiga efter redigering.

Återstående beslut: verifierad stödmatris för DWG-versioner/objekt,
DXF-målversion och fontstrategi. Läsaren stöder AC1014–AC1032, men alla versioner
och objekttyper är inte verifierade. Bibliotek/version och lokal körning är
fastställda för det första importflödet.

Källor kontrollerade 2026-09-28:

- https://github.com/hakanaktt/acadrust
- https://github.com/DomCR/ACadSharp
- https://www.opendesign.com/products/drawings
- https://www.opendesign.com/products/inweb
- https://forge.autodesk.com/developer/overview/realdwg-api

## Verifiering

Geometritester för snitt, toleranser och transformationer; kommandotester för varje steg, Escape och undo; webbläsartester för fokus, koordinatinmatning, markering och inspector. Filtester jämför objekt och egenskaper, inte bara skärmbilder. Kör prestandafallen innan större renderings- eller importändringar godkänns.

En representativ testuppsättning bör omfatta enkel 2D, block/attribut, mått/hatch, stora koordinater, olika fonter, externa referenser och okända objekt. Senare behövs användarens faktiska ritningar för att prioritera stödet och bedöma om appen kan ersätta AutoCAD i just de arbetsflödena.
