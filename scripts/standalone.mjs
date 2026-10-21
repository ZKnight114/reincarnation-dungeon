import { readFile, writeFile } from 'node:fs/promises';
const root = new URL('../', import.meta.url);
let html = await readFile(new URL('dist/index.html', root), 'utf8');
const script = html.match(/<script[^>]*src="([^"]+)"[^>]*><\/script>/)?.[1];
const stylesheet = html.match(/<link[^>]*href="([^"]+\.css)"[^>]*>/)?.[1];
if (!script || !stylesheet)
  throw new Error('Build the Vite project before creating the standalone file.');
let css = await readFile(new URL(`dist/${stylesheet.replace(/^\.\//, '')}`, root), 'utf8');
const scriptFile = new URL(`dist/${script.replace(/^\.\//, '')}`, root);
let js = await readFile(scriptFile, 'utf8');

// Vite emits sprite URLs relative to its JS bundle. Embed them here, keeping
// binary assets out of the normal web bundle and the editable game modules.
const spriteReferences = [
  ...js.matchAll(/new URL\("([^"\s]+\.(?:png|mp3|wav))",import\.meta\.url\)\.href/g),
];
for (const match of spriteReferences) {
  const asset = await readFile(new URL(match[1], scriptFile));
  const mime = match[1].endsWith('.mp3')
    ? 'audio/mpeg'
    : match[1].endsWith('.wav')
      ? 'audio/wav'
      : 'image/png';
  js = js.replaceAll(match[0], JSON.stringify(`data:${mime};base64,${asset.toString('base64')}`));
}
if (/new URL\([^)]*,import\.meta\.url\)\.href/.test(js)) {
  throw new Error('Standalone build contains an unresolved asset URL. Update the embedding step.');
}
// The offline edition uses system fonts, avoiding megabytes of base64 fonts.
css = css.replace(/@font-face\s*\{[^}]*\}/g, '');
// Inline the pixel backgrounds/panel textures as well as the sprite imports.
for (const match of [...css.matchAll(/url\((['"]?)([^)'"\s]+)\1\)/g)]) {
  const url = match[2];
  if (url.startsWith('data:')) continue;
  const asset = await readFile(
    new URL(url, new URL(`dist/${stylesheet.replace(/^\.\//, '')}`, root)),
  );
  const mime = url.endsWith('.png') ? 'image/png' : 'image/svg+xml';
  css = css.replaceAll(match[0], `url(data:${mime};base64,${asset.toString('base64')})`);
}
html = html
  .replace(/<script[^>]*src="[^"]+"[^>]*><\/script>/, '')
  .replace(/<link[^>]*href="[^"]+\.css"[^>]*>/, () => `<style>${css}</style>`)
  .replace(
    '</body>',
    () => `<script type="module">${js.replaceAll('</script', '<\\/script')}</script></body>`,
  );
// Keep generated source line endings consistent across Windows and CI builds.
html = html.replace(/\r\n?/g, '\n');
await writeFile(new URL('轮回地牢.html', root), html);
console.log(`Standalone demo: 轮回地牢.html (${Math.round(Buffer.byteLength(html) / 1024)} KB)`);
