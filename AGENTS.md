# LiraCAD Web

Läs `docs/architecture.md` innan editor-, modell- eller arbetsyteändringar.

- `src/app.js` startar appen. `src/cad-application.js` skapar instanser och kopplar uttryckliga beroenden och effekter. Lägg nya beteenden hos ansvarig controller.
- UI visar tillstånd och anropar actions. Menyval får inte ändra godkänt dokument, geometri eller historik direkt.
- `src/editor/document-editor.js` är ingången för vanliga redigeringar och läser aktiv `DocumentSession` vid varje anrop. Transaktionscallbacks får utkastet som argument; peka aldrig om appens godkända dokument till utkastet.
- `DocumentSession` äger validering, dokument och undo/redo. Projekt-/blockbyte byter session. Blockutkast, import och lagring behåller sina uttryckliga livscykler.
- `src/editor/editor.js` och `src/editor/command-controller.js` samordnar verktygen. Verktyg returnerar ändringar och förhandsvisningar från isolerad kontext, utan DOM eller lagring.
- Modellregler och geometri är DOM-fria. Rendering och snappning använder härledd geometri, aldrig förhandsvisningar som sparad modell.
- `src/editor/selection-controller.js` äger rit-/snapindex och redigerbarhetsmängden. Markering, hit-test och snappning delar dessa källor.
- Filflikar använder `ProjectWorkspace`. Behåll sparskydd vid stängning, tomt startläge, återöppning och separat kamera/markering/historik för varje öppet projekt. Modell-/layoutflikar hör till ritningen.
- UI-komponenter behåller befintliga kontroll-ID och kommandoägare. `src/ui/cad-shell.css` äger menyn, ribbon, filflikar och inspektorns formspråk.
- Kör `npm run build` och `npm run check`. Kontrollera berörda användarflöden i webbläsaren. Beteendetester ska använda riktiga exporterade controllerer, inte källtextutdrag eller kopior av implementationen.

Alla egna moduler registreras i `docs/module-responsibilities.json`. Lagergränserna i `tests/layer-boundaries.test.mjs` är obligatoriska; modell/editor/verktyg får inga DOM- eller browserlagringsberoenden. Byggning och syntaxkontroll inventerar mappar rekursivt.
