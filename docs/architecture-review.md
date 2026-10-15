# Ansvarsgenomgång 2026-10-14

Genomgången omfattar appens egen JavaScript-kod fil för fil: exports, beroenden, tillståndsägande, dokumentändringar och plattformseffekter. Leverantörskod under `src/vendor` och genererade byggfiler ingår inte i refaktoreringen. Varje modul nedan har en deklarerad ägare. `tests/layer-boundaries.test.mjs` kräver att registret omfattar alla egna moduler och kontrollerar importgränser, cirkulära beroenden och DOM-/lagringsfri modell, editor och verktyg.

## Filansvar

| Fil | Ansvar |
| --- | --- |
| `src/app.js` | Startar applikationen. |
| `src/app/block-controller.js` | Samordnar blocksession, parentlagring och återföring. |
| `src/app/document-workflow.js` | Samordnar import/export och skyddar pågående redigering. |
| `src/app/import-controller.js` | Filactions och insamling av importdiagnostik. |
| `src/app/project-controller.js` | Projektbyten och aktivt projekts editor- och kamerakontext. |
| `src/app/reference-controller.js` | Referensactions och skydd mot inaktuella asynkrona läsresultat. |
| `src/app/save-controller.js` | Samordnar journal och autosparning per ursprungsprojekt. |
| `src/app/viewport-controller.js` | Scenram, renderingsscheduling, canvasstorlek och fit. |
| `src/cad-application.js` | Kompositionsrot: skapar instanser och kopplar beroenden och effekter. |
| `src/commands/command-catalog.js` | Kommandoidentifierare, alias och metadata. |
| `src/commands/command-prompts.js` | DOM-fria prompttexter för verktygsfaser. |
| `src/core.js` | Kompatibilitetsfasad för äldre externa anrop. |
| `src/editor/active-document.js` | En enda aktiv session; dokument och historik läses via sessionen. |
| `src/editor/block-edit-session.js` | Isolerad blocksession och validerad återföring till huvuddokumentet. |
| `src/editor/command-controller.js` | Tolkar kommandon och styr verktygens livscykel. |
| `src/editor/creation-settings.js` | Äger separata skapandeinställningar för modell och papper. |
| `src/editor/cursor-controller.js` | Samordnar cursor, snappning, polarstyrning och tracking. |
| `src/editor/document-context.js` | Delade regler för aktiv ritmiljö, synlighet och redigerbarhet. |
| `src/editor/document-editor.js` | Gemensam redigeringsingång och notifiering efter godkännande. |
| `src/editor/editor-actions.js` | Ångra, vyändring, zoom, modifierare och snappningslägen. |
| `src/editor/editor-state.js` | Äger tillfälligt interaktionstillstånd. |
| `src/editor/editor.js` | Samordnar verktygsprotokollet med isolerad kontext. |
| `src/editor/entity-edit-controller.js` | Äger objektändringar, skalvariantredigering och återställning av layoutvyer. |
| `src/editor/inspector-actions.js` | Äger lager-, layout- och blockregler bakom inspektorns actions. |
| `src/editor/layout-controller.js` | Styr ritmiljö, viewportinträde och layoutskapande. |
| `src/editor/local-snapping.js` | Bygger begränsat snapindex för lokal interaktion. |
| `src/editor/navigation.js` | Tolkar normaliserad hjul- och kommandotangentdata. |
| `src/editor/pointer-controller.js` | CAD-gester, grepp, markering, navigation och dubbelklicksavsikter. |
| `src/editor/property-controller.js` | Styr aktivt lager och egenskaper för markering eller nya objekt. |
| `src/editor/selection-controller.js` | Äger härledd interaktionsgeometri samt markerings- och snapindex. |
| `src/editor/selection-gesture.js` | Tillståndsmaskin för klick- och fönstermarkering. |
| `src/editor/snapping.js` | Beräknar och prioriterar geometriska snappunkter. |
| `src/editor/text-edit-controller.js` | Styr text-/attributredigering och kopplar textytans adapter. |
| `src/editor/text-edit-session.js` | Isolerat textutkast och dess avslut. |
| `src/editor/tool-context.js` | Bygger verktygskontext och applicerar verktygsresultat via editorn. |
| `src/editor/tool-registry.js` | Registrerar varje interaktivt kommando hos en verktygsägare. |
| `src/editor/tracking.js` | Äger tillfälliga referenspunkter för tracking. |
| `src/editor/wblock-controller.js` | WBLOCK-val och validerade ändringar av original efter export. |
| `src/editor/workspace-controller.js` | Stämmer av ritmiljö och markering efter dokumentändring. |
| `src/examples/demo-document.js` | Genererar appens exempelritning. |
| `src/examples/stress-document.js` | Genererar ritningar för belastningsprov. |
| `src/io/dxf-annotation.js` | Läser och serialiserar DXF-annotationers metadata. |
| `src/io/dxf-curves.js` | Konverterar spline-, ellips- och kurvdata från DXF. |
| `src/io/dxf-dimensions.js` | Läser och skriver DXF-måttdata. |
| `src/io/dxf-export.js` | Konverterar CAD-modellen till DXF. |
| `src/io/dxf-hatch.js` | Konverterar DXF-skraffering och dess slingor. |
| `src/io/dxf-import.js` | Konverterar DXF-data till validerad CAD-modell. |
| `src/io/dxf-layout.js` | Serialiserar DXF-layout- och viewportdata. |
| `src/io/dxf-mleader.js` | Konverterar DXF multileader-geometri. |
| `src/io/dxf-text.js` | Tolkar CAD-fontnamn och MTEXT-kontrollkoder. |
| `src/io/file-import.js` | Läser projektfiler eller startar formatworker och validerar resultat. |
| `src/io/file-launch.js` | Köar filöppning och binder operativsystemets filstart. |
| `src/io/import-package.js` | Serialiserar importdiagnostik till ett rapportpaket. |
| `src/io/reference-files.js` | Matchar och läser referensfiler utan att publicera ändringar. |
| `src/io/wblock.js` | DXF-adapter för det extraherade WBLOCK-dokumentet. |
| `src/model/annotation-context.js` | Härleder importerade annotationsrepresentationer och validerar dem. |
| `src/model/annotation-edit.js` | Översätter skalvariantens redigering till sparad modell. |
| `src/model/attributes.js` | Attributschema, alternativ, datum och sortering. |
| `src/model/blocks.js` | Blockdefinitioner, instanser, attribut och härledd blockgeometri. |
| `src/model/camera.js` | Omvandling mellan världskoordinater och skärmpunkter. |
| `src/model/catalog-placement.js` | Beräknar insättning och ankarpunkt för katalogblock. |
| `src/model/dimensions.js` | Måttvärden, måttkedjor och måttens grafik. |
| `src/model/document-session.js` | Äger godkänt dokument och atomiska, validerade historikändringar. |
| `src/model/document-snapshot.js` | Isolerar och förseglar godkända dokumentsnapshots. |
| `src/model/document.js` | Validerar ritningens schema och modellinvarianter. |
| `src/model/dxf-colors.js` | Gemensam ACI-färgpalett. |
| `src/model/editing.js` | Geometriska operationer för sammanfogning, hörn och polylinjer. |
| `src/model/entity-geometry.js` | Härleder gränser, hit-avstånd och markeringsgeometri. |
| `src/model/entity-properties.js` | Validerar och applicerar geometriska egenskaper. |
| `src/model/entity-transform.js` | Transformerar modellgeometri utan att ändra källobjekt. |
| `src/model/font-catalog.js` | CAD-fontnamn och visningsfamiljer utan fontladdning. |
| `src/model/geometry.js` | Grundläggande punkt-, vektor- och skärningsberäkningar. |
| `src/model/grips.js` | Geometriska grepp, mål och härledd greppförflyttning. |
| `src/model/hatch-pattern.js` | Härleder skrafferingens linjesegment. |
| `src/model/history.js` | Äger undo/redo-stacken och historikposter. |
| `src/model/layout.js` | Pappers- och viewportgeometri samt kameraomvandling. |
| `src/model/linetypes.js` | Linjetyper och deras mönster. |
| `src/model/offset.js` | Parallellförskjutning av modellgeometri. |
| `src/model/parametric-blocks.js` | Parametervärden, constraints och utvärderad blockgeometri. |
| `src/model/plot-style.js` | Utskriftsfärger och linjetjocklekar. |
| `src/model/polyline.js` | Bågsegment och härledd polylinjegeometri. |
| `src/model/references.js` | Referensmodell, status, geometri, bindning och borttagning. |
| `src/model/spatial-index.js` | Geometriskt sökindex och områdesfrågor. |
| `src/model/steel-profile-data.js` | Källdata för stålprofilernas dimensioner. |
| `src/model/steel-profiles.js` | Genererar profildefinitioner från tabelldata. |
| `src/model/stretch.js` | Sträckrutor, mål och geometrisk sträckning. |
| `src/model/text-columns.js` | Kolumnschema och placering av textrader. |
| `src/model/text-metrics.js` | Injicerad textmätning och deterministisk reservmätning. |
| `src/model/text.js` | Textlayout, justering och textegenskaper med injicerade mått. |
| `src/model/trim-extend.js` | Klipper och förlänger geometri mot gränser. |
| `src/model/trim-sweep.js` | Beräknar och samlar geometriska ändringar under trimsvep. |
| `src/model/values.js` | Kopiering och identifierare för modellvärden. |
| `src/model/view-geometry.js` | Rutnätsavstånd och viewportklipp i skärmkoordinater. |
| `src/model/wblock-document.js` | Extraherar ett oberoende ritningsdokument för WBLOCK. |
| `src/rendering/block-parameter-overlay.js` | Målar stretchparameterns tillfälliga overlay. |
| `src/rendering/cad-fonts.js` | Laddar browserfont och tillhandahåller inbäddad SVG-font. |
| `src/rendering/canvas-text-metrics.js` | Installerar canvasbaserad textmätning i värdplattformen. |
| `src/rendering/entity-renderer.js` | Målar ett modellobjekts härledda geometri till canvas. |
| `src/rendering/plot.js` | Serialiserar ritningens pappersrepresentation till SVG. |
| `src/rendering/scene-renderer.js` | Målar en läsbar scenram och klippta modellvyer. |
| `src/storage/document-journal.js` | Beräknar och applicerar seriella dokumentpatchar. |
| `src/storage/indexeddb-project-store.js` | IndexedDB-transaktioner och lagringsposter. |
| `src/storage/project-storage.js` | Autosparning, återställning, journal och migrering. |
| `src/storage/project-workspace.js` | Äger öppna/stängda projekt, sessioner och återöppningsmanifest. |
| `src/tools/annotation-tools.js` | Tillstånd, händelser, preview och deklarativa resultat för annotation-verktyg; inga DOM- eller dokumenteffekter. |
| `src/tools/block-tools.js` | Tillstånd, händelser, preview och deklarativa resultat för block-verktyg; inga DOM- eller dokumenteffekter. |
| `src/tools/corner-tools.js` | Tillstånd, händelser, preview och deklarativa resultat för corner-verktyg; inga DOM- eller dokumenteffekter. |
| `src/tools/dimension-tools.js` | Tillstånd, händelser, preview och deklarativa resultat för dimension-verktyg; inga DOM- eller dokumenteffekter. |
| `src/tools/drawing-tools.js` | Tillstånd, händelser, preview och deklarativa resultat för drawing-verktyg; inga DOM- eller dokumenteffekter. |
| `src/tools/editing-tools.js` | Tillstånd, händelser, preview och deklarativa resultat för editing-verktyg; inga DOM- eller dokumenteffekter. |
| `src/tools/stretch-tools.js` | Tillstånd, händelser, preview och deklarativa resultat för stretch-verktyg; inga DOM- eller dokumenteffekter. |
| `src/tools/structure-tools.js` | Tillstånd, händelser, preview och deklarativa resultat för structure-verktyg; inga DOM- eller dokumenteffekter. |
| `src/tools/transform-tools.js` | Tillstånd, händelser, preview och deklarativa resultat för transform-verktyg; inga DOM- eller dokumenteffekter. |
| `src/tools/utility-tools.js` | Tillstånd, händelser, preview och deklarativa resultat för utility-verktyg; inga DOM- eller dokumenteffekter. |
| `src/tools/vertex-tools.js` | Tillstånd, händelser, preview och deklarativa resultat för vertex-verktyg; inga DOM- eller dokumenteffekter. |
| `src/tools/viewport-tools.js` | Tillstånd, händelser, preview och deklarativa resultat för viewport-verktyg; inga DOM- eller dokumenteffekter. |
| `src/tools/wblock-tools.js` | Tillstånd, händelser, preview och deklarativa resultat för wblock-verktyg; inga DOM- eller dokumenteffekter. |
| `src/ui/appearance-inspector.js` | Presenterar utseendeegenskaper. |
| `src/ui/attribute-inspector.js` | Presenterar attributfält och attributdefinitioner. |
| `src/ui/block-inspector.js` | Presenterar blockattribut och parametrar; äger fältfokus. |
| `src/ui/cad-shell.js` | Installerar arbetsytans panel- och menybeteende. |
| `src/ui/command-completion.js` | Presenterar och navigerar kommandoförslag. |
| `src/ui/command-feedback.js` | Visar verktygsprompt, kommandohjälp och markering. |
| `src/ui/command-input.js` | Binder kommandoradens DOM-händelser. |
| `src/ui/cursor-feedback.js` | Läser pekarposition och visar cursorfeedback. |
| `src/ui/detail-catalog.js` | Katalogsökning, urval, favoriter och SVG-förhandsvisning. |
| `src/ui/entity-inspector.js` | Presenterar objektspecifika egenskapskontroller. |
| `src/ui/file-drop.js` | Binder webbläsarens externa fildrop till filkön. |
| `src/ui/general-inspector.js` | Presenterar lager, färg och linjetyp. |
| `src/ui/import-dialog.js` | Presenterar importdiagnostik och rapportnedladdning. |
| `src/ui/input-controller.js` | Binder DOM-händelser till CAD-gester och tangentbordsactions. |
| `src/ui/inspector-composition.js` | Kopplar inspektorns delpaneler till injicerade redigeringsactions. |
| `src/ui/inspector-controller.js` | Väljer panel och presenterar inspektorns aktuella kontext. |
| `src/ui/inspector-controls.js` | Skapar och validerar inmatningskontroller. |
| `src/ui/layer-panel.js` | Presenterar lagertabell och anropar lageractions. |
| `src/ui/layout-inspector.js` | Presenterar layoutfält och anropar layoutactions. |
| `src/ui/project-tabs.js` | Visar projektflikar och vidarebefordrar byten, stängning och återöppning. |
| `src/ui/pwa.js` | Binder installation och service worker till webbplattformen. |
| `src/ui/reference-panel.js` | Presenterar referensernas status och actions. |
| `src/ui/ribbon.js` | Bygger menyflikar, verktygsgrupper och tangentbordsnavigation. |
| `src/ui/settings-panel.js` | Presenterar inställningar och exempelgenerering. |
| `src/ui/space-tabs.js` | Presenterar modell-/layoutflikar och viewportstatus. |
| `src/ui/text-editor.js` | DOM-adapter för textutkastets kontroller, popup och fokus. |
| `src/ui/toolbar-groups.js` | Presentationens verktygsgrupper och rubriker. |
| `src/ui/toolbar-icons.js` | SVG-symboler för verktygsmenyn. |
| `src/ui/update-ui.js` | Presenterar och samordnar användarens appuppdatering. |
| `src/ui/wblock-dialog.js` | Presenterar exportval och hanterar dialogens inmatning. |
| `src/ui/workspace-bindings.js` | Binder arbetsytans knappar och fliknavigation till actions. |
| `src/ui/workspace-view.js` | Visar status, arbetsytans tomläge och logg; webbläsarens fil-/downloadadapter. |
| `src/workers/dwg-import-worker.js` | Isolerad worker för DWG-runtime, DXF-konvertering och diagnostik. |
| `src/workers/dxf-import-worker.js` | Isolerad worker för DXF-konvertering och resultatmeddelanden. |

## Övriga appfiler

- `index.html`: statisk arbetsytas struktur, kontroll-ID och tillgänglighetsrelationer.
- `src/ui/style.css`: komponenternas grundlayout och CAD-yta; `src/ui/cad-shell.css`: det valda arbetsyteutseendet. Kaskadens ordning är uttrycklig i HTML och inga modellregler ligger i CSS.
- `server.mjs`: lokal server, innehållstyper och portval.
- `scripts/source-files.mjs`, `check.mjs`, `build.mjs`: gemensam rekursiv källinventering, verifiering, distributionskopia och offlinecache.
- `scripts/build-dwg.mjs`, `prepare-dwg-source.mjs`, `check-dwg-native.mjs`: byggning och verifiering av den separata formatbryggan.
- `tools/DwgBridge/Program.cs`: endast DWG→DXF-konverteringens gräns mot JavaScript. `AnnotationContexts/Objects.cs` och `Dimensions.cs` äger formatobjekt; `Reader.cs` och `Writer.cs` äger formatläsning respektive skrivning. `DwgFixtureProbe/Program.cs` är ett separat utvecklingsprov. Ingen UI- eller editorlogik ligger här.
- Manifest, ikoner och service worker är installation/leverans. Service worker genereras av bygget.

## Flyttade gränser

Kompositionsroten bygger inte längre redigeringsregler för objekt, grepp, WBLOCK, referenser, text eller inspektorns lager/layout/block. Layoutcontrollern bygger inte DOM. Projektcontrollern får fokus- och återställningseffekter injicerade. Textgeometrin skapar inte canvas och hämtar inte fonter. Godkända dokument och historik läses alltid från aktiv session. Sparad viewportnavigation har en egen validerad sessionoperation utan geometrisk undo-post.

Enkla fältadaptrar kan skapa en kopierad egenskapspatch och skicka den till editoractions. De äger aldrig godkänt dokument eller historik. Renderaren läser scenramar; selection-controller äger det enda aktiva interaktionsindexet. Webbläsarens in-/utmatning och formatkonvertering har egna adapterlager.

## Verifiering

- `scripts/check.mjs`: 466 tester passerar; alla egna moduler, workers, byggskript och servern syntaxkontrolleras rekursivt.
- `scripts/build.mjs`: distributionspaket och offlinecache innehåller den nya mappstrukturen; varje egen modul kontrolleras i cachetestet.
- Webbläsarprov: ny ritning, linjekommando, geometrifält, projektbyte med bibehållen historik, ångra, textcommit, layoutnamn/format, isolerat blockutkast, skyddat projektbyte, avbryt block, stängning och återöppning med sparad layout. Även det byggda distributionspaketet startar utan konsolfel.
- En verklig DXF-testfil har lästs genom formatworkern och öppnats i ny projektflik med godkänd importrapport.
- Native DWG-bryggans egna källfiler har granskats för ansvar; de och dess genererade runtime har inte ändrats eller byggts om i denna refaktorering.

Publicering sker via GitHub Actions till GitHub Pages efter godkänd byggning och verifiering.
