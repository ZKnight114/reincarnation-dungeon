/** Cosmetic only: inventory and points remain owned by Game until the flight completes. */
export function recyclingFlight(
  sources: Element[],
  target: Element,
  reduced: boolean,
  onArrival: () => void = () => {},
) {
  const layer = document.createElement('div');
  layer.className = 'loot-reclaim-layer';
  layer.setAttribute('aria-hidden', 'true');
  const end = target.getBoundingClientRect();
  const duration = reduced ? 0 : 700;
  let cancelled = false;
  if (!reduced) {
    document.body.append(layer);
    sources.forEach((source, index) => {
      source.classList.add('loot-dissolving');
      const rect = source.getBoundingClientRect();
      const dot = document.createElement('i');
      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;
      // One equipment, one point. Keep the whole transfer below 700ms even for large batches.
      const delay = 80 + index * Math.min(65, 160 / Math.max(1, sources.length - 1));
      dot.style.cssText = `left:${x}px;top:${y}px;--reclaim-x:${end.left + end.width / 2 - x}px;--reclaim-y:${end.top + end.height / 2 - y}px;animation-delay:${delay}ms`;
      dot.addEventListener(
        'animationend',
        () => {
          if (!cancelled) onArrival();
        },
        { once: true },
      );
      layer.append(dot);
    });
  }
  return {
    duration,
    cleanup: () => {
      cancelled = true;
      layer.remove();
      sources.forEach((source) => source.classList.remove('loot-dissolving'));
    },
  };
}
