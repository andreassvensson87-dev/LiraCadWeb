import { dist } from "../model/geometry.js";

// Preview movement and completion are separate decisions. A quick first click
// only anchors the window, even if the pointer travels a long way during it.
const dragHoldMs = 250;
function moved(gesture, pixel) {
  return dist(pixel, gesture.start) > (gesture.phase === "pressed" ? 4 : 0);
}
function heldDrag(gesture, pixel, timeStamp) {
  if (!gesture.moved && !moved(gesture, pixel)) return false;
  if (!Number.isFinite(gesture.pressedAt) || !Number.isFinite(timeStamp))
    return true;
  return timeStamp - gesture.pressedAt >= dragHoldMs;
}
export function beginSelectionGesture(pixel, world, shift = false, timeStamp) {
  return {
    kind: "select",
    start: { ...pixel },
    world: { ...world },
    shift,
    moved: false,
    phase: "pressed",
    pressedAt: timeStamp,
  };
}
export function moveSelectionGesture(gesture, pixel, timeStamp) {
  return {
    ...gesture,
    moved: gesture.moved || moved(gesture, pixel),
  };
}
export function releaseSelectionGesture(
  gesture,
  pixel,
  world,
  hitId,
  timeStamp,
) {
  if (
    gesture.phase === "finish" ||
    (gesture.phase === "pressed" && heldDrag(gesture, pixel, timeStamp))
  )
    return {
      kind: "rectangle",
      shift: gesture.shift,
      crossing: pixel.x < gesture.start.x,
      region: {
        minX: Math.min(gesture.world.x, world.x),
        maxX: Math.max(gesture.world.x, world.x),
        minY: Math.min(gesture.world.y, world.y),
        maxY: Math.max(gesture.world.y, world.y),
      },
    };
  const target = gesture.hitId === undefined ? hitId : gesture.hitId;
  if (target) return { kind: "click", id: target, shift: gesture.shift };
  return {
    kind: "pending",
    gesture: {
      ...gesture,
      phase: "corner",
      moved: gesture.moved || moved(gesture, pixel),
    },
  };
}
