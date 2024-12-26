#!/usr/bin/env node

import { argv } from 'node:process';
import * as esbuild from 'esbuild';

const productionMode = 'development' !== (argv[2] || process.env.NODE_ENV);

const build = await esbuild.context({
  define: { DEV: String(!productionMode) },
  // drop: productionMode ? ['console'] : [],
  dropLabels: productionMode ? ['DEV'] : [],
  minify: productionMode,
  sourcemap: !productionMode,
  entryPoints: productionMode ? ['site/*'] : ['site/*', 'manga*.json'],
  bundle: true,
  outbase: 'site',
  outdir: 'build',
  format: 'esm',
  globalName: 'script',
  loader: {
    '.html': 'copy',
    '.ico': 'copy',
    '.json': productionMode ? 'empty' : 'copy',
    '.png': 'copy',
    '.svg': 'copy',
    '.webp': 'copy',
    '.webmanifest': 'copy',
    '.xml': 'copy',
  },
  platform: 'browser',
  alias: {
    jose: productionMode
      ? 'https://cdnjs.cloudflare.com/ajax/libs/jose/5.9.6/util/decode_jwt.js'
      : 'jose',
    select2css: 'node_modules/select2/dist/css/select2.css',
  },
});

if (productionMode) {
  await build.rebuild();
  build.dispose();
} else {
  await build.watch();
  await build.serve({
    servedir: 'build',
    port: 8080,
  });
}
