# Externa referenser (Xref)

Fliken **Referenser** bredvid Egenskaper och Katalog hanterar DWG/DXF-underlag samt LiraCAD-projekt. Ingen extra knapp läggs till i verktygsfältet.

- Länka fil läser modellgeometri som separat, icke redigerbart underlag. Placeringen anges med X/Y (mm), rotation (grader) och positiv, likformig skala. Importerade speglade referenser behåller speglingen.
- Synlighet, nedtoning (0–90 %) och snappning styrs per referens. Nedtoningen gäller skärmvisningen; utskrift använder ordinarie färger. Referensgeometrin visas även i layoutens modellviewports.
- Lager visas som `filnamn | lagernamn` i lagerhanteraren. De är låsta initialt. Geometrin förblir icke redigerbar även om lagret låses upp. Lageröverstyrningar bevaras vid omladdning utifrån källagrets namn.
- Länka filer väljer flera filer samtidigt. Mapp väljer en projektmapp och matchar relativa sökvägar innan filnamn. Lös saknade länkar läser enbart matchande referenser. Underfiler länkas i ett utfällbart träd och läggs inte samtidigt till som separata huvudreferenser. Den redan öppna huvudfilen länkas inte tillbaka till sig själv. Dubbla, tvetydiga filnamn lämnas för manuellt filval.
- Ladda om och Byt fil öppnar filväljaren. Webbläsaren följer inte filsystemets sökvägar automatiskt. Inläsningen ersätter underlaget först efter lyckad import och validering. Byte av ritning eller pågående redigering under inläsningen avbryter operationen.
- **Ladda om alla** väljer flera filer; **Från mapp** väljer en projektmapp. Alla matchande huvud- och underreferenser uppdateras i en gemensam ångringsbar operation. Inga nya huvudreferenser läggs till. Placering, synlighet, snappning, nedtoning, urladdning och lageröverstyrningar behålls. Filer som saknas i urvalet eller matchar tvetydigt behåller sina sparade kopior. Kommandologgen visar uppdaterade filer och länkar utan entydig matchning.
- Urladda behåller länken och den sparade geometrin, men tar bort underlaget från visning, snappning och utskrift. Ladda återaktiverar kopian. Ta bort länk tar bort referensen; ångra återställer den.
- Bind till ritningen skapar vanliga lokala block med referensens placering. Stora underlag delas i block om högst 10 000 objekt enligt appens blockkontrakt. Referenslagren blir vanliga, olåsta lager. Bindning går att ångra.

## Projektformat och lagring

`document.references` innehåller id, filnamn, sökväg, `kind` (`overlay` eller `attach`), punkt, rotation i radianer, skala, eventuell spegling, synlighet, laddningsflagga, snappningsflagga, nedtoning, tid för senaste inläsning och `geometry`. Underreferenser sparas rekursivt i `children`; `sourceLoaded` skiljer en inläst referens som enbart innehåller underreferenser från en saknad fil. `sourcePath` anger den valda filens plats i ett paket. `problem` anger cirkulär, tvetydig eller för djup länk. Geometrin består av lokala modellobjekt med unika id:n och lager som finns i värdritningen. Block i källfilen utvärderas till sina delar; källans insättningsbas flyttas till referensens lokala origo.

Projektfil och lokal autosparning innehåller underlagskopian. Ett projekt kan alltså återöppnas utan originalfilen. Statusen Laddad avser den tillgängliga kopian, inte en aktiv filövervakning. Saknas avser en importerad länk där geometrin ännu inte har lästs in. Sådana länkar visas i listan och med en markering vid insättningspunkten.

Äldre projekt utan `references` fungerar oförändrat. Referensändringar ingår i dokumentets transaktioner och ångra/gör om. Max 1000 referenser totalt, högst 16 nivåer och sammanlagt 200 000 referensobjekt; importfilgränsen är densamma som vanlig import, 50 MB.

## DXF och DWG

DXF-importen bevarar externa INSERT-referenser som länkar, även om huvudritningen bara innehåller Xref. Filväg, Överlägg/Bifoga, placering, likformig skala och spegling bevaras. Källfilen kopplas med Byt fil. DWG går genom befintlig lokala DWG-till-DXF-läsare och samma importmodell.

DXF-export skriver riktiga externa BLOCK-definitioner med grupp 70:s Xref/overlay-flaggor, filväg i grupp 1 och INSERT med transform. Sparad referensgeometri bakas inte in i exporten. Källfilerna måste skickas med. AutoCADs ritningsreferenser använder DWG-källor: underlag från DXF eller LiraCAD behöver bindas eller konverteras till DWG före utbyte med AutoCAD.

Formatkälla: [Autodesk BLOCK (DXF)](https://help.autodesk.com/cloudhelp/2024/ENU/AutoCAD-DXF/files/GUID-66D32572-005A-4E23-8B8B-8726E8C14302.htm).

## Avgränsningar

Klippning (XCLIP), olikformig skala, PDF/bildunderlag och export av projektpaket ingår inte ännu. Xref-hierarkier mellan valda DWG/DXF/LiraCAD-filer läses rekursivt. Bifoga följer med genom kedjan, medan ett nästlat Överlägg och dess underreferenser inte visas i värdritningen. Cirkulära kedjor stoppas vid den upprepade filen och visas i trädet. Underreferensens placering och typ styrs från källfilen; synlighet/snappning kan ändras i värden. Underreferenser kan lösas individuellt senare med Byt fil eller en ny filgrupp. En omladdning av föräldern behåller tidigare underlagskopior för oförändrade barnlänkar när deras filer inte valdes samtidigt.

Referenser inuti ett vanligt lokalt block är fortfarande en importavgränsning och rapporteras. Äldre projekt med redan sammanbakad referensgeometri fortsätter fungera; ladda om källfilerna för att få ett separat träd. Det finns ingen automatisk filövervakning eller automatisk åtkomst till filer utanför de valda filerna/mappen.
