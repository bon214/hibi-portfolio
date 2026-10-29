import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../analytics.js', import.meta.url), 'utf8');
function load(hostname, pathname) {
  const inserted = [];
  const context = {
    location: { hostname, pathname },
    window: {},
    document: { createElement: () => ({}), head: { appendChild: (element) => inserted.push(element) } },
  };
  vm.runInNewContext(source, context);
  return { inserted, data: context.window.dataLayer };
}

const production = load('bon214.github.io', '/hibi-portfolio/');
assert.equal(production.inserted.length, 1, 'Load exactly one Google tag on the published site');
assert.equal(production.inserted[0].async, true);
assert.equal(production.inserted[0].src, 'https://www.googletagmanager.com/gtag/js?id=G-MW6Z7G6R04');
assert.equal(production.data.filter((entry) => entry[0] === 'config').length, 1);
assert.equal(production.data.find((entry) => entry[0] === 'config')[1], 'G-MW6Z7G6R04');
assert.equal(load('127.0.0.1', '/').inserted.length, 0, 'Do not count local previews');
assert.equal(load('bon214.github.io', '/another-site/').inserted.length, 0, 'Do not count other sites');
console.log('Analytics setup checks passed');
