// Host-supplied font metrics keep shared text geometry independent of Canvas/DOM.
// Node and unsupported hosts use the same deterministic geometric fallback.
let provider = null;
export function configureTextMetrics(next) {
  provider = next;
}
export function measureText(text, style, height) {
  return provider
    ? provider.measure(text, style, height)
    : text.length * height * 0.65;
}
export function textEmSize(style, height) {
  return provider ? provider.emSize(style, height) : height / 0.72;
}
