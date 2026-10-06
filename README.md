# LiraCAD Web 0.1

Första interaktiva utgåvan för att prova CAD-känslan. Kör lokalt på http://127.0.0.1:5174.

## Starta

Med Node.js installerat:

```sh
npm start
```

På den här datorn finns också `Starta LiraCAD.command`, som använder Codex medföljande Node om Node saknas i PATH. Ingen installation av npm-paket behövs.

## Prova

- Öppna **Inställningar** i toppraden för att generera en exempelritning eller ett stresstest med 1 000, 10 000 eller 100 000 objekt. Välj blandade objekt eller enbart linjer. Genereringen ersätter ritningen och kan återställas med `U`/Ångra under samma session. Där finns också valet av navigeringsenhet.
- För reproducerbara utvecklarprov, öppna `/tests/performance/` på den lokala servern. Se [mätresultat och kvarvarande begränsningar](docs/performance.md).
- Exempelritningen innehåller alla objekttyper. Klicka på ett objekt för att markera det. Dra en markeringsruta eller klicka på en tom plats och sedan på rutans motsatta hörn. Vänster till höger väljer helt inneslutna objekt; höger till vänster väljer också korsade objekt. Esc avbryter rutan. Shift lägger till/tar bort ur markeringen.
- Skriv `L`, Enter, `0,0`, Enter, `1000,0`, Enter, Enter. En linje skapas med exakt längd.
- Markera linjen, skriv `M`, Enter, välj baspunkt och målpunkt. `@500,0` anger en relativ förflyttning.
- Ändra koordinater i högerpanelen. Enter eller att lämna fältet bekräftar. Escape återställer fältinmatning som inte bekräftats.
- Välj Styrplatta eller Mus i statusraden. Styrplatta: två fingrar panorerar, nyp zoomar kring pekaren. Mus: mushjulet zoomar. Håll mittenknappen eller Space och dra för panorering i båda lägena. `Z` + Enter visar allt.
- OSNAP erbjuder ändpunkt, mittpunkt, centrum, kvadranter och skärningar mellan linjer/cirklar/bågar. Markerade originalobjekt är tillgängliga för snappning i alla redigeringskommandon, både vid baspunkt och målpunkt. Förhandsvisningen är inte snappbar. F3 växlar OSNAP.
- POLAR (F10) styr mot 15°, 30°, 45° eller 90° från senaste punkt/baspunkt. Exakta objektsnapp prioriteras. ORTHO (F8) låser till horisontellt/vertikalt; Ortho och Polar är ömsesidigt uteslutande.
- TRACK (F11): stanna cirka 0,4 sekunder över en snappunkt tills ”referens fångad” visas. Flytta sedan pekaren för horisontell/vertikal spårning från punkten. Upp till två referenser kan fångas, inklusive skärningen mellan deras spårlinjer. Track kräver OSNAP. En referens släpps efter 1,2 sekunder utan kontakt med dess punkt eller aktiva hjälplinje. Varje referens har en egen tidsgräns; hjälplinjekontakt håller bara berörda referenser kvar. Escape/nytt kommando rensar referenser. Spårningslinjer är streckade och den fångade punkten markeras med ett plus. Tangent- och vinkelrät objektsnapp ingår ännu inte.
- Kommandoraden har alias, Tab-komplettering och inmatningshistorik med pil upp/ned. Mellanslag och Enter bekräftar inmatning i kommandoraden och upprepar senaste kommando när raden är tom. Vid inmatning av själva texten till Text/Leader fungerar mellanslag som vanligt och Enter bekräftar. Ett kort Space i ritytan bekräftar också. Escape avbryter.

## Verktyg

| Alias        | Funktion                                                        |
| ------------ | --------------------------------------------------------------- |
| L / PL / REC | Linje, polylinje, rektangel                                     |
| C / A        | Cirkel med centrum/radie, båge genom tre punkter                |
| T            | Text med insättningspunkt; höjd och rotation ändras i inspector |
| LE           | Leader med pilspets, brytpunkt, textplacering och text          |
| HA           | Hatch från polygonhörn; Enter sluter, minst tre hörn            |
| M / CO       | Flytta / kopiera                                                |
| RO / SC / MI | Rotera / skala / spegla                                         |
| O            | Offset av en linje eller cirkel; avstånd och sida               |
| E / Delete   | Radera                                                          |
| DI           | Mät avstånd                                                     |
| U / REDO     | Ångra / gör om                                                  |

Flytta, kopiera, rotera, skala och spegla fungerar för flerval. Spegla ersätter valda objekt. Skala använder positiv faktor; vid musinmatning motsvarar 1 000 mm från baspunkten faktor 1. Grips finns på linjer, polylinjer, hatch, leader, cirklar och text. Trim och Extend finns för linjer, bågar och raka polylinjer. Fillet och Chamfer stöder två raka linjer.

## Filer

- **Spara projekt** laddar ned en `.liracad`-fil; **Öppna projekt** läser tillbaka den.
- Dokumentet autosparas i webbläsarens IndexedDB. Befintliga lokala utkast migreras automatiskt och tas bort ur den äldre lagringen först när flytten har sparats. Toppraden visar när sparningen är klar eller har misslyckats. Spara till fil för en separat säkerhetskopia. Ångrahistoriken bevaras under sessionen, inte efter omladdning.
- **Exportera DXF** skriver DXF R2007 (UTF-8) med millimeter, lager/färger och native LINE, LWPOLYLINE, CIRCLE, ARC, TEXT, MTEXT, LEADER och HATCH. Leaderns text skrivs som separat TEXT/MTEXT, utan associativ koppling.
- **DWG- och ASCII DXF-import finns i en första version.** Se importstöd och begränsningar nedan.
- Ny ritning, exempelritning och öppnat projekt går att ångra under samma session.

## Teknik och begränsningar

Modulär JavaScript utan byggberoenden. Ren geometri, objektoperationer, dokumentvalidering, transaktioner, kommandon, presentation och filformat har egna moduler. `src/core.js` är en kompatibilitetsfasad. `src/app.js` kopplar ihop modulerna och innehåller ännu viss interaktion/UI. Se [arkitekturen](docs/architecture.md) för ansvar och regler för vidareutveckling. Denna första utgåva använder Canvas 2D och omritning vid ändringar via requestAnimationFrame. Stora produktionsritningar är ännu inte prestandaverifierade; nästa rendering/indexering väljs efter mätningar. Historiken sparar dokumentkopior, begränsade till 80 transaktioner, och behöver effektiviseras för stora filer.

Desktop med mus/tangentbord är målplattform. Hatch stöder polygoner, hål och importerade linjemönster med flera riktningar och streck/gap. Textmått använder samma layout som visningen (approximation utan tillgängliga originaltypsnitt). SHX-tolkning, AutoCADs dynamiska blockfunktioner och generell 3D ingår inte. LiraCAD har egna stretchparametrar för block, se nedan. Måttobjekt och paperspace finns nu, med begränsningar nedan.

## Kontroll

```sh
npm run build
npm run check
```

Kontrollen syntaxgranskar alla egna moduler, workers och skript. Arkitekturtester förhindrar cirkulära beroenden; transaktionstester verifierar validering, återställning och historik. Geometritester täcker koordinater, bågar vid stora koordinater, transformationer, offset, markering, historik och projektvalidering. Under utvecklingen verifierades kommandoflöden och egenskapsredigering i webbläsaren. Exempelritningens DXF lästes med ezdxf: 47 entiteter, korrekt millimeterenhet, inga auditfel eller reparationer. Detta är ingen full kompatibilitetscertifiering mot AutoCAD.

Ritytan har inga fasta överlägg. Rutnät är avstängt som standard och kan väljas i verktygsfältet. Kommandovägledning och snapstatus visas vid kommandoraden; objekträknaren finns i inspectorn. Tillfälliga grips, snapmarkörer, förhandsvisningar och hjälplinjer visas bara under arbete.

## Direkt textredigering och MTEXT

Dubbelklicka på ett Text-objekt eller en Leader för att öppna texteditorn på ritytan. TEXT/T och MTEXT/MT öppnar samma editor efter vald insättningspunkt. Enter ger ny rad; Ctrl/⌘+Enter eller Klar sparar hela ändringen som ett ångringssteg. Escape/Avbryt återställer. Klick utanför editorn bekräftar ändringen. Inspectorn visar texthöjd, typsnitt och blockformatering. Textinnehållet redigeras på canvasen.

Fetstil, kursiv, understrykning och Arial/Georgia/Courier New gäller hela blocket. Importerad MTEXT bevarar grundläggande formatering per spann, färger, spaltbredd, radbrytning, radavstånd och nio fästpunkter. Texteditorn ändrar formatering för hela blocket; ändrat textinnehåll ersätter spannformateringen. Tabeller, flera spalter, avancerade stycken och staplade bråk förenklas fortfarande. Editorn visas horisontellt under redigering; objektets rotation bevaras i ritningen.

Texteditorn och egenskapspanelen har vänster/centrerad/höger justering,
lodrät fästpunkt och rotation,
radavstånd med Minst/Exakt, teckenavstånd, breddfaktor och textbredd för automatisk
radbrytning (0 = ingen begränsning). Radavstånd 1× betyder CAD-standard, cirka
1,67 gånger texthöjden; intervallet är 0,25–4×. Teckenavstånd 1× är normalt,
0,75× tätare och upp till 4× glesare. Breddfaktorn ändrar själva tecknens bredd.
Vänster/centrerad/höger ändrar både fästpunktens horisontella justering och
radjusteringen. Övriga spannfärger och stilar bevaras när avstånd ändras.
Justeringarna följer med i projektfiler och MTEXT-export. Native ATTRIB/ATTDEF
saknar MTEXT-teckenavstånd; för sådan export bevaras teckenavstånd bara i projektfilen.

Textinnehåll och formatering förhandsvisas direkt på ritytan medan editorn är
öppen. Förhandsvisningen ersätter originalet tillfälligt och ändrar inte
projektet eller ångringshistoriken. Klar sparar allt som ett steg; Avbryt
återställer originalet. Editorn placeras bredvid texten när det finns plats.
Markerad vanlig text har ett grepp på insättningspunkten och ett på textbredden;
breddgreppet följer rotation, spegling och vänster/centrerad/höger fästpunkt.

Dubbelklicka på ett synligt attribut inne i en namnruta, eller markera blocket
och välj **Textutseende · attributnamn**, för att ändra dess text och formatering.
Små attribut får automatiskt en närmare vy av namnrutan vid redigering utanför
en aktiv modellviewport. Texteditorn placeras bredvid namnrutan när det finns plats.
Ändringen sparas som ett attributundantag för just den blockinstansen. Andra
namnrutor och blockdefinitionen behåller sitt utseende. Tomma attributvärden kan
sparas; attribut behöver fortfarande en enda textrad. Typsnitt, texthöjd,
breddfaktor och justering följer med i ATTRIB-export.

Enkel oformaterad rad exporteras som TEXT. Flerradig eller formaterad text exporteras som MTEXT med styckebrytningar och DXF-formateringskoder. Exporten använder UTF-8 för svenska tecken. MTEXT-formatet beskrivs i [Autodesks DXF-referens](https://help.autodesk.com/cloudhelp/2023/ENU/AutoCAD-DXF/files/GUID-5E5DB93B-F8D3-4433-ADF7-E92E250D2BAB.htm).

## Polylinjer och hörn

- `O`: offset av öppna/slutna polylinjer med raka segment, samt linjer, cirklar och bågar. Ange avstånd eller mät mellan två punkter och välj sedan sida. Konturer som kollapsar eller korsar sig avvisas.
- `J`: sammanfoga valda linjer/öppna polylinjer med sammanfallande ändpunkter (tolerans 0,000001 mm). Gemensam kedja krävs. Resultatet får första objektets lager och färg.
- `X`: dela upp polylinjer i linjer, eller mått i sina ritdelar.
- `PI` / `PD`: välj polylinje, klicka för att lägga till respektive ta bort ett hörn. Nya hörn infogas i det närmaste segmentet.
- `F`: välj två linjer före start, ange radie. Alternativt starta, ange radie och välj två linjer på sidorna som ska behållas. Radie 0 ger skarpt hörn. Förhandsvisning vid val av andra linjen.
- `CHA`: motsvarande fasning. Ett avstånd ger lika sidor; `100,200` ger olika avstånd. För stora mått och parallella linjer avvisas.

Polylinjer med bågsegment/bulges stöds; se beskrivningen nedan. Fillet/Chamfer direkt på polylinjehörn ingår ännu inte. Dela upp en polylinje med X för att använda hörnverktygen på dess raka linjer.

## Måttsättning

Arkinspectorn har A1–A4, utskriftsfärg (färg/svartvitt för SVG) och
`Återställ tomma vyer`. Funktionen ger endast tomma vyer en modellöversikt med
en standardiserad skala som rymmer modellen, i ett ångringssteg. Den återskapar
inte originalets detaljutsnitt och ändrar inte skaltexter/skalstockar på arket.
Viewportinspectorn har standardskalor, fri skala, rotation och modellcentrum.
SVG-exportens linjetjocklekar anges i fysiska mm oberoende av viewportskalan.
Lagrets DXF-flagga för utskrift bevaras och kan ändras med `Skriv ut` i lagerpanelen.
Lager som inte skrivs ut är fortfarande synliga för redigering; en viewport på
ett sådant lager visar fortfarande sitt modellinnehåll i exporten.
Svartvitt sparas i projektet och används i SVG; DXF-export skapar ingen CTB-fil.

`DLI` linjärt, `DAL` riktat, `DAN` vinkel, `DRA` radie och `DDI` diameter finns också som knappar under Måttsätt. För DLI/DAL klickar du två eller fler mätpunkter, trycker Enter och placerar sedan hela måttlinjen. Kedjan sparas som ett objekt: val, flytt, rotation, skala och stil gäller hela kedjan. Greppet på måttlinjen flyttar dess placering; mätpunkternas grepp ändrar angränsande delmått. DAL använder de två första punkterna för kedjans gemensamma riktning. Vinkelmått använder spets, två riktningspunkter och placering. Radie/diameter använder en vald cirkel/båge och textplacering. DLI väljer horisontell/vertikal riktning efter placeringen.

Mått sparas som egna redigerbara projektobjekt med greppunkter, texthöjd, precision och, för enskilda mått, valfri textöverskrivning. Måttet räknas om när dess grepp ändras. **Mått är inte associativt kopplade till andra objekts geometri. DXF-exporten skriver native DIMENSION med måttstil och visningsblock.**

## Layout och viewports

Välj **+ Layout** för A3, byt A3/A4 och orientering i inspectorn. Layouter kan döpas om och tas bort (ångra stöds). **+ Viewport / MV** skapar en rektangulär modellvy med två hörn. Markera ramen för att ändra skala, låsa vyn eller aktivera den. Flera viewports och layouter stöds.

**Anpassa vy till modell** i den markerade viewportens egenskaper passar in
synlig modellgeometri med en liten marginal. Pappersram och vyrotation behålls;
vycentrum och skala ändras som ett ångrbart steg. Detta visar tillgänglig geometri
när en importerad vy är tom, men återskapar inte ett okänt originalutsnitt.

Samma rit- och redigeringskommandon fungerar i Model och på papper. I papper är en enhet en millimeter på arket; inne i en aktiverad viewport är det modellens millimeter. Dubbelklicka inuti viewporten eller välj Aktivera modellvy för modellredigering. **Till papper** eller `PSPACE` återgår till arket. `MODEL` växlar till modellfliken. Låst vy blockerar panorering/zoom men inte redigering. Lås upp för att ändra vycentrum och skala med mus/styrplatta. Viewportramar kan flyttas, skalas och ändras med grips, men är alltid rektangulära och kan inte roteras/speglas.

Projektfil/autosparning bevarar papper, skala, låsning, modellvy och objektens utrymme. DXF-export skriver LAYOUT, pappersblock och native VIEWPORT. Även sekundära layouter bevaras. **Exportera ark** ger en SVG med fysiska millimetermått och klippta modellvyer; viewportramar skrivs inte ut. Ingen PDF-skrivardialog är integrerad ännu. Snap mot modellgeometri görs inne i aktiv viewport, inte från pappersläget genom en inaktiv viewport. Modellens lager delas av alla vyer; importerade frysta lager respekteras per viewport.

Referenser för export: [LAYOUT](https://help.autodesk.com/cloudhelp/2018/ENU/AutoCAD-DXF/files/GUID-433D25BF-655D-4697-834E-C666EDFD956D.htm) och [VIEWPORT](https://help.autodesk.com/cloudhelp/2016/ENU/AutoCAD-DXF/files/GUID-2602B0FB-02E4-4B9A-B03C-B1D904753D34.htm).

Kedjemått: markera en måttkedja eller ett äldre linjärt/riktat mått och starta `DCO` / `DIMCONTINUE` (Kedjemått under Måttsätt). Utan förval klickar du på måttet. Klicka sedan ytterligare mätpunkter. Punkter mellan befintliga punkter delar ett delmått; punkter utanför förlänger kedjan. Samma objekt uppdateras med bibehållen måttlinje och stil. B byter ändpunkt för relativ koordinatinmatning, V väljer ett annat mått, Enter avslutar. Varje tillagd punkt kan ångras separat. Äldre mått omvandlas till en kedja när en punkt läggs till; textöverskrivningar tas då bort.

## Trimma och förläng

TR / TRIM och EX / EXTEND finns under Redigera. Välj gränser och tryck Enter (utan val används alla lämpliga objekt i aktuellt utrymme). Klicka delen som ska bort för TRIM, eller nära änden som ska förlängas för EXTEND. Förhandsvisning visar resultatet; fortsätt klicka och avsluta med Enter/Escape. Varje klick kan ångras. Linjer, bågar och raka polylinjer stöds som mål; cirklar fungerar också som gränser. Slutna polylinjer öppnas vid trimning och kan inte förlängas. Gränser måste verkligen skära målet eller dess förlängning; ingen imaginär förlängning av gränserna används.


## Git, säkerhetskopiering och automatisk publicering

Webbapp: https://andreassvensson87-dev.github.io/LiraCadWeb/
Källkod: https://github.com/andreassvensson87-dev/LiraCadWeb

Projektets källkod ligger direkt i arkivets rot. Git-historiken bevarar tidigare
releasefiler och kodbackuper. `dist/`, `node_modules`, lokala skärmbilder och
`.env`-filer ingår inte i Git.

### Arbeta och publicera

```sh
git status
git add <filer-som-du-vill-spara>
git commit -m "Beskriv ändringen"
git push
```

Push till `main` sparar koden på GitHub och startar `.github/workflows/deploy.yml`.
GitHub Actions testar och bygger appen, och publicerar enbart `dist/` via GitHub
Pages. Pull requests kontrolleras utan publicering. Om kontrollerna misslyckas
ligger den tidigare publicerade versionen kvar. Följ körningen under **Actions**.
GitHub Pages använder **GitHub Actions** som källa, inte en mapp i `main`.

### Återställ på en ny dator

Installera Git och Node.js 22 eller senare (inklusive npm):

```sh
git clone https://github.com/andreassvensson87-dev/LiraCadWeb.git
cd LiraCadWeb
npm run build
npm run check
npm run dev
```

Ingen separat ZIP-backup eller manuell uppladdning behövs längre. Lokala ändringar
är dock inte säkerhetskopierade förrän de har committats och pushats.
Modeller, ritningar och bibliotek i webbläsarens lagring ingår inte i kodbackupen.

### Installerbar webbapp

Manifest, ikoner och offlinecache ingår i produktionsbygget. Appadressen och
installationen behålls. Offline fungerar efter första lyckade cacheinstallationen.
Webbläsarens lagring kan rensas och ersätter inte projektbackuper.

Installerad LiraCAD i Microsoft Edge eller Google Chrome registrerar stöd för
`.dwg` och `.dxf` i Windows. Installera den aktuella versionen från appens vanliga
adress. Välj sedan LiraCAD för varje filtyp under **Inställningar → Appar →
Standardappar**, eller via filens **Öppna med** och välj att alltid använda appen.
Windows bestämmer standardvalet; webbappen ändrar det inte automatiskt.
Dubbelklick öppnar filen lokalt i en ny projektflik, även när appen redan körs.
Flera filer köas. Under blockredigering bevaras filerna tills **Öppna väntande
filer** används efter avslutad redigering. Befintliga projekt finns kvar.
Instruktionerna finns också under appens **Inställningar**.

Filassociationerna kräver en installerad app i en webbläsare som stöder File
Handling API. En vanlig webbläsarflik registreras inte som Windows-standardapp.
Stödet och kön är testade med simulerade kalla/varma OS-starter i Chromium;
Windows Utforskarens riktiga standardappsval måste verifieras på Windows.
[Microsofts dokumentation](https://learn.microsoft.com/en-us/microsoft-edge/progressive-web-apps/how-to/handle-files).

## Block, attribut och bågpolylinjer

- Blockverktygen finns i kategorin **Block**, med grupperna **Skapa & infoga**, **Redigera block** och **Exportera**. Rita, Ändra och Mått har också underrubriker och knappar med ikon och text.
- **BLOCK / B:** markera objekt, ange ett unikt blocknamn och välj baspunkt. **INSERT / I:** ange blocknamnet och välj insättningspunkt. Knappar finns under Block. Definitionerna bevaras i projektet även om sista instansen raderas. Kopiera, flytta, rotera, skala, spegla, snap och insättningsgrepp fungerar. **X / EXPLODE** delar upp blocket igen.
- Markerade block har dessutom ett flyttgrepp vid geometrins mitt, så även importerade block med en avlägsen insättningspunkt kan flyttas med grepp i vyn. Greppet flyttar hela instansen; definition och stretchvärden behålls.
- **ATTDEF / ATT:** markera en enkelradig text och ange ett attributnamn (A–Z, 0–9, _). Ta med texten när blocket skapas. Varje infogat block har egna värden som ändras i inspektorn. Nya instanser får definitionens standardvärden. BEDIT finns; se blockeditorn nedan. Nästlade block, AutoCADs dynamiska blockfunktioner och multiline-attribut ingår inte i denna första version.
- **PL / PLINE:** välj startpunkt och fortsätt med raka segment. **A** växlar till båge via en mellanpunkt och en slutpunkt. **L** återgår till linje, **U** ångrar senaste segment/mellanpunkt, **C** sluter med en rak kant och Enter avslutar. Bågens mittgrepp ändrar krökningen. JOIN kan sammanfoga linjer, bågar och öppna polylinjer; EXPLODE ger tillbaka linjer och bågar. Bågsegment lagras som DXF-bulge, inte som korta raka linjer.
- OFFSET, TRIM/EXTEND och lägg till/ta bort hörn stöder ännu inte bågpolylinjer som redigeringsmål; kommandot säger till. Dela upp med X först. Bågpolylinjer fungerar som trimgränser.
- DXF-export skriver BLOCK/INSERT, ATTDEF/ATTRIB, LWPOLYLINE med bulge och riktiga DIMENSION-objekt med DIMSTYLE och anonyma visningsblock. Måttkedjor blir separata redigerbara delmått i DXF. Måtten är ännu inte associativt kopplade till den måttsatta geometrin. Export har kontrollerats med ezdxf; öppning/regenerering i AutoCAD behöver också provas med riktiga filer.

DXF-referenser: [INSERT](https://help.autodesk.com/cloudhelp/2021/ENU/AutoCAD-DXF/files/GUID-28FA4CFB-9D5E-4880-9F11-36C97578252F.htm), [LWPOLYLINE](https://help.autodesk.com/cloudhelp/2015/ENU/AutoCAD-DXF/files/GUID-748FC305-F3F2-4F74-825A-61F04D757A50.htm), [DIMENSION](https://help.autodesk.com/cloudhelp/2023/ENU/AutoCAD-DXF/files/GUID-239A1BDD-7459-4BB9-8DD7-08EC79BF1EB0.htm).

### WBLOCK · separata mallfiler
`WBLOCK` (`WB`) eller **Exportera mall** under Block skriver en separat
DXF-fil via en dialog med källa, baspunkt, originalobjekt och sparplats.

- **Valda objekt:** använd markeringen eller klicka **Välj objekt i modellen**,
  markera och tryck Enter för att återgå till dialogen.
- **Baspunkt:** ange X/Y eller klicka **Välj baspunkt i modellen** och välj
  punkten i ritytan med snäppning. Punkten blir mallfilens 0,0. Esc återgår
  till dialogen; vid punktval behålls den tidigare baspunkten.
- **Blockdefinition:** välj ett befintligt block i listan. Definitionens eget
  origo används, även om inga instanser finns kvar. **Hela modellen** tar med
  alla modellobjekt, utan layouter och viewport-ramar.
- **Efter export:** behåll originalobjekten (standard), omvandla till ett
  namngivet block eller ta bort dem. Ändringar sker först efter lyckad export
  och går att ångra. Blockkonvertering stöder inte nästlade block.
- **Fil och sparplats:** ange filnamn och välj mapp i den vanliga Spara som-rutan
  i webbläsare med stöd för filväljaren, exempelvis Edge/Chrome på Windows.
  Annars används webbläsarens nedladdningshantering. Avbrutet eller misslyckat
  sparande lämnar dialogen öppen och originalobjekten orörda.

Exporten innehåller bara valda objekt och deras nödvändiga lager, med lager 0
som blockens fallback. Geometrin hamnar i modellutrymmet, enheten är millimeter
och insättningsbasen är 0,0. Viewport-ramar exporteras inte med WBLOCK.
En vald blockinstans behåller aktuell längd, rotation, skala, spegling och
attributvärden. Blockdefinitionens attribut exporteras som ATTDEF med sina
standardvärden. LiraCADs stretchparametrar följer inte med som dynamiska
blockfunktioner i DXF; den aktuella formen bevaras.

Detta är DXF-export för återanvändbara mallar, exempelvis till LiraStructure.
DWG-skrivning finns ännu inte. Öppning och exportens struktur är verifierade
i LiraCAD; mallfilens användning i LiraStructure behöver provas där.

### Blockeditor
Dubbelklicka på ett block eller markera det och kör `BEDIT` (`BE`). Blocket
öppnas isolerat i lokala koordinater med de vanliga ritverktygen och egen
ångrahistorik. Inspektorn visar blocknamn och baspunkt; markera en attributtext
för att ändra dess namn, standardtext och utseende.

`BSAVE` eller **Spara block** uppdaterar alla instanser och blockbiblioteket.
Placering, rotation, skala och individuella attributvärden behålls (även när
attributnamnet ändras på samma textobjekt). Nya attribut får standardvärdet.
Baspunkten blir definitionens nya origo; instansernas insättningspunkter ligger
kvar. `BCANCEL` eller **Avbryt blockredigering** kastar utkastet. Den sparade
ändringen kan ångras som ett steg i huvudritningen. Blockutkast autosparas inte;
webbläsaren varnar om du lämnar sidan. Nästlade block och AutoCADs dynamiska
blockfunktioner stöds inte.

### STRETCH och smarta block
`STRETCH` (`S`) använder en sträckruta: dra rutan eller ange dess två hörn,
välj en baspunkt och ange målpunkten, exempelvis `@200,0`. Ändpunkter och hörn
i rutan flyttas; helt inneslutna objekt flyttas i sin helhet. Linjer,
polylinjer, hatch-hål, bågändpunkter och måttpunkter kan sträckas. En delvis
innesluten cirkel sträcks inte. Text och block flyttas om insättningspunkten
ligger i rutan. Viewport-ramar ingår inte. Förhandsvisningen ändrar inte
ritningen och hela ändringen kan ångras i ett steg.

I `BEDIT`, välj **Lägg till stretchparameter** eller kör `BSTRETCH` (`BSP`).
Ange ett namn, exempelvis Bredd, välj längdaxelns fasta start och slutpunkt
och en sträckruta runt den rörliga änden. Spara blocket. Varje instans får
ett eget längdvärde i Egenskaper och ett grepp vid längdaxelns slut. Greppet
projicerar rörelsen på axeln och fungerar även efter rotation, skalning och
spegling. Värdet anges i blockets lokala millimeter. Exempelvis kan en
fönsterkarm behålla sin tjocklek medan bredden ändras. Högst 20 parametrar
per definition stöds; parametrar tas bort i blockeditorn.

**Visa stretch · namn** visar parameterns längdaxel, sträckruta och berörda
punkter. Gröna punkter hör till objekt som flyttas i sin helhet; orange
punkter sträcks. I parameterpanelen kan namn, axelkoordinater och rutans
gränser ändras. **Välj längdaxel i ritningen** och **Välj sträckruta i
ritningen** låter dig ange nya punkter genom klick, drag eller koordinater.
Ändring av sträckrutan räknar om vilka delar som påverkas.

**Minsta längd**, **Största längd** och **Längdsteg** styr både grepp och
inmatade värden. Steg 0 ger fri längd. Stegen utgår från grundlängden:
grundlängd 1000 och steg 100 ger exempelvis 900, 1000, 1100. Värden
avrundas till närmaste tillåtna steg inom gränserna. Grundlängden måste
ligga inom gränserna. När blocket sparas anpassas befintliga instansvärden
till nya gränser och steg; sparningen kan ångras som ett steg.
Separata parametrar för bredd och höjd kan påverka samma hörn och behålla
en karms tjocklek i båda riktningarna.

Parametrar och instansvärden bevaras i projektfilen och autosparningen.
DXF-export bevarar den aktuella formen som vanliga block. LiraCADs
parametrar följer inte med som AutoCADs dynamiska blockåtgärder, och
återimport av DXF ger därför statiska block.

### Attributfält i inspektorn
Markerade block visar sina attribut överst i inspektorn: fritext, dropdown eller
datum. Ändringen gäller bara det markerade exemplaret. I blockeditorn väljer du
ett attribut via listan **Attribut** eller genom att markera attributtexten.
Där kan du ange etikett, fälttyp, standardvärde, ordning och egna val (ett per rad).
Du bestämmer själv fälttyp och alla alternativ. Dropdown kan
även tillåta egen text. **Gör till vanlig text** tar bort attributfunktionen.

Spara blocket för att uppdatera fältdefinitionerna i alla exemplar. Deras befintliga
värden behålls, även om ett gammalt värde inte längre finns i listan. Projektfilen
bevarar fälttyper och valalternativ; DXF innehåller det valda värdet som vanlig
attributtext.

### Egenskaper och lager
Inspektorn visar alltid lager, färg och linjetyp överst. Objektets specifika fält
visas därefter. Lagerknappen i verktygsraden öppnar en separat lagereditor för
namn, färg, linjetyp, synlighet, låsning och aktivt lager.

Linjetyper: Enligt lager, Heldragen, Streckad, Prickad, Centrumlinje och Dold
linje. Val utan markering används för nya objekt; med markering ändras objekten.
Mönstren anges i ritningsenheter och bevaras i projekt, DXF och SVG-export.

### DXF-import (första versionen)
**Öppna projekt** accepterar nu även ASCII `.dxf` (max 50 MB). Filen bearbetas
lokalt i en web worker. Importen ersätter den aktuella ritningen och kan ångras.
En rapport visar objekt som hoppats över och kända förenklingar.

Stöd: LINE, CIRCLE, ARC, 2D LWPOLYLINE/POLYLINE inklusive bulge, TEXT/MTEXT,
vanliga INSERT/ATTDEF/ATTRIB, fem måtttyper, raka LEADER och textbaserade MULTILEADER,
solida hatch och hatch med flera gränser/hål, layouter och roterade rektangulära
viewports. Ellipser och kontrollpunktsbaserade rationala splines approximeras till
redigerbara polylinjer med måltolerans 0,001 ritningsenhet och begränsad segmentbudget.
Planar polyface-mesh bevarar synliga kanter. Lager, ACI/true color, enkla native
linjemönster, linjetypsskala och linjevikt läses. ACI 7 visas som ljus text i modell
och mörk text på papper; explicit true-color vitt förblir vitt.
Blockens dropdown-definitioner är LiraCAD-projektdata och finns inte i DXF.

TEXT bevarar justering, breddfaktor, lutning och spegling. MTEXT bevarar
fästpunkt, bredd, radavstånd och grundläggande spannformatering. TTF/OTF-fontnamn
bevaras och används om typsnittet finns lokalt; ISO-fonter får det medföljande
osifont (LiraCAD ISO) som reserv före Arial Narrow/Arial. ISOC P/ISOC T-familjerna
matchas uttryckligen; andra SHX-fonter använder fortsatt en generell reserv.
Typsnittet laddas innan text mäts och fungerar offline efter installation.
SVG-export bäddar in ISO-reserven så att den kan visas även på en annan dator.
LiraCAD ISO kan också väljas i texteditorn. Det är en approximation av originalets
ISO-font, ingen SHX-tolk. Källa och licens finns i `src/vendor/fonts/osifont/`.
SHX visas med en ersättningsfont men originalnamnet bevaras för
DXF-export. Attribut accepterar svenska tecken, siffror, punkt och bindestreck.
ATTRIB-position och storlek bevaras per blockinstans; osynliga attribut förblir
osynliga. Plan spegling med normal −Z stöds. Olikformigt skalade block plattas ut
till redigerbar geometri. Måtttyper utanför appens fem native typer bevaras som
geometri från måttblocket när det finns.

Pappersobjekt räknas om till bladets fysiska mm med utskriftsskala, tum/mm,
fönsterursprung och utskriftsförskjutning. En A1-layout som skrivs i halv skala
på A3 ryms därför på A3 även i appen. Modellkoordinater och viewportens målpunkt
bevaras. DXF-exporten skriver den normaliserade layouten i skala 1:1.
Sparade viewportvyer som ligger utanför tillgänglig synlig modellgeometri
rapporteras; importen flyttar inte vyerna till en gissad position.

Begränsningar: binär DXF, generell 3D, blockmatriser, rasterbilder/OLE, komplexa
linjetyper med text/SHX och klippta/perspektiviska viewports saknar stöd.
Importerade mått behåller sitt anonyma visningsblock som grafik inom måttobjektet.
Flytt/rotation/spegling bevarar grafiken. Skala räknar om värdet och bevarar
grafiken när textmallen kan matchas; annars återskapas måttet. Ändrade mätpunkter, text eller stil
återskapar måttet från dess mätpunkter; avancerade pilformer/textplacering kan då
avvika. DIMSTYLE och ACAD/DSTYLE-överstyrningar läses för höjd, pilstorlek,
hjälplinjernas avstånd, textgap, decimaler, måttfaktor, prefix/suffix och font.
Textmallen `min <>` räknas om med det aktuella värdet; en ensam blank döljer texten.
Hatch bevarar linjefamiljernas vinkel, baspunkt, offset, streck/gap och punkter,
inklusive BTG/INSUL2 och användardefinierade mönster. Samma geometri används för
canvas och SVG och skrivs tillbaka till DXF. Vinkel/täthet ändrar hela mönstret.
Vid utzoomning glesas skärmens linjer under 0,8 px; generering begränsas till
30 000 segment per hatch. Alternativa ö-lägen och gradienter är inte fullt stödda.
Avancerade MTEXT-stycken, tabeller och staplade bråk förenklas. Modellkoordinater behålls utan enhetsomräkning; andra
ritningsenheter än mm rapporteras. Kontrollera mått innan praktisk användning.

### DWG-import (första versionen)
Öppna `.dwg` med **Öppna projekt**. ACadSharp 3.8.0 (MIT) körs i .NET 10
WebAssembly i en separat web worker. Filen skickas inte till någon server.
En DXF-representation skapas bara i minnet och läses av samma importör som ovan.
Resultatet är redigerbara LiraCAD-objekt, med samma begränsningar som DXF-importen.
Nästlade block förenklas till geometri i den yttre blockdefinitionen; dynamiska
funktioner bevaras inte. Specialobjekt kan saknas helt och rapporteras vid import.
Spara som LiraCAD-projekt eller exportera DXF. DWG-export ingår inte.

Annotativa blockskalvarianter läses ur objektens kontextordböcker, även i
nästlade block. Layoutvisning och SVG-export använder viewportens separata
annotationsskala, inte dess utskriftsskala. Frysta viewportlager respekteras.
Viewportens inspector har **Annotationsskala 1:** och **Visa övriga skalvarianter**.
När originalets ANNOALLVISIBLE saknas visas ej matchande objekt med sin sparade
grundgeometri och importen rapporterar detta. Aktiverad viewport använder samma
skalvariant för målning, markering, grepp, snäppning och texteditor.
Välj text eller mått i modellvyn och använd **Skapa variant för 1:…** för manuell
justering. Placering, textstorlek och utseende sparas per annotationsskala;
textinnehåll och måttets mätpunkter är gemensamma. Ångra/redo bevarar varianterna.
Blockeditorn ändrar den gemensamma grunddefinitionen; attributens texteditor
kan ändra den aktiva skalvarianten. COPY bevarar varianterna och flyttar dem alla.
Importerbara TEXT/MTEXT-kontexter kräver läsbar placering och explicit standard-
kontext för beräkning av texthöjd. Måttkontexter kräver ett läsbart måttblock och
standardkontext. DWG-läsaren är utökad med TEXT- och MTEXT-kontextklasser och
den ombyggda runtime ingår i appen. Autodesks offentliga övnings-DWG verifierar
fem MTEXT-varianter i 1:24 och 1:48 genom verklig webbläsarimport och återimport.
Wisconsin DOT:s utbildnings-DWG verifierar dessutom 23 TEXT- och 252 MTEXT-
kontexter, varav 27 textobjekt används i importerad ritning. En kolumn stöds även
när originalet har dynamisk kolumnmetadata. Fit/aligned TEXT, 3D-kontexter och
MTEXT med oläsbar kolumnmetadata använder grundgeometrin med varning.
Läsbar MTEXT bevarar flera kolumner, bredd, mellanrum, automatisk/manuell höjd,
läsordning och explicita kolumnbrytningar. Samma layout används för canvas,
markering och SVG. Egenskaperna kan justeras i inspektorn och bevaras i DXF.
Originalets radbrytning kan fortfarande avvika med ersättningsfont.
Native måttkontexter kopplas nu till skalans sparade måttblock, standardkontext,
textplacering och måttlinje. ALDIM är verifierat mot 28 respektive 10 mått i de
båda offentliga DWG-filerna. Läsare finns också för ANG/DMDIM/RADIM/RADIMLG/ORD,
men deras binära svansfält saknar ännu oberoende DWG-verifiering; appens stödda
måtttyper och läsbara block avgör vilka varianter som kan användas.
Saknade text-/måttskalvarianter rekonstrueras inte från enbart en annotativ stil.
Annotativa objekt utan läsbar kontext får en importvarning. Projektfiler bevarar
skalinformationen; DXF bevarar den som LIRA_ANNOTATION-XData för återimport i
LiraCAD. Detta är inte en export av AutoCADs fullständiga annotativa objektsystem.

Den medföljande läsaren stöder DWG-format AC1014–AC1032. Alla filer och
objekttyper är inte verifierade. Testad i webbläsaren med ACadSharps
`sample_AC1032.dwg` (ursprunglig kontroll: 111 inlästa objekt, rapporterade avvikelser).
Importförbättringarna har dessutom verifierats lokalt med A-40-P-0200,
A-40-P-0300, K20-G-D100, K20-G-S100 och Namnruta_A9: öppning i webbläsare,
text/namnruta samt giltig DXF-export och återimport. Filerna är inte testfixtures
i repositoryt. Externa DWG-referenser rapporteras med namn/sökväg och kräver
tillhörande filer; appen hämtar dem inte automatiskt.

Kodernas betydelse följer Autodesks referens för
[TEXT](https://help.autodesk.com/cloudhelp/2023/ENU/AutoCAD-DXF/files/GUID-62E5383D-8A14-47B4-BFC4-35824CAE8363.htm),
[MTEXT](https://help.autodesk.com/cloudhelp/2023/ENU/AutoCAD-DXF/files/GUID-5E5DB93B-F8D3-4433-ADF7-E92E250D2BAB.htm) och
[VIEWPORT](https://help.autodesk.com/cloudhelp/2016/ENU/AutoCAD-DXF/files/GUID-2602B0FB-02E4-4B9A-B03C-B1D904753D34.htm) samt
[PLOTSETTINGS](https://help.autodesk.com/cloudhelp/2025/ENU/AutoCAD-DXF/files/GUID-1113675E-AB07-4567-801A-310CDE0D56E9.htm).
Runtimefilerna är cirka 27 MB och ingår i PWA-cachen för användning offline.
Licenser och bygginstruktioner: `tools/DwgBridge/README.md`.

### Stabilitetskontroll

Se [stabilitetskontrollen](docs/stability.md) för verifierat filflöde och kvarvarande begränsningar. DXF återimporterar hänvisning och dess text som separata objekt; projektfiler bevarar kopplingen.
