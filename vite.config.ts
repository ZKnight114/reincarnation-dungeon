import { defineConfig, type Plugin } from 'vite';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

function assetManifest(): Plugin {
  return {
    name: 'guild-image-cache',
    apply: 'build',
    generateBundle(_, bundle) {
      const hash = (source: string | Uint8Array) =>
        createHash('sha256').update(source).digest('hex');
      const assets = Object.values(bundle)
        .filter((file) => file.type === 'asset' && file.fileName.endsWith('.png'))
        .map((file) => {
          if (file.type !== 'asset') throw new Error('Expected image asset');
          return {
            url: './' + file.fileName,
            hash: hash(file.source),
            size: Buffer.byteLength(file.source),
          };
        })
        .sort((a, b) => a.url.localeCompare(b.url));
      const manifest = JSON.stringify({
        version: 1,
        revision: hash(JSON.stringify(assets)),
        assets,
      });
      this.emitFile({ type: 'asset', fileName: 'asset-manifest.json', source: manifest });
      const template = readFileSync(new URL('./scripts/asset-worker.js', import.meta.url), 'utf8');
      this.emitFile({
        type: 'asset',
        fileName: 'asset-worker.js',
        source: template.replace('__ASSET_MANIFEST__', manifest),
      });
    },
  };
}
export default defineConfig({
  base: './',
  publicDir: false,
  server: { port: 5173, strictPort: true },
  build: { assetsInlineLimit: 0 },
  plugins: [assetManifest()],
});
