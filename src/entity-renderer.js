import { blockParts } from "./blocks.js";
import { polylineParts, hasBulges } from "./polyline.js";
import { dimensionParts } from "./dimensions.js";
import { linePattern } from "./linetypes.js";
import { textLayout, textEmSize, fontFamily } from "./text.js";
import { pointsOf } from "./entity-geometry.js";
import { add, TAU } from "./geometry.js";
import { hatchSegments } from "./hatch-pattern.js";
import { paperLineWeight,paperColor } from "./plot-style.js";

// Stateless entity painter. Camera/layers are resolved per draw, including viewports.
export function createEntityRenderer({ ctx, screen, getCamera, layerOf, foregroundColor = () => "#ffffff",paperScale=()=>null,monochrome=()=>false }) {
  function path(points, close = false) {
    ctx.beginPath();
    points.forEach((p, i) => {
      const s = screen(p);
      i ? ctx.lineTo(s.x, s.y) : ctx.moveTo(s.x, s.y);
    });
    if (close) ctx.closePath();
  }
  function drawEntity(e, color, selected = false, preview = false) {
    if (e.hidden) return;
    if(paperScale()!=null && !selected && !preview)color=paperColor(e,layerOf(e),monochrome());
    if (!selected && !preview && e.cadColor7 && e.color === "#ffffff") color = foregroundColor();
    if (e.type === "block") {
      for (const part of blockParts(e)) {
        if (layerOf(part)?.visible !== false)
          drawEntity(
            part,
            selected || preview
              ? color
              : part.color || layerOf(part)?.color || color,
            selected,
            preview,
          );
      }
      return;
    }
    if (hasBulges(e)) {
      for (const part of polylineParts(e))
        drawEntity(part, color, selected, preview);
      return;
    }
    if (e.type === "dimension") {
      for (const part of dimensionParts(e))
        drawEntity(part, color, selected, preview);
      return;
    }
    if (e.type === "viewport") {
      drawEntity(
        { ...e, type: "polyline", points: pointsOf(e), closed: true },
        color,
        selected,
        preview,
      );
      return;
    }
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = selected ? 1.8 : paperScale()!=null ? Math.max(.35,paperLineWeight(e,layerOf(e))*paperScale()) : Math.max(1.15, (e.lineWeight ?? layerOf(e)?.lineWeight ?? 0) * getCamera().scale);
    ctx.setLineDash(
      preview
        ? [6, 4]
        : linePattern(e, layerOf(e)).map(
            (v) => Math.abs(v) * getCamera().scale,
          ),
    );
    if (e.type === "circle" || e.type === "arc") {
      const c = screen(e.center);
      ctx.beginPath();
      ctx.arc(
        c.x,
        c.y,
        e.radius * getCamera().scale,
        e.type === "arc" ? -e.start + (getCamera().rotation || 0) : 0,
        e.type === "arc" ? -(e.start + e.sweep) + (getCamera().rotation || 0) : TAU,
        e.type === "arc" && e.sweep > 0,
      );
      ctx.stroke();
    } else if (e.type === "text") {
      const p = screen(e.point);
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(-(e.rotation || 0) + (getCamera().rotation || 0));
      const layout = textLayout(e), scale = getCamera().scale;
      ctx.scale(layout.fit * (e.textMirrorX ? -1 : 1), e.textMirrorY ? -1 : 1);
      for (const line of layout.lines) for (const run of line.runs) {
        ctx.save();
        ctx.translate((layout.x + line.x + run.x) * scale, (layout.y + line.y) * scale);
        ctx.transform(run.widthFactor || 1, 0, -Math.tan(run.oblique || 0), 1, 0, 0);
        ctx.font = `${run.italic ? "italic " : ""}${run.bold ? "bold " : ""}${textEmSize(run, run.height) * scale}px ${fontFamily(run)}`;
        ctx.fillStyle = selected || preview ? color : monochrome() ? '#000000' : run.cadColor7 && run.color === "#ffffff" ? foregroundColor() : run.color || color;
        if (run.glyphs) for (const glyph of run.glyphs) ctx.fillText(glyph.text, glyph.x * scale, 0);
        else ctx.fillText(run.text, 0, 0);
        if (run.underline) {
          ctx.strokeStyle = ctx.fillStyle; ctx.beginPath();
          ctx.lineWidth = Math.max(1, run.height * scale / 16);
          ctx.moveTo(0, run.height * scale * 0.15);
          ctx.lineTo(run.width * scale / (run.widthFactor || 1), run.height * scale * 0.15); ctx.stroke();
        }
        ctx.restore();
      }
      ctx.restore();
    } else {
      path(e.points, e.closed || e.type === "hatch");
      if (e.type === "hatch") {
        ctx.save();
        for (const loop of e.holes || []) {
          loop.forEach((p, i) => { const s = screen(p); i ? ctx.lineTo(s.x, s.y) : ctx.moveTo(s.x, s.y); }); ctx.closePath();
        }
        if (e.solid) { ctx.fill("evenodd"); ctx.restore(); return; }
        ctx.restore();
        ctx.save();
        ctx.clip("evenodd");
        ctx.setLineDash([]);
        ctx.beginPath();
        for (const [a,b] of hatchSegments(e,{minSpacing:0.8/getCamera().scale})) {
          const p=screen(a), q=screen(b);
          if(a.x===b.x && a.y===b.y){ctx.moveTo(p.x+0.6,p.y);ctx.arc(p.x,p.y,0.6,0,TAU);}
          else {ctx.moveTo(p.x,p.y);ctx.lineTo(q.x,q.y);}
        }
        ctx.stroke();
        ctx.restore();
      } else ctx.stroke();
      if (e.type === "leader") {
        const a = screen(e.points[0]),
          b = screen(e.points[1]),
          ang = Math.atan2(b.y - a.y, b.x - a.x),
          size = Math.max(
            2,
            Math.min(14, (e.arrowSize ?? (e.height || 120) * 0.75) * getCamera().scale),
          );
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(
          a.x + size * Math.cos(ang - 0.32),
          a.y + size * Math.sin(ang - 0.32),
        );
        ctx.lineTo(
          a.x + size * Math.cos(ang + 0.32),
          a.y + size * Math.sin(ang + 0.32),
        );
        ctx.closePath();
        ctx.fill();
        if (e.text)
          drawEntity(
            {
              ...e,
              type: "text",
              point: add(e.points.at(-1), {
                x: (e.height || 120) / 3,
                y: ((e.height || 120) * 7) / 24,
              }),
              text: e.text,
              height: e.height || 120,
            },
            color,
            false,
            preview,
          );
      }
    }
    ctx.setLineDash([]);
  }

  return { path, drawEntity };
}
