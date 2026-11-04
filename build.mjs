// Single-command build: `npm run build` -> dist/crestline.html (fully self-contained).
// Also: `node build.mjs --test <entry.ts> <out.mjs>` bundles a Node test script.
import * as esbuild from 'esbuild-wasm';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);

if (args[0] === '--test') {
  await esbuild.build({
    entryPoints: [path.join(root, args[1])],
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node18',
    outfile: path.join(root, args[2]),
    logLevel: 'warning',
  });
  process.exit(0);
}

const dev = args.includes('--dev');
const t0 = Date.now();
const result = await esbuild.build({
  entryPoints: [path.join(root, 'src/main.ts')],
  bundle: true,
  format: 'iife',
  target: 'es2022',
  minify: !dev,
  write: false,
  legalComments: 'none',
  loader: { '.woff2': 'base64', '.css': 'text' },
  define: { __BUILD_TIME__: JSON.stringify(new Date().toISOString()), __DEV__: String(dev) },
  logLevel: 'warning',
});
let js = result.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const template = fs.readFileSync(path.join(root, 'src/index.html'), 'utf8');
const html = template.replace('/*__SCRIPT__*/', () => js);
fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
const out = path.join(root, 'dist/crestline.html');
fs.writeFileSync(out, html);
console.log(`built ${path.relative(root, out)}  ${(html.length / 1024).toFixed(0)} KB  in ${Date.now() - t0} ms`);
