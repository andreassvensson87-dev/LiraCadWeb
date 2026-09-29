// Pure command descriptions; no DOM or active document access.
export const advancedNames = new Set([
  "TRIM",
  "EXTEND",
  "JOIN",
  "EXPLODE",
  "PINSERT",
  "PDELETE",
  "FILLET",
  "CHAMFER",
  "DIMCONTINUE",
  "DIMLINEAR",
  "DIMALIGNED",
  "DIMANGULAR",
  "DIMRADIUS",
  "DIMDIAMETER",
  "MVIEW",
]);
function advancedPrompt(tool, { cornerSize, chamferSize }) {
  if (!tool || !advancedNames.has(tool.name)) return null;
  const n = tool.name,
    p = tool.points.length;
  if (["TRIM", "EXTEND"].includes(n))
    return tool.phase === "select"
      ? "Välj gränser · Enter fortsätter (inga val = alla)"
      : n === "TRIM"
        ? "Klicka delen som ska bort · Enter avslutar"
        : "Klicka nära änden som ska förlängas · Enter avslutar";
  if (n === "DIMCONTINUE")
    return tool.phase === "chainPick"
      ? "Välj en måttkedja eller ett linjärt mått · Enter avslutar"
      : "Lägg till mätpunkt · [Byt ände/Välj mått] · Enter avslutar";
  if (["DIMLINEAR", "DIMALIGNED"].includes(n))
    return tool.phase === "dimensionPlace"
      ? "Placera hela måttlinjen"
      : p
        ? `Ange nästa mätpunkt · ${p} valda · Enter placerar måttlinjen`
        : "Ange första mätpunkten";
  if (tool.phase === "select") return "Välj objekt · Enter fortsätter";
  if (tool.phase === "cornerSize")
    return n === "FILLET"
      ? `Ange radie <${cornerSize}> · 0 ger skarpt hörn`
      : `Ange fasavstånd <${chamferSize}> eller två avstånd: 100,200`;
  if (["FILLET", "CHAMFER"].includes(n))
    return tool.first
      ? "Välj andra linjen på sidan som ska behållas"
      : "Välj första linjen på sidan som ska behållas";
  if (n === "PINSERT") return "Klicka ny hörnpunkt vid önskat segment";
  if (n === "PDELETE") return "Klicka hörnpunkten som ska tas bort";
  if (n === "MVIEW")
    return p
      ? "Ange viewportens motsatta hörn"
      : "Ange viewportens första hörn";
  if (n === "DIMANGULAR")
    return [
      "Ange vinkelns spets",
      "Ange första riktningen",
      "Ange andra riktningen",
      "Placera vinkelmåttet",
    ][p];
  if (["DIMRADIUS", "DIMDIAMETER"].includes(n))
    return p ? "Placera måtttexten" : "Välj cirkel eller båge";
  return [
    "Ange första måttpunkten",
    "Ange andra måttpunkten",
    "Placera måttlinjen",
  ][p];
}

export function commandPrompt(
  tool,
  defaults = { cornerSize: 0, chamferSize: 100 },
) {
  let s = "";
  if (tool) {
    const n = tool.name,
      p = tool.points.length;
    if (tool.phase === "select") s = "Välj objekt · Enter fortsätter";
    else if (tool.phase === "blockName") s = "Ange ett unikt blocknamn";
    else if (tool.phase === "insertName") s = "Ange blocknamn";
    else if (tool.phase === "attributeName") s = "Attributnamn (t.ex. NUMMER)";
    else if (n === "BLOCK") s = "Ange blockets baspunkt";
    else if (n === "INSERT") s = "Ange insättningspunkt";
    else if (n === "PLINE" && p)
      s = tool.arcMode
        ? tool.arcMid
          ? "Ange bågens slutpunkt · L = linje"
          : "Ange punkt på bågen · L = linje · Enter avslutar"
        : "Nästa punkt · A = båge · C = slut · U = ångra · Enter avslutar";
    else if (tool.phase === "text") s = "Skriv text och tryck Enter";
    else if (n === "LINE" || n === "PLINE")
      s = p
        ? "Nästa punkt eller längd · Enter avslutar"
        : "Ange första punkten";
    else if (n === "RECTANG")
      s = p ? "Ange motsatt hörn" : "Ange första hörnet";
    else if (n === "CIRCLE") s = p ? "Ange radie eller klicka" : "Ange centrum";
    else if (n === "ARC")
      s = [
        "Ange bågens startpunkt",
        "Ange en punkt på bågen",
        "Ange bågens slutpunkt",
      ][p];
    else if (n === "TEXT") s = "Ange textens insättningspunkt";
    else if (n === "LEADER")
      s = ["Ange pilspets", "Ange brytpunkt", "Ange textplacering"][p];
    else if (n === "HATCH")
      s = p
        ? "Nästa hörn · Enter sluter ytan"
        : "Ange första hörnet för skraffering";
    else if (n === "MOVE" || n === "COPY")
      s = p ? "Ange målpunkt eller avstånd" : "Ange baspunkt";
    else if (n === "ROTATE")
      s = p
        ? "Ange vinkel i grader eller klicka riktning"
        : "Ange rotationscentrum";
    else if (n === "SCALE")
      s = p
        ? "Ange skalfaktor · mus: 1 000 mm = 1×"
        : "Ange skalningens baspunkt";
    else if (n === "MIRROR")
      s = p
        ? "Ange spegelaxelns andra punkt"
        : "Ange spegelaxelns första punkt";
    else if (n === "OFFSET")
      s =
        tool.phase === "distance"
          ? p
            ? "Ange mätningens slutpunkt eller skriv avstånd"
            : "Ange avstånd i mm eller mätningens startpunkt"
          : "Klicka på sidan för kopian";
    else if (n === "DIST")
      s = p ? "Ange mätningens slutpunkt" : "Ange mätningens startpunkt";
    else if (n === "PAN") s = "Dra för att panorera · Esc avslutar";
  }

  return advancedPrompt(tool, defaults) || s;
}
