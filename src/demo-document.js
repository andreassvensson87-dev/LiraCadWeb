import { polar } from "./geometry.js";
import { uid } from "./values.js";

export function demoDocument() {
  const layers = [
    {
      id: "walls",
      name: "01 · Väggar",
      color: "#c3d6ce",
      visible: true,
      locked: false,
    },
    {
      id: "furniture",
      name: "02 · Inredning",
      color: "#71bba5",
      visible: true,
      locked: false,
    },
    {
      id: "notes",
      name: "03 · Annotation",
      color: "#b3c4ab",
      visible: true,
      locked: false,
    },
    {
      id: "hatch",
      name: "04 · Skraffering",
      color: "#688e88",
      visible: true,
      locked: false,
    },
  ];
  const entities = [];
  const put = (type, props, layer = "walls") =>
    entities.push({ id: uid(), type, layer, ...props });
  const line = (a, b, l) =>
    put(
      "line",
      {
        points: [
          { x: a[0], y: a[1] },
          { x: b[0], y: b[1] },
        ],
      },
      l,
    );
  const rect = (x, y, w, h, l) =>
    put(
      "polyline",
      {
        points: [
          { x, y },
          { x: x + w, y },
          { x: x + w, y: y + h },
          { x, y: y + h },
        ],
        closed: true,
      },
      l,
    );
  const text = (x, y, t, h = 120, l = "notes") =>
    put("text", { point: { x, y }, text: t, height: h, rotation: 0 }, l);
  const arc = (x, y, r, a, s) =>
    put(
      "arc",
      { center: { x, y }, radius: r, start: a, sweep: s },
      "furniture",
    );
  // Compact atelier plan, with every supported entity represented.
  rect(0, 0, 8000, 5400);
  rect(180, 180, 7640, 5040);
  rect(4800, 180, 150, 5040);
  put(
    "hatch",
    {
      points: [
        { x: 0, y: 0 },
        { x: 8000, y: 0 },
        { x: 8000, y: 180 },
        { x: 0, y: 180 },
      ],
      spacing: 120,
    },
    "hatch",
  );
  put(
    "hatch",
    {
      points: [
        { x: 0, y: 5220 },
        { x: 8000, y: 5220 },
        { x: 8000, y: 5400 },
        { x: 0, y: 5400 },
      ],
      spacing: 120,
    },
    "hatch",
  );
  put(
    "hatch",
    {
      points: [
        { x: 4800, y: 180 },
        { x: 4950, y: 180 },
        { x: 4950, y: 3400 },
        { x: 4800, y: 3400 },
      ],
      spacing: 120,
    },
    "hatch",
  );
  rect(780, 1000, 600, 2900, "furniture");
  for (let y = 1120; y < 3800; y += 650) rect(840, y, 480, 520, "furniture");
  rect(2050, 1700, 1800, 900, "furniture");
  for (const x of [2220, 3100]) {
    rect(x, 1320, 530, 320, "furniture");
    rect(x, 2670, 530, 320, "furniture");
  }
  put("circle", { center: { x: 6410, y: 3500 }, radius: 780 }, "furniture");
  for (const a of [0, Math.PI / 2, Math.PI, Math.PI * 1.5])
    put(
      "circle",
      { center: polar({ x: 6410, y: 3500 }, 1070, a), radius: 210 },
      "furniture",
    );
  rect(5350, 650, 1900, 570, "furniture");
  line([6300, 650], [6300, 1220], "furniture");
  arc(4800, 3550, 900, 0, Math.PI / 2);
  line([4800, 3550], [5700, 3550], "furniture");
  arc(650, 180, 900, 0, Math.PI / 2);
  line([650, 180], [650, 1080], "furniture");
  text(2100, 4230, "ATELJÉ", 210);
  text(2150, 3970, "25.0 m²", 115);
  text(5520, 1770, "MÖTESRUM", 160);
  text(5810, 1500, "14.5 m²", 105);
  text(0, 6300, "ATELJÉ / 01", 290);
  text(0, 5940, "EN PLATS FÖR NYA IDÉER", 100);
  put(
    "leader",
    {
      points: [
        { x: 7250, y: 1220 },
        { x: 8550, y: 1900 },
        { x: 9550, y: 1900 },
      ],
      text: "Fast inredning",
      height: 130,
    },
    "notes",
  );
  put(
    "leader",
    {
      points: [
        { x: 4930, y: 2750 },
        { x: 8500, y: 5600 },
        { x: 9600, y: 5600 },
      ],
      text: "Lättvägg 150 mm",
      height: 130,
    },
    "notes",
  );
  line([0, -650], [8000, -650], "notes");
  for (const x of [0, 8000]) {
    line([x, -180], [x, -900], "notes");
    line([x - 80, -730], [x + 80, -570], "notes");
  }
  text(3700, -560, "8 000", 130);
  text(0, -1470, "STUDIEPLAN", 125);
  text(0, -1720, "Rita vidare. Välj ett objekt eller skriv ett kommando.", 100);
  text(7750, -1630, "L / 01", 130);
  return { version: 1, name: "Ateljé — studieplan", layers, entities };
}
