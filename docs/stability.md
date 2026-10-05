# Stabilitetskontroll 2026-10-03

Kontrollen avser en organiserad kodgrund att bygga vidare på. Den ersätter inte
verifiering med representativa användarritningar i en oberoende CAD-läsare.

## Kontrollerade gränser

- Alla interaktiva katalogkommandon har en unik verktygsägare; BEDIT öppnar en
  blocksession. Verktygen känner inte till DOM eller lagring.
- Dokumenttransaktioner validerar isolerade utkast före publicering. Fel behåller
  accepterat dokument, historik och verktygsinmatning.
- Block- och textutkast behålls vid sparfel. Blockutkast autosparas inte som
  huvudritning. Preview och avståndsmätning ändrar inte dokumenthistoriken.
- `document-workflow.js` samordnar öppna, ersätta, spara och exportera med
  injicerade UI-/sessionseffekter. Nekad textbekräftelse stoppar filoperationen.
- Import kontrollerar att dokumentet fortfarande är samma och att inga nya
  verktygs-/text-/blockutkast startats under läsningen. Annars behålls arbetet
  och användaren får öppna filen igen. Importfel ändrar inte dokument eller redo.
- Dokumentbyte återställer appen till modelläge och rensar gamla vykameror.

## Verifiering

`node scripts/check.mjs` kontrollerar syntax, modulberoenden och 225 tester.
`node scripts/build.mjs` bygger den lokala releasen.

Det sammansatta regressionstestet använder faktisk filinläsning, dokumenthistorik,
editorn, textsessionen, projektlagring samt DXF-export/import. Det täcker öppna →
flytta → ångra/gör om → spara → återöppna → exportera. Projektfilen återläses
exakt; för DXF kontrolleras geometri, layout/viewport och rapporterade förenklingar.
Separata tester täcker nekade textutkast, trasiga filer och redigering under en
fördröjd import.

Samma arbetsflöde provades i den lokala appens webbläsare med en tillfällig
ritning med linje, text och viewport. Sparad projektfil och exporterad DXF
lästes från disk och validerades. Exporterad DXF öppnades genom appens riktiga
worker och gav tre objekt samt en layout utan importavvikelser. En trasig
projektfil lämnade ritningen kvar. Flerradigt attribut blockerade Spara/Exportera
och behöll texteditorn öppen. Inga konsolfel uppstod. Den tidigare ritningen
återställdes efter kontrollen.

## Kvarvarande begränsningar

- DXF är inte en exakt projektkopia. Hänvisning och dess text återimporteras som
  separata objekt, och måttkedjor exporteras som separata delmått. Importen
  rapporterar kända förenklingar. LiraCAD-filen bevarar projektets egna strukturer.
- Export-/importkontrollen använder appens egen DXF-läsare. Denna kontroll
  innehåller ingen ny verifiering i AutoCAD eller annan oberoende CAD-läsare.
- DWG kontrollerades inte med någon ny representativ DWG-fil i denna genomgång.
- Stora dokument, prestanda, per-viewport lagerfrysning och mer avancerad CAD-
  geometri ligger utanför denna kontroll. Filbegränsningarna i README gäller.
