// Resource lookup lives separately from game rules and rendering templates.
// The web build emits PNG files; standalone.mjs embeds them only for the offline edition.
let files: Record<string, string> = {};
try {
  files = import.meta.glob(
    ['./assets/{W,M,R}-*.png', './assets/*-full.png', './assets/*-motion.png'],
    { eager: true, query: '?url', import: 'default' },
  ) as Record<string, string>;
} catch {
  // DOM tests run without Vite's import transform and cannot paint real sprites.
}

const transparentPlaceholder = 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=';

export function spriteUrl(name: string): string {
  return files[`./assets/${name}.png`] ?? transparentPlaceholder;
}
