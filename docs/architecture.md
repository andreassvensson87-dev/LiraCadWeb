# Ansvar i LiraCAD

Första uppdelningen av kärnan. Befintligt projektformat och ritbeteende behålls.

- `app.js`: kopplar DOM, ritverktyg och aktivt dokument. Äger tills vidare
  markering, kamera, blockeditorns session och när dokumentändringar tillämpas.
- `history.js`: isolerade dokumentögonblicksbilder, ångra/gör om och historikgräns.
  Ingen DOM eller lagring. Använder fortfarande hela dokumentkopior.
- `project-storage.js`: serialisering, återläsning, debounce, avbrytning och
  omedelbar sparning. Lagringsåtkomst injiceras. UI ansvarar för felmeddelanden.
  Omedelbar sparning avbryter väntande sparning, även vid blockredigering/pagehide.
- `file-import.js`: filstorleksgräns, val av parser, workerlivscykel, timeout,
  felhantering och validering. Returnerar data/rapport, ändrar aldrig aktiv ritning.
- `dxf-import.js` och DWG/DXF-workers: formatläsning och mappning till objekt.
- `dxf-export.js`: DXF-serialisering, tillsammans med dxf-dimensions/dxf-layout.
- `core.js`: kvarvarande geometri, dokumentvalidering och exempeldata.
  Återexporterar History/toDXF för kompatibilitet. Nya anrop importerar direkt
  från ansvarig modul. Det finns fortfarande cykliska beroenden kring core;
  de ska lösas när rena geometrioperationer och objekttyper separeras.

## Fortsatt arbete

1. Separera dokumentmodell/validering och rena geometriprimitiver från core.
2. Flytta verktygens tillstånd och kommandofaser från app till testbara kommandon.
3. Separera rendering, hit-test och inspector från kommandona.
4. Mät stora dokument innan spatialt index, cache och förändringsbaserad historik.
5. Byt lagringsadapter till IndexedDB med migrering och återställningspunkter.

Undvik samtidig omskrivning av filformat, verktygsbeteende och rendering.
Testa tjänster utan webbläsare med injicerad lagring/worker och behåll
geometri-, export-, block- och PWA-tester som regressionsskydd.

Kontroll: `npm run build && npm run check`. Byggsteget tar automatiskt med
nya src-moduler i release och offlinecache.

## Andra etappen: presentation

- `entity-renderer.js`: ritar enskilda objekt och deras delar till ett injicerat
  canvas-context. Kamera, koordinatomvandling och lager slås upp genom callbacks,
  så viewportbyte inte behåller gammal skala. Ingen DOM eller dokumentmutation.
- `command-prompts.js`: rena kommandotexter utifrån verktygsfas och aktuella
  standardvärden. Kommandonas geometriändringar finns fortfarande i app.js.
- `inspector-controls.js`: gemensamma fält, val, knappar och färgdropdown.
  Kontrollerna skickar värden till callbacks; de ändrar aldrig dokument själva.
  Fälten behåller hantering av Enter/Escape, multiline och ändring/blur.

Appen äger fortfarande scenrendering, overlays, kommandotillstånd och valet av
objektspecifika inspectorfält. Nästa etapp kan flytta hela kommandon ett i taget;
modulerna ovan ska inte få tillbaka beroenden på appens globala tillstånd.

## Tredje etappen: editor och verktygsprotokoll

`editor.js` samordnar registrerade verktyg. `drawing-tools.js` implementerar
LINE, CIRCLE och ARC med `create`, `handle`, `preview`, `describe`.
Verktygen tar punkt/text-händelser och returnerar nästa tillstånd, valfri
geometriändring och meddelande. De känner inte till DOM, lagring eller dokument.
Editorn skickar ändringen genom en injicerad applyChange-adapter till befintlig
make/commit/History. Den adaptern tilldelar aktuellt lager, färg, linjetyp och
model/paperspace. Förhandsvisningar ändrar aldrig dokumentet.
Kommandoraden får sin prompt via editorn. `describe.properties` deklarerar
verktygets generella egenskaper; inspectorn använder fortfarande sina gemensamma
befintliga fält. Markeringsverktyg och övriga kommandon ligger kvar i app.js
under migreringen. Editorn äger ännu inte hela dokumentet/kamera/markering.

Escape avbryter via editor.cancel. Enter/mellanslag skickas som textinmatning
från samma befintliga tangentbordsadapter. LINE avslutas med tom inmatning,
CIRCLE/ARC avslutas vid färdig geometri. Felaktig båge behåller tidigare punkter.
