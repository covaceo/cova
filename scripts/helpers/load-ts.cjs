// Local, dependency-preserving source loader for executable regressions.
const { existsSync, readFileSync } = require('node:fs');
const { resolve, dirname } = require('node:path');
const ts = require('typescript');
const cache = new Map();
module.exports = function loadSource(path) {
  path = resolve(path);
  if (cache.has(path)) return cache.get(path).exports;
  const module = { exports: {} }; cache.set(path, module);
  const code = ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText;
  const localRequire = name => {
    if (!name.startsWith('.')) return require(name);
    const base = resolve(dirname(path), name);
    const candidate = [base, `${base}.ts`, `${base}.tsx`].find(existsSync);
    if (!candidate) throw new Error(`Missing module ${base}`);
    return module.exports && loadSource(candidate);
  };
  new Function('module', 'exports', 'require', code)(module, module.exports, localRequire);
  return module.exports;
};
