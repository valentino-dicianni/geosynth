// Shared by build.mjs and build-single.mjs: bundles ES modules (relative
// imports only) into the text of one classic script.
//
// Follows the import graph from the entry files, emits every module once,
// dependencies first, and strips import/export. Because everything ends up in
// one scope, top-level names must be unique across modules (a clash is a
// SyntaxError the first time the bundle runs, and the tests catch it).
import { readFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';

const importRe = /^import[\s\S]*?from\s+['"]([^'"]+)['"];?[ \t]*\r?\n/gm;
const exportRe = /^export\s+(?=(?:const|let|var|function|async|class)\b)/gm;

export function bundleModules(root, entries) {
  const seen = new Set();
  const order = [];
  const visit = (rel) => {
    if (seen.has(rel)) return;
    seen.add(rel);
    const src = readFileSync(join(root, rel), 'utf8');
    for (const m of src.matchAll(importRe)) {
      if (!m[1].startsWith('.')) throw new Error(`${rel}: only relative imports are supported ("${m[1]}")`);
      visit(relative(root, resolve(root, dirname(rel), m[1])).split(sep).join('/'));
    }
    order.push({ rel, src });
  };
  entries.forEach(visit);

  let code = '';
  for (const { rel, src } of order) {
    const body = src.replace(importRe, '').replace(exportRe, '');
    if (/^\s*(import|export)\b/m.test(body)) throw new Error(`${rel}: unhandled import/export left after stripping`);
    code += `\n/* ---- ${rel} ---- */\n${body}\n`;
  }
  return { code, files: order.map((o) => o.rel) };
}

export const wrapIife = (code) => '(function () {\n"use strict";\n' + code + '\n})();\n';
