# Arkitektur och vidareutveckling

LiraCAD använder JavaScript ES-moduler och Canvas 2D. Dokumentformatet är
versionsmärkt JSON. UI, kommandon och formatadaptrar arbetar med samma objektmodell.
Den här uppdelningen bevarar befintliga filformat och verktygsbeteenden.

## Ansvar och beroenden

| Område | Moduler | Ansvar |
| --- | --- | --- |
| Matematik | `geometry.js` | Koordinatinmatning, vektorer, bågar, snitt och toleranser. Inga importer eller beroenden på dokument/UI. |
| Värden | `values.js` | Kopiering och unika identiteter; inget globalt apptillstånd. |
| Objekt | `entity-transform.js`, `polyline.js`, `blocks.js`, `dimensions.js`, `text.js` | Objekttransformationer, blockdefinitioner, bågsegment och mått. |
| Härledd geometri | `entity-geometry.js`, `spatial-index.js` | Gränser, markering, hit-test, ritpunkter, snappunkter och oföränderligt områdesindex. |
| Redigering | `editing.js`, `offset.js`, `trim-extend.js`, `grips.js` | Geometrioperationer som returnerar resultat utan att ändra dokumentet. |
| Dokument | `document.js` | Validering av projekt, lager, objekt, block och layouter. |
| Transaktioner | `document-session.js`, `document-snapshot.js`, `block-edit-session.js`, `text-edit-session.js`, `history.js` | Godkänt dokument, isolerade utkast/ögonblicksbilder, validering och undo/redo. |
| Kommandon | `editor.js`, `drawing-tools.js`, `transform-tools.js`, `editing-tools.js`, `corner-tools.js`, `vertex-tools.js`, `structure-tools.js`, `dimension-tools.js`, `block-tools.js`, `viewport-tools.js`, `annotation-tools.js`, `utility-tools.js`, `command-catalog.js`, `command-prompts.js` | Verktygsprotokoll, faser, metadata, alias, inmatning och förhandsvisningar. |
| Interaktion | `snapping.js`, `local-snapping.js`, `tracking.js`, `navigation.js` | Exakt snappning, lokal och begränsad geometri-cache, referenspunkter och regler för mus/tangentbord. |
| Presentation | `scene-renderer.js`, `entity-renderer.js`, `text-editor.js`, `inspector-controls.js`, `general-inspector.js`, `appearance-inspector.js`, `attribute-inspector.js`, `entity-inspector.js`, `layout-inspector.js`, `block-inspector.js`, `layer-panel.js`, `toolbar-icons.js` | Scen- och objektmålning, inspector för egenskaper/utseende/attribut/objekt/layout/block, lagerpanel och ikoner. |
| Filflöde | `document-workflow.js` | Bekräftar text/block, skyddar ändringar under asynkron import och samordnar dokumentbyte/sparande/export med injicerade effekter. |
| Filformat | `file-import.js`, `dxf-import.js`, `dxf-export.js`, `dxf-dimensions.js`, `dxf-layout.js`, import-workers | Filinläsning, formatmappning och serialisering. Import ersätter aldrig själv aktivt dokument. |
| Lagring | `project-storage.js`, `document-journal.js`, `indexeddb-project-store.js` | Asynkron återläsning, migrering, debounce, sparordning, återställningslogg och IndexedDB-transaktioner. |
| Projektflikar | `project-workspace.js` | Separata dokumentsessioner, flikordning, aktivt projekt, stängning och återöppning utan att radera sparade projekt. |
| Appskal | `app.js`, `lira-shell.js`, `pwa.js`, `update-ui.js` | Kopplar dokument, UI, fokus, webbläsarhändelser och installation. |
| Inställningar | `settings-panel.js` | Äger inställningsdialogen, status under generering och anropar injicerade navigerings- och dokumentflöden. |
| Exempel | `demo-document.js`, `stress-document.js` | Skapar exempelritning och stora testdokument. Stresstest byggs i omgångar så att webbläsaren kan visa framsteg. Ingår inte i geometri eller validering. |

`core.js` är en kompatibilitetsfasad med återexporter för äldre anrop och tester.
Ingen intern modul importerar den. Nya moduler importerar det ansvariga området
direkt. De egna modulernas beroendegraf är acyklisk och kontrolleras av tester.

Områdesindex byggs när dokumentet eller aktiv ritrymd ändras och återanvänds vid
pekarrörelser. Snap har separata index för punkter och kanter; skärningar söker
bara överlappande kantgränser. Renderingen söker synliga objekt i samma typ av
index och behåller dokumentordningen. `scene-renderer.js` cachar modellvyns
bakgrund, medan förhandsvisningar och snapmarkörer målas separat. Vid navigering
i stora modellritningar återprojiceras den senaste exakta bilden tillfälligt;
appskalet begär exakt omritning när rörelsen har stannat. Dokument, lager,
markering, hover, kamera och canvasstorlek ingår i cachekontrollen. Paperspace
ritas fortfarande direkt. Se [prestandaprovet](performance.md).

## Dokument och transaktioner

`DocumentSession` äger godkänt dokument och historik. `commit(label, change)`
kopierar dokumentet till ett utkast, kör ändringen och validerar resultatet.
Callbacken ändrar utkastet eller returnerar ett ersättningsdokument. Först när
resultatet är giltigt publiceras det och lagras som en historikpost. Utkast eller
ersättningsdata kan inte senare ändra det godkända dokumentet genom kvarvarande
referenser. En misslyckad ändring bevarar dokumentet och redo-historiken.

Nästlade transaktioner och undo/redo under en transaktion avvisas. Oförändrade
resultat skapar ingen historikpost och rensar inte redo. Historiken har
en gräns på 80 poster. Dokumenthistoriken delar rekursivt fryst, ägd geometri
och kopierar metadata och objektarrayer, även vid Ångra/Gör om. `History.commit`
behåller sitt fristående kontrakt med skrivbara kopior för annan data.

Nya objekt går genom `DocumentSession.append`, som validerar hela nästa
dokument men delar oförändrade, rekursivt frysta objekt mellan ögonblicksbilder.
Objekt från indata kopieras innan de accepteras. Varje dokument/historikpost får
egna objektarrayer och kopierad metadata; verktygsutkast för vanlig redigering
är fortsatt skrivbara kopior. `document-snapshot.js` äger denna delning. Tomma
tillägg och avvisad validering bevarar redo och godkänt dokument.

`DocumentSession.replaceEntities` tar en färdig objektlista för flytt, rotation,
radering, grepp och redigeringsverktyg utan nya blockdefinitioner. Oförändrade
ägda objekt återanvänds; nya objekt isoleras och hela dokumentet valideras innan
publicering. Likvärdiga ersättningar skapar ingen historikpost. Metadataändringar
och nya blockdefinitioner använder fortfarande det skrivbara transaktionsutkastet.

Vid tillägg uppdateras områdesträden genom att kopiera enbart berörda grenar.
Snap-cachen invaliderar sökfönstret och behåller oförändrade objekts detaljer;
ny geometri beräknas först när pekaren söker i närheten.
Renderingen kan måla tillägget över bakgrunden när kamera, lager, markering och
övriga cachevillkor är oförändrade. Kopplingen till föregående index är svag så
att cachekontrollen inte behåller alla äldre indexarrayer. `spatial-index.update`
tar bort och sätter in ändrade objekt i beständiga träd och behåller ritordningen.
Stora ändringar bygger ett nytt balanserat träd. Appens snap använder samma
ritindex för att hitta objekt runt pekaren. Ett kompletterande objektträd täcker
bågcentrum, blockinsättning och andra ankare utanför den synliga geometrin.
`local-snapping.js` beräknar detaljer först vid lokal sökning och håller en LRU-cache
på högst 512 objekt och 8 192 punkter/kanter. Ett separat förberett sökfönster har
samma gränser och återanvänds medan pekarens toleransområde ryms inom fönstret.
Mycket breda sökningar kan använda större temporära data men behåller inget
överstort fönster. Tidigare fullständiga snap-index finns kvar som fristående
API och jämförelse i tester, men används inte av appen.
Objektarrayer och rangtabeller uppdateras fortfarande över ritningen; kostnaden
är linjär även vid en liten ändring. Ersättningar invaliderar den målade bakgrunden
så att borttagna objekt inte ligger kvar i bilden.

Appens `commit` är tills vidare en kompatibilitetsadapter för äldre callbacks
som använder `doc`. Den pekar om `doc` till utkastet under callbacken och tillbaka
till sessionens godkända dokument efteråt. Nya callbacks tar utkastet som argument.
Lager och layouter slås upp med ID i utkastet; de ändrar inte objekt som fångats
från en tidigare render. Autosparning och UI-uppdatering sker efter godkänd ändring.

`BlockEditSession` äger blockeditorns livscykel och en egen `DocumentSession`. Huvudritningens dokument och
historik ligger kvar i föräldrasessionen. BSAVE uppdaterar den i en transaktion;
BCANCEL kastar blockutkastet. Sparfel behåller utkastet öppet och huvudritningens
historik oförändrad. Kameran och markeringen återställs först efter accepterad
transaktion. Blockutkast autosparas inte.

## Verktygsprotokoll

Verktyg implementerar `create`, `handle`, `preview` och `describe`. Editorn skickar
punkt/text-händelser till dem och tillämpar deras resultat genom en injicerad
`applyChange`. Verktygen känner inte till DOM, lagring eller apptillstånd.
`getContext` tillhandahåller isolerade kopior av aktuell redigerbar markering
och, för redigeringskommandon, tillgängliga objekt och träff vid rå musposition.
Editorn tillämpar ändringen före fasbytet: en misslyckad transaktion behåller
verktygets inmatning. Objektval som verktyget returnerar tillämpas via
`setSelection` efter godkänd ändring. Verktyg kan också returnera `defaults`;
editorn sparar dem per kommando efter godkänd ändring och skickar en isolerad
kopia till nästa `create`. Avbrytning rensar verktyget men behåller accepterade
standardmått. Preview publicerar aldrig dokumentändringar. Ett verktyg kan även
returnera `effect` för att öppna texteditorn eller fokusera kommandoraden.
Editorn skickar en isolerad kopia till `onEffect` efter accepterad ändring,
markering och fasbyte; verktyget hanterar inte DOM eller fokus självt.

- LINE skapar en transaktion per segment; Enter avslutar.
- CIRCLE och ARC avslutas när geometrin är färdig; felaktig båge behåller punkterna.
- RECTANG kräver två hörn med bredd och höjd.
- PLINE samlar punkter/bulges och sparas som ett objekt vid Enter/C. A/L byter
  segmentläge; U tar bort en bågmellanpunkt eller senaste segmentet. C kräver
  tre hörn och sluter med en rak kant. Relativa koordinater utgår från senaste
  färdiga hörnet, även under bågens mellanpunktsfas.
- MOVE, COPY, ROTATE, SCALE och MIRROR stöder förval och kommando-först med
  objektval och Enter. Aktuell geometri läses vid preview/commit så att
  inspectorändringar behålls. Urvalet ändras i en transaktion. COPY får nya ID;
  övriga transformationer bevarar dem. Lager, färg, linjetyp, blockdata och utrymme
  följer objekten utan nya skapandestandardvärden.

- OFFSET väljer källobjekt, tar ett positivt avstånd eller två mätpunkter och
  skapar kopior på vald sida. Kommandot avslutas efter lyckad kopiering. Ett
  ogiltigt resultat avvisar hela urvalet. Källornas egenskaper bevaras.
- **Trimma / Förläng** startar direkt utan gränsurval. TRIM/TR trimmar den
  klickade delen; Shift förlänger närmaste ände till första skärningen längs
  objektets riktning. EXTEND/EX finns kvar med omvänd grundfunktion. Alla synliga
  linjer, polylinjer, bågar och cirklar i aktivt utrymme används som gränser,
  inklusive låsta lager, blockdelar och referenser. Dolda och frysta objekt
  utesluts. Bara redigerbara objekt kan ändras. Cirklar trimmas till ARC mellan två skärningar. Bågpolylinjer
  trimmas efter båglängd och behåller exakta bulges; förlängning följer ändsegmentets
  linje eller cirkel. Cirklar och slutna polylinjer kan inte förlängas. Preview och klick använder samma geometri och rå musposition.
  Vänster musknapp startar ett tillfälligt svep; analytiska skärningar längs varje
  musförflyttning fångar även objekt mellan pointer-event. Varje ursprungligt objekt
  ändras högst en gång mot gränserna från svepets början. Alla ersättningar visas
  tillfälligt och publiceras i en transaktion vid pointerup. Esc, pointercancel,
  lostpointercapture och fönsterblur kastar förhandsvisningen. Ett ångra återställer
  hela svepet. Enter/Esc avslutar verktyget. Shift uppdaterar
  förhandsvisning och prompt direkt, och återställs när fönstret tappar fokus.

- FILLET/CHAMFER tar radie respektive ett/två fasavstånd. Två förvalda linjer
  bearbetas direkt efter måttinmatning; annars väljs två linjer med klick på
  sidorna som ska behållas. Aktuell redigerbar geometri används vid preview och
  commit. Uppdaterade linjer och eventuell båge/fas sparas i samma transaktion.
- PINSERT/PDELETE kräver exakt en polylinje och stöder förval eller objektval
  med Enter. Ett klick eller en koordinat lägger till/tar bort ett hörn och
  avslutar. Geometriregler skyddar minsta antal hörn, dubbla punkter och
  bågsegment; fel behåller inmatningsfasen.

- JOIN/EXPLODE bekräftar aktuellt redigerbart urval med Enter. Appen bekräftar
  direkt om det finns förvalda objekt. Sammanfogning respektive alla delar av
  polylinjer, block och mått sparas i en transaktion. Ogiltigt blandat urval
  avvisas helt. Blockattribut blir vanlig text med instansens värden; nya
  delobjekt får egna ID. JOIN bevarar även första objektets linjetyp.

ROTATE tar grader eller klickad riktning. SCALE tar positiv faktor eller
avstånd från baspunkten dividerat med 1000; preview har minimifaktor 0,001.
MIRROR kräver två olika axelpunkter. Viewports kan flyttas/skalas, men ett urval
med viewport kan inte roteras/speglas, även i preview. Escape/kommandobyte
kastar ofärdiga förhandsvisningar. Snappning använder originalgeometri.

Måttkommandona DIMLINEAR, DIMALIGNED, DIMANGULAR, DIMRADIUS, DIMDIAMETER och
DIMCONTINUE ligger i `dimension-tools.js`. Verktygen tar skapandestandarder,
valbara objekt och träffpunkt som kontext. Måttkedjor placeras i en transaktion;
fortsättning ersätter måttet med bibehållet ID och en historikpost per ny punkt.
Byt/Välj och relativa koordinater använder verktygets egna faser och baspunkt.
Förval av cirkel/båge och måttkedja bevaras när kommandot startar. Misslyckad
transaktion avancerar inte verktyget eller markeringen.

BLOCK, INSERT och ATTDEF använder `block-tools.js`. Blockskapande ersätter
urvalet och registrerar definitionen i samma transaktion. Namnets unikhet
kontrolleras även vid slutlig placering. Infogning slår upp aktuell definition
via ID före preview/sparande; saknad definition behåller verktygsinmatningen.
ATTDEF validerar texturval, tagg och enradig text före ersättning.
MVIEW använder `viewport-tools.js`: appen väljer papperskontext, verktyget äger
hörninmatning, preview och ett färdigt låst viewportobjekt.

`TextEditSession` äger textutkastet och publicerar en ersättning eller ett nytt
objekt genom en injicerad transaktion. `text-editor.js` äger popupens position,
stil, typsnitt och tangentbordshantering. Sparfel eller flerradiga attribut
behåller utkastet öppet; kommandostart, byte av ritläge och blockavslut avbryts
om texten inte kunde accepteras. Avbryt och tom text ger ingen historikpost.

TEXT, LEADER och HATCH ligger i `annotation-tools.js`. TEXT avslutar kommandot
och öppnar ett isolerat textutkast; själva texten sparas först i textsessionen.
LEADER samlar tre punkter, fokuserar kommandoraden för text och sparar ett objekt.
HATCH samlar minst tre hörn och avslutas med Enter/C. Skapandestandarder hämtas
ur aktuell modell-/papperskontext och används även för hänvisningens preview.
Sparfel behåller textfasen eller alla skrafferingshörn för ett nytt försök.

DIST, PAN och ERASE ligger i `utility-tools.js`. DIST accepterar klickade,
relativa och polära punkter och visar avstånd/ΔX/ΔY utan dokumenttransaktion.
PAN äger kommandoläget och avslutningen; appens navigation äger musdrag och kamera.
ERASE stödjer förval och kommando-först och tar bort hela urvalet i en transaktion.
Alla interaktiva kommandon i katalogen har en unik verktygsägare, med undantag
för BEDIT som öppnar en blocksession. Detta kontrolleras av arkitekturtesterna.

## Presentation och fortsatt uppdelning

`scene-renderer.js` målar en synkron bildruta från injicerade dokument-, kamera-
och interaktionsdata. Den äger sin tillfälliga kamerakontext för viewports och
ändrar varken appens kamera eller dokumentet. Appen förbereder verktygs- och
greppförhandsvisningar. Renderaren äger rutnät, synlighetsfiltrering, klippning,
objektmålning och overlays för markering, grepp, spårning, snappning och markör.
Den har inga DOM- eller lagringsberoenden. Zoomtext och renderingsschemaläggning
ligger kvar i appskalet. `viewportClip` delas med interaktionens klippkontroll.

Layout- och blockpanelerna använder injicerade dokumentläsare och callbacks.
Layoutfälten fångar ett ID och slår upp objektet i transaktionsutkastet, även om
fältets callback kommer från en tidigare render. Formatändring och borttagning
utför navigeringssteget först efter lyckad transaktion. Blockpanelerna visar
utkastets namn/baspunkt och instansens attribut; sessionens spara/avbryt-livscykel
ägs av `BlockEditSession`; appen återställer vy, fokus och markering.

`app.js` är fortfarande integrationsmodulen för kamera, markering, fokusregler,
och kopplingen till dokument-, block- och textsessioner.
Inspectorfälten ligger i egna presentationsmoduler; appen väljer panel och
hanterar skapandestandarder. Kommandonas inmatning, faser och preview går genom
editorn; fokus och sessionöppning är injicerade effekter. Nya verktyg följer
samma gränser och regressionstester. Modulerna ska inte få beroenden på appens
globala tillstånd.

Mät stora dokument före nytt rumsligt index, förändringsbaserad historik eller
ny rendering. Återställningspunkter och lagring av historik är framtida
lagringsarbete. Ingen av dessa omskrivningar krävs för att lägga till en
avgränsad funktion i rätt modul.

## Lokal autosparning

`IndexedDBProjectStore` äger databasen `liracad-projects` och en konfigurerbar post
i objektlagret `drafts`. Den befintliga ritningen behåller nyckeln `current`;
nya projekt får `project-<uuid>`. Data lagras som strukturerade dokument med en separat
lagringsversion och ett unikt checkpoint-ID; äldre råa dokument kan läsas. En skrivning
är klar först vid transaktionens `complete`; avbrott, kvotfel och blockerad
öppning avvisas. Öppna anslutningar stängs vid versionsbyte.

`ProjectStorage` migrerar ett giltigt `liracad-v1` från localStorage enbart om
IndexedDB saknar utkast. Den gamla kopian tas bort först efter bekräftad
transaktion. Misslyckad migrering behåller och öppnar det äldre utkastet;
oläsbart utkast pausar autosparning så att exempelritningen inte skriver över
data. Appen väntar på återläsning innan redigering aktiveras.

`ProjectWorkspace` ger varje projekt en egen `DocumentSession` och
`ProjectStorage`, inklusive separat återställningslogg. Flikraden ligger ovanför
canvasen; nytt projekt, filöppning och generering öppnar en ny flik. Flikbyte
avslutar accepterad text och avbryter pågående ritkommando, medan aktiv
blockredigering måste sparas eller avbrytas först. Autosparningens dokumentgetter
och kvittens binds till projektet, så att ett senare flikbyte inte ändrar vilken
ritning som sparas eller uppdaterar fel projekts sparstatus.

Aktivt lager, markering, modell/layout och kameror hålls per projekt. En liten
`liracad-workspace-v1` i localStorage lagrar flikordning, aktiv flik, kameravy och
stängda projekt för nästa start; stora markeringslistor serialiseras inte där.
Nya flikar registreras först efter bekräftad initial dokumentlagring. Stängning
kräver lyckad dokumentsparning och lagring av fliklistan, och frigör sessionen
utan att radera dokumentposten. Återöppning och omladdning skapar ny historik;
Ångra/Gör om bevaras under vanliga flikbyten. Endast aktivt projekt har scen-
och snapindex i appen; dessa byggs om vid flikbyte.

Autosparning använder debounce och revisionsnummer så att äldre kvittenser
inte visar ett nyare, ännu osparat dokument som sparat. Adaptern registrerar
IndexedDB-transaktioner i anropsordning, även när föregående skrivning pågår.
Sidstängning och dold sida tömmer väntande autosparning direkt. En redan öppen
anslutning används synkront vid sidstängning för att inte förlora sista ändringen
i en senare promise-fortsättning. Godkända ändringar har dessutom en synkron
återställningslogg i localStorage, kopplad till databasens checkpoint.
`document-journal.js` beräknar små poster för ändrade/raderade objekt, placering
i objektordningen och dokumentmetadata. Oförändrad geometri utelämnas; en längsta
stigande följd minimerar flyttposter vid omordning. Ångra/Gör om behandlas som
andra dokumentändringar. Äldre tilläggsloggar kan fortfarande återställas.
Vid omladdning återspelas endast osparade poster från rätt checkpoint, utan
dubletter. Varje resultat valideras och hela kedjan måste vara giltig innan
återställningen skriver till databasen. Loggen tas bort först efter bekräftad
skrivning. Om återställningen
inte kan sparas öppnas den giltiga återställda ritningen och loggen behålls.
Viewportens kamerauppdatering publicerar också en ny ögonblicksbild så att loggen
kan jämföra före/efter. Vid kvot- eller åtkomstfel behålls den tidigare loggen;
toppraden uppmanar att invänta autosparning. Mycket stora ändringsposter kan
överskrida localStorage-kvoten och kräver bekräftad IndexedDB-sparning före
omladdning. Blockutkast loggas inte.
Appuppdatering väntar på bekräftad sparning
och hindrar redigering medan den sparningen pågår. Blockutkast autosparas inte.

Toppraden visar sparstatus och ett förklarande fel vid misslyckande. Vid
oläsbart utkast eller otillgänglig lagring kan fortsatt arbete sparas till fil.
Se [lagringsprovet](storage.md) för genomförda kontroller.

Filoperationer går genom `document-workflow.js`. Spara och export bekräftar
textutkast explicit; öppna/ersätta stoppas vid nekad text eller aktiv blocksession.
En långsam import kontrollerar dokumentets identitet och nya pågående utkast
innan den accepteras. Appen återställer modelläge och kamerakontext först efter
godkänd ersättning. Det sammansatta filflödet och dess felvägar testas i
`document-workflow.test.mjs`. Se [stabilitetskontrollen](stability.md) för genomförda
kontroller och begränsningar.

## Arbetsregler och kontroll

1. Lägg matematik i geometri, objektregler i objektmodulen och UI i presentation.
2. Alla accepterade dokumentändringar går genom en transaktion. Preview och
   markörrörelser gör aldrig historikposter eller autosparningar.
3. Import/export är adaptrar. Bevara riktiga objekttyper i modellen och rapportera
   förenklingar. Renderingsgeometri är härledd data.
4. Använd ID för mutationer efter UI-händelser. Behåll inte renderade objektreferenser
   som skrivbara dokumentobjekt.
5. Ändra inte filformat, kommandobeteende och rendering samtidigt utan behov.
6. Lägg till ett beteendetest för nya regler eller felrättningar. Arkitekturtesterna
   skyddar mot cirkulära beroenden och importer av kompatibilitetsfasaden.

Kör `npm run build` och `npm run check`. Check syntaxkontrollerar alla egna
src-moduler, workers, byggskript och servern samt kör alla tester. Bygget tar
automatiskt med nya src-moduler i release och offlinecache. Node.js 22 eller
senare krävs; inga npm-paket behöver installeras för appen.
