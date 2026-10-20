/** Cosmetic only: inventory and points remain owned by Game until the flight completes. */
export function recyclingFlight(sources: Element[], target: Element, reduced: boolean) {
  const layer = document.createElement('div');
  layer.className = 'loot-reclaim-layer';
  layer.setAttribute('aria-hidden', 'true');
  const end = target.getBoundingClientRect();
  const duration = reduced ? 0 : 700;
  if (!reduced) {
    document.body.append(layer);
    sources.forEach((source, index) => {
      source.classList.add('loot-dissolving');
      const rect = source.getBoundingClientRect();
      for (let n = 0; n < 4; n++) {
        const dot = document.createElement('i');
        const x = rect.left + rect.width / 2 + (n - 1.5) * 9;
        const y = rect.top + rect.height / 2 + (n % 2 ? 8 : -8);
        dot.style.cssText = `left:${x}px;top:${y}px;--reclaim-x:${end.left + end.width / 2 - x}px;--reclaim-y:${end.top + end.height / 2 - y}px;animation-delay:${Math.min(index, 5) * 18 + n * 16}ms`;
        layer.append(dot);
      }
    });
  }
  return {
    duration,
    cleanup: () => {
      layer.remove();
      sources.forEach((source) => source.classList.remove('loot-dissolving'));
    },
  };
}
