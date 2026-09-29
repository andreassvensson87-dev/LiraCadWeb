# LiraCAD Web 0.1

Första interaktiva utgåvan för att prova CAD-känslan. Kör lokalt på http://127.0.0.1:5174.

## Starta

Med Node.js installerat:

```sh
npm start
```

På den här datorn finns också `Starta LiraCAD.command`, som använder Codex medföljande Node om Node saknas i PATH. Ingen installation av npm-paket behövs.

## Prova

- Exempelritningen innehåller alla objekttyper. Klicka för att markera eller dra en markeringsruta. Shift lägger till/tar bort ur markeringen.
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

Flytta, kopiera, rotera, skala och spegla fungerar för flerval. Spegla ersätter valda objekt. Skala använder positiv faktor; vid musinmatning motsvarar 1 000 mm från baspunkten faktor 1. Grips finns på linjer, polylinjer, hatch, leader, cirklar och text. Trim och Extend ingår inte ännu. Fillet och Chamfer stöder två raka linjer.

## Filer

- **Spara projekt** laddar ned en `.liracad`-fil; **Öppna projekt** läser tillbaka den.
- Dokumentet autosparas i webbläsaren. Spara till fil för en separat säkerhetskopia. Ångrahistoriken bevaras under sessionen, inte efter omladdning.
- **Exportera DXF** skriver DXF R2007 (UTF-8) med millimeter, lager/färger och native LINE, LWPOLYLINE, CIRCLE, ARC, TEXT, MTEXT, LEADER och HATCH. Leaderns text skrivs som separat TEXT/MTEXT, utan associativ koppling.
- **DWG- och DXF-import finns inte i denna utgåva.** Formatmålet är fortfarande DWG/DXF in och DXF ut; se PLAN.md.
- Ny ritning, exempelritning och öppnat projekt går att ångra under samma session.

## Teknik och begränsningar

Modulär JavaScript utan byggberoenden. Geometri och DXF finns i `src/core.js`, interaktion/rendering i `src/app.js`. Denna första utgåva använder Canvas 2D och omritning vid ändringar via requestAnimationFrame. Stora produktionsritningar är ännu inte prestandaverifierade; nästa rendering/indexering väljs efter mätningar. Historiken sparar dokumentkopior, begränsade till 80 transaktioner, och behöver effektiviseras för stora filer.

Desktop med mus/tangentbord är målplattform. Hatch är en enkel polygon med parallella linjer; hål och komplexa mönster saknas. Textmått i markering är approximativa. Specialfonter, DWG-block och 3D ingår inte. Måttobjekt och paperspace finns nu, med begränsningar nedan. Systemfonter används om de valfria webbfonderna inte kan laddas.

## Kontroll

```sh
npm test
npm run check
```

Geometritester täcker koordinater, bågar vid stora koordinater, transformationer, offset, markering, historik och projektvalidering. Under utvecklingen verifierades kommandoflöden och egenskapsredigering i webbläsaren. Exempelritningens DXF lästes med ezdxf: 47 entiteter, korrekt millimeterenhet, inga auditfel eller reparationer. Detta är ingen full kompatibilitetscertifiering mot AutoCAD.

Ritytan har inga fasta överlägg. Rutnät är avstängt som standard och kan väljas i verktygsfältet. Kommandovägledning och snapstatus visas vid kommandoraden; objekträknaren finns i inspectorn. Tillfälliga grips, snapmarkörer, förhandsvisningar och hjälplinjer visas bara under arbete.

## Direkt textredigering och MTEXT

Dubbelklicka på ett Text-objekt eller en Leader för att öppna texteditorn på ritytan. TEXT/T och MTEXT/MT öppnar samma editor efter vald insättningspunkt. Enter ger ny rad; Ctrl/⌘+Enter eller Klar sparar hela ändringen som ett ångringssteg. Escape/Avbryt återställer. Klick utanför editorn bekräftar ändringen. Inspectorn visar texthöjd, typsnitt och blockformatering. Textinnehållet redigeras på canvasen.

Fetstil, kursiv, understrykning och Arial/Georgia/Courier New gäller hela blocket. Formatering per ord, färgspann, tabeller, automatisk radbrytning efter spaltbredd och avancerad MTEXT-layout ingår inte ännu. Editorn visas horisontellt under redigering; objektets rotation bevaras i ritningen.

Enkel oformaterad rad exporteras som TEXT. Flerradig eller formaterad text exporteras som MTEXT med styckebrytningar och DXF-formateringskoder. Exporten använder UTF-8 för svenska tecken. MTEXT-formatet beskrivs i [Autodesks DXF-referens](https://help.autodesk.com/cloudhelp/2023/ENU/AutoCAD-DXF/files/GUID-5E5DB93B-F8D3-4433-ADF7-E92E250D2BAB.htm).

## Polylinjer och hörn

- `O`: offset av öppna/slutna polylinjer med raka segment, samt linjer, cirklar och bågar. Ange avstånd eller mät mellan två punkter och välj sedan sida. Konturer som kollapsar eller korsar sig avvisas.
- `J`: sammanfoga valda linjer/öppna polylinjer med sammanfallande ändpunkter (tolerans 0,000001 mm). Gemensam kedja krävs. Resultatet får första objektets lager och färg.
- `X`: dela upp polylinjer i linjer, eller mått i sina ritdelar.
- `PI` / `PD`: välj polylinje, klicka för att lägga till respektive ta bort ett hörn. Nya hörn infogas i det närmaste segmentet.
- `F`: välj två linjer före start, ange radie. Alternativt starta, ange radie och välj två linjer på sidorna som ska behållas. Radie 0 ger skarpt hörn. Förhandsvisning vid val av andra linjen.
- `CHA`: motsvarande fasning. Ett avstånd ger lika sidor; `100,200` ger olika avstånd. För stora mått och parallella linjer avvisas.

Polylinjer med bågsegment/bulges och Fillet/Chamfer direkt på polylinjehörn ingår ännu inte. Dela upp en rak polylinje med X för att använda hörnverktygen på linjerna.

## Måttsättning

`DLI` linjärt, `DAL` riktat, `DAN` vinkel, `DRA` radie och `DDI` diameter finns också som knappar under Måttsätt. För DLI/DAL klickar du två eller fler mätpunkter, trycker Enter och placerar sedan hela måttlinjen. Kedjan sparas som ett objekt: val, flytt, rotation, skala och stil gäller hela kedjan. Greppet på måttlinjen flyttar dess placering; mätpunkternas grepp ändrar angränsande delmått. DAL använder de två första punkterna för kedjans gemensamma riktning. Vinkelmått använder spets, två riktningspunkter och placering. Radie/diameter använder en vald cirkel/båge och textplacering. DLI väljer horisontell/vertikal riktning efter placeringen.

Mått sparas som egna redigerbara projektobjekt med greppunkter, texthöjd, precision och, för enskilda mått, valfri textöverskrivning. Måttet räknas om när dess grepp ändras. **Mått är inte associativt kopplade till andra objekts geometri. DXF-exporten delar upp mått i linjer/bågar/text, inte native DIMENSION.**

## Layout och viewports

Välj **+ Layout** för A3, byt A3/A4 och orientering i inspectorn. Layouter kan döpas om och tas bort (ångra stöds). **+ Viewport / MV** skapar en rektangulär modellvy med två hörn. Markera ramen för att ändra skala, låsa vyn eller aktivera den. Flera viewports och layouter stöds.

Samma rit- och redigeringskommandon fungerar i Model och på papper. I papper är en enhet en millimeter på arket; inne i en aktiverad viewport är det modellens millimeter. Dubbelklicka inuti viewporten eller välj Aktivera modellvy för modellredigering. **Till papper** eller `PSPACE` återgår till arket. `MODEL` växlar till modellfliken. Låst vy blockerar panorering/zoom men inte redigering. Lås upp för att ändra vycentrum och skala med mus/styrplatta. Viewportramar kan flyttas, skalas och ändras med grips, men är alltid rektangulära och kan inte roteras/speglas.

Projektfil/autosparning bevarar papper, skala, låsning, modellvy och objektens utrymme. DXF-export skriver LAYOUT, pappersblock och native VIEWPORT. Även sekundära layouter bevaras. **Exportera ark** ger en SVG med fysiska millimetermått och klippta modellvyer; viewportramar skrivs inte ut. Ingen PDF-skrivardialog är integrerad ännu. Snap mot modellgeometri görs inne i aktiv viewport, inte från pappersläget genom en inaktiv viewport. Modellens lager delas av alla vyer; per-viewport lagerfrysning återstår.

Referenser för export: [LAYOUT](https://help.autodesk.com/cloudhelp/2018/ENU/AutoCAD-DXF/files/GUID-433D25BF-655D-4697-834E-C666EDFD956D.htm) och [VIEWPORT](https://help.autodesk.com/cloudhelp/2016/ENU/AutoCAD-DXF/files/GUID-2602B0FB-02E4-4B9A-B03C-B1D904753D34.htm).

Kedjemått: markera en måttkedja eller ett äldre linjärt/riktat mått och starta `DCO` / `DIMCONTINUE` (Kedjemått under Måttsätt). Utan förval klickar du på måttet. Klicka sedan ytterligare mätpunkter. Punkter mellan befintliga punkter delar ett delmått; punkter utanför förlänger kedjan. Samma objekt uppdateras med bibehållen måttlinje och stil. B byter ändpunkt för relativ koordinatinmatning, V väljer ett annat mått, Enter avslutar. Varje tillagd punkt kan ångras separat. Äldre mått omvandlas till en kedja när en punkt läggs till; textöverskrivningar tas då bort.

## Trimma och förläng

TR / TRIM och EX / EXTEND finns under Redigera. Välj gränser och tryck Enter (utan val används alla lämpliga objekt i aktuellt utrymme). Klicka delen som ska bort för TRIM, eller nära änden som ska förlängas för EXTEND. Förhandsvisning visar resultatet; fortsätt klicka och avsluta med Enter/Escape. Varje klick kan ångras. Linjer, bågar och raka polylinjer stöds som mål; cirklar fungerar också som gränser. Slutna polylinjer öppnas vid trimning och kan inte förlängas. Gränser måste verkligen skära målet eller dess förlängning; ingen imaginär förlängning av gränserna används.


## Installerbar webbapp / GitHub Pages

Publicerad app: https://andreassvensson87-dev.github.io/LiraCadWeb/
Publikt releasearkiv: https://github.com/andreassvensson87-dev/LiraCadWeb
GitHub Pages publicerar från `main`, rotmappen. Rotmappen innehåller det platta releasepaketet från `dist/`. Hela utvecklingsprojektet säkerhetskopieras i `source/` i samma arkiv. Första publicerade commit: `75f05b675a7344c50bc72bee5b2763f613228211`.

### Återställ utvecklingsprojektet

Ladda hem arkivet via GitHub: Code → Download ZIP, packa upp och öppna mappen `source/`. Med Node.js 22 eller senare: kör `npm start` för utveckling, `npm run build` för release och `npm test` för tester. Inga npm-paket behöver installeras. `dist/` återskapas av byggskriptet. Ritningar och lokala skärmbilder ingår inte i kodbackupen.

Vid framtida publicering: uppdatera både utvecklingsprojektet i `source/` och releasefilerna i arkivets rot. Varje GitHub-commit sparar versionshistoriken; ändringar som bara finns på datorn är inte säkerhetskopierade.

Kör `npm run build` med Node 22 eller senare. Publicera innehållet i `dist/` på GitHub Pages (behåll alla filer inklusive `.nojekyll`). Mappen innehåller bara appfiler, inga ritningar eller skärmbilder. Relativa sökvägar stödjer en projektadress som `https://andreassvensson87-dev.github.io/LiraCadWeb/`. `noindex` finns i HTML; det är inte åtkomstskydd.

Kör bygget igen vid varje uppdatering och publicera hela mappen tillsammans. Service worker får ett innehållsbaserat versionsnummer. Den nya versionen installeras bara om alla appfiler kan cachas. Knappen ”Ny version – uppdatera” sparar ritningen lokalt och aktiverar sedan den nya versionen. Andra öppna LiraCAD-fönster måste stängas först. Oavslutade ritkommandon/grepp ska slutföras före uppdatering. Ritningar laddas inte upp.

På Mac kan webbappen läggas till i Dock från Safari; Chromium kan erbjuda installation via appknappen. Installation och offlinelagring kan bero på webbläsaren. Spara projektfil innan byte från localhost: lokala ritningar överförs inte automatiskt till GitHub-adressen. Offline fungerar efter första lyckade cacheinstallationen. Browserlagring kan rensas; projektfiler behövs som backup.

Vanlig utveckling på localhost-rotadressen registrerar inte service worker. Testa releasepaketet på `/dist/`. Bygg före testkörningen: `npm run build && npm test`.
