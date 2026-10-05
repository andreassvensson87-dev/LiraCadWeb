# Lagringskontroll 2026-10-04

Autosparningen använder IndexedDB och lagrar dokument utan JSON-serialisering
för varje skrivning. Lokal projektfilsexport fungerar som tidigare.

## Verifiering

`tests/project-storage.test.mjs` och tjänst-/filflödestester kontrollerar:

- Migrering som behåller det gamla utkastet tills transaktionen har sparats.
- Misslyckad migrering som kan försöka igen med den intakta gamla kopian.
- Oläsbara utkast som skyddas från överskrivning.
- Sparordning, aktuella statuskvittenser, debounce och omedelbar tömning.
- Kvot-/åtkomstfel, transaktionsavbrott, blockerad öppning och sena anslutningar.
- Att lyckad `put` ännu inte räknas som en bekräftad transaktion.
- Återställningslogg för tillägg och redigering, utan dubletter när databasen redan hann
  spara, och skydd mot en logg från en annan checkpoint.

Webbläsarprovet finns på `http://storage-test.localhost:5174/tests/storage/`
när den lokala servern körs. Det återställer tidigare utkast och navigeringsval
efter provet och använder en separat tillfällig databas för migreringsprovet.
Utvecklingsvärdar registrerar ingen ny service worker för rotappen.

Provet i Chromium verifierade en ritning med **100 000 blandade objekt**,
**17 064 264 byte** som JSON-jämförelsedata. Autosparningen lyckades och appen
återställde samma dokument efter omladdning, med oförändrade objektdata.
Ett nytt objekt (100 001 totalt) och Ångra sparades också korrekt.
Omladdning direkt efter ett nytt objekt, före autosparningens debounce, återställde
också 100 001 objekt. Checkpoint och en liten synkron tilläggslogg skyddar detta
fall även om fullskrivningen vid sidstängning inte hinner slutföras.

Det befintliga utkastet `Ateljé — studieplan` med 71 objekt och två layouter
migrerades i ordinarie app och återlästes efter omladdning. Interaktionstestet
med 100 000 objekt behöll cirka 60 bildrutor/s under pan/zoom och bekräftade en
ny linje på 28 ms, med nästa omritning efter 30 ms; text tog 42 ms.
Omladdningen av den stora ritningen tog cirka 790 ms. Dessa är lokala,
kontrollerade prov.

Webbläsarens lagring har fortfarande en kvot och kan rensas. Projektfiler
behövs som separata säkerhetskopior. Ett abrupt avbrutet operativsystem eller
en avslutad webbläsarprocess kan inte garanteras hinna slutföra en sparning.
Ångrahistorik och obekräftade text-/blockutkast bevaras inte efter omladdning.
Om den tillfälliga loggen inte kan skrivas, exempelvis efter en mycket stor
ändring som överskrider localStorage-kvoten, visar toppraden
“Sparar… · invänta autosparning”. Invänta då “Autosparat lokalt” före omladdning.

## Uppföljning: redigering och Ångra/Gör om

Ändringsloggen omfattar nu flytt, rotation, radering, Ångra/Gör om och andra
godkända dokumentändringar. Den lagrar enbart ändrade objekt, borttagna ID:n,
nödvändiga placeringar i ritordningen och ändrad metadata. Ny kod ligger i
`document-journal.js`; befintliga tilläggsloggar stöds fortfarande. Objekt från
loggindata kopieras och varje återställd ögonblicksbild valideras innan skrivning.

Webbläsarprovet verifierar direkt omladdning efter MOVE, ROTATE, ERASE, UNDO
och REDO i en ritning med 100 000 blandade objekt. Bara testlinjen är redigerbar;
resten av ritningen jämförs mot originaldata efter varje omladdning. Alla fem
fall passerade, och respektive logg var under 4 kB. Testet återställer det
tidigare utkastet efteråt.

Automatiska tester täcker ordning, insättning/radering mitt i dokumentet,
metadata och dokumentbyte, blandade tillägg/redigeringar, redan sparade prefix,
överlappande skrivningar, fel och återförsök. Felaktiga poster, okända versioner
eller cykliska checkpoints bevarar databas och logg och pausar autosparningen.
En misslyckad loggskrivning bevarar den tidigare loggen och hindrar inte ett
senare lyckat fullständigt autosparande.

Ångrahistoriken lagras fortfarande inte över omladdning: det är resultatet av
det senaste godkända kommandot som återställs.
