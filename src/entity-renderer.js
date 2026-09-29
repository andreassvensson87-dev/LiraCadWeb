import { blockParts } from "./blocks.js";
import { polylineParts, hasBulges } from "./polyline.js";
import { dimensionParts } from "./dimensions.js";
import { linePattern } from "./linetypes.js";
import { textLines, textFont } from "./text.js";
import { pointsOf, bounds, add, TAU } from "./core.js";

// Stateless entity painter. Camera/layers are resolved per draw, including viewports.
export function createEntityRenderer({ ctx, screen, getCamera, layerOf }) {
  function path(points, close = false) {
    ctx.beginPath();
    points.forEach((p, i) => {
      const s = screen(p);
      i ? ctx.lineTo(s.x, s.y) : ctx.moveTo(s.x, s.y);
    });
    if (close) ctx.closePath();
  }
  function drawEntity(e, color, selected = false, preview = false) {
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
    ctx.lineWidth = selected ? 1.8 : 1.15;
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
        e.type === "arc" ? -e.start : 0,
        e.type === "arc" ? -(e.start + e.sweep) : TAU,
        e.type === "arc" && e.sweep > 0,
      );
      ctx.stroke();
    } else if (e.type === "text") {
      const p = screen(e.point);
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(-(e.rotation || 0));
      const size = e.height * getCamera().scale;
      ctx.font = `${e.italic ? "italic " : ""}${e.bold ? "bold " : ""}${size}px "${textFont(e)}"`;
      textLines(e.text).forEach((line, i) => {
        const y = i * size * 1.4;
        ctx.fillText(line, 0, y);
        if (e.underline) {
          ctx.beginPath();
          ctx.lineWidth = Math.max(1, size / 16);
          ctx.moveTo(0, y + size * 0.15);
          ctx.lineTo(ctx.measureText(line).width, y + size * 0.15);
          ctx.stroke();
        }
      });
      ctx.restore();
    } else {
      path(e.points, e.closed || e.type === "hatch");
      if (e.type === "hatch") {
        ctx.save();
        ctx.globalAlpha = 0.075;
        ctx.fill();
        ctx.restore();
        ctx.save();
        ctx.clip();
        const b = bounds(e),
          a = screen({ x: b.minX, y: b.maxY }),
          z = screen({ x: b.maxX, y: b.minY }),
          step = Math.max(5, e.spacing * getCamera().scale),
          extent = Math.hypot(z.x - a.x, z.y - a.y);
        ctx.translate((a.x + z.x) / 2, (a.y + z.y) / 2);
        ctx.rotate(-(e.patternAngle ?? Math.PI / 4));
        ctx.globalAlpha = 0.6;
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        for (let y = -extent; y < extent; y += step) {
          ctx.moveTo(-extent, y);
          ctx.lineTo(extent, y);
        }
        ctx.stroke();
        ctx.restore();
        path(e.points, true);
        ctx.stroke();
      } else ctx.stroke();
      if (e.type === "leader") {
        const a = screen(e.points[0]),
          b = screen(e.points[1]),
          ang = Math.atan2(b.y - a.y, b.x - a.x),
          size = Math.max(
            2,
            Math.min(14, (e.height || 120) * 0.75 * getCamera().scale),
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
