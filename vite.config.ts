import { defineConfig, type Plugin } from 'vite';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

function assetManifest(): Plugin {
  return {
    name: 'guild-media-cache',
    apply: 'build',
    generateBundle(_, bundle) {
      const hash = (source: string | Uint8Array) =>
        createHash('sha256').update(source).digest('hex');
      const assets = Object.values(bundle)
        .filter((file) => file.type === 'asset' && /\.(png|mp3|wav)$/.test(file.fileName))
        .map((file) => {
          if (file.type !== 'asset') throw new Error('Expected media asset');
          return {
            url: './' + file.fileName,
            hash: hash(file.source),
            size: Buffer.byteLength(file.source),
          };
        })
        .sort((a, b) => a.url.localeCompare(b.url));
      // Cold-start packages reduce request overhead in embedded mobile browsers.
      // Warm caches keep using individual hashes so updates never redownload a package.
      const packs: {
        url: string;
        hash: string;
        size: number;
        assets: { url: string; hash: string; offset: number; size: number }[];
      }[] = [];
      let pieces: Buffer[] = [],
        entries: (typeof packs)[number]['assets'] = [],
        size = 0;
      const flush = () => {
        if (!entries.length) return;
        const bytes = Buffer.concat(pieces),
          digest = hash(bytes);
        const fileName = `assets/media-${packs.length}-${digest.slice(0, 12)}.bin`;
        this.emitFile({ type: 'asset', fileName, source: bytes });
        packs.push({ url: './' + fileName, hash: digest, size, assets: entries });
        pieces = [];
        entries = [];
        size = 0;
      };
      for (const asset of assets) {
        if (size && size + asset.size > 768 * 1024) flush();
        const file = bundle[asset.url.slice(2)];
        if (file.type !== 'asset') throw new Error('Expected media bytes');
        const bytes = Buffer.from(file.source);
        entries.push({ ...asset, offset: size });
        pieces.push(bytes);
        size += bytes.length;
      }
      flush();
      const manifest = JSON.stringify({
        version: 1,
        revision: hash(JSON.stringify(assets)),
        assets,
        packs,
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
