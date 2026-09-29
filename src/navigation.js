// WheelEvent has no reliable mouse-versus-trackpad device identifier.
// Keep the choice explicit; Ctrl+wheel is the browser's pinch signal.
export function wheelNavigation(event, device = "trackpad", pageHeight = 800) {
  const unit =
    event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? pageHeight : 1;
  const dx = event.deltaX * unit;
  const dy = event.deltaY * unit;
  if (event.ctrlKey || device === "mouse") {
    return {
      kind: "zoom",
      factor: Math.exp(
        -Math.max(-150, Math.min(150, dy)) * (event.ctrlKey ? 0.01 : 0.0015),
      ),
    };
  }
  return { kind: "pan", dx, dy };
}

export function commandSubmitKey(event, enteringText = false) {
  if (
    event.isComposing ||
    event.repeat ||
    event.ctrlKey ||
    event.metaKey ||
    event.altKey
  )
    return false;
  return event.key === "Enter" || (event.key === " " && !enteringText);
}
