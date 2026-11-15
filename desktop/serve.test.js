'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { resolveAppFile } = require('./serve');

const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'smallmart-serve-'));
const root = path.join(parent, 'web');
fs.mkdirSync(path.join(root, 'assets'), { recursive: true });
fs.writeFileSync(path.join(root, 'index.html'), '<html></html>');
fs.writeFileSync(path.join(root, 'main-ABC.js'), 'x');
fs.writeFileSync(path.join(root, 'assets', 'logo.png'), 'x');
fs.writeFileSync(path.join(parent, 'secret.txt'), 'top secret');   // next to the web folder, not inside it
test.after(() => fs.rmSync(parent, { recursive: true, force: true }));

const inRoot = (...parts) => path.join(root, ...parts);

test('sends a file that exists', () => {
  assert.equal(resolveAppFile(root, '/main-ABC.js'), inRoot('main-ABC.js'));
  assert.equal(resolveAppFile(root, '/assets/logo.png'), inRoot('assets', 'logo.png'));
  assert.equal(resolveAppFile(root, '/'), inRoot('index.html'));
});

test('sends index.html for screens of the app, so reloading any page works', () => {
  for (const screen of ['/orders', '/orders/0b8d0e4c-1b1c', '/shops/1/items/2/stock', '/login']) {
    assert.equal(resolveAppFile(root, screen), inRoot('index.html'), screen);
  }
});

test('a missing file with an extension is missing, not a screen', () => {
  assert.equal(resolveAppFile(root, '/nope.js'), null);
  assert.equal(resolveAppFile(root, '/assets/gone.png'), null);
});

test('cannot reach anything outside the web folder', () => {
  const attempts = [
    '/../secret.txt', '/../../secret.txt', '/assets/../../secret.txt', '/%2e%2e/secret.txt', '/%2e%2e%2fsecret.txt',
    '/..%2fsecret.txt', '/..\\secret.txt', '/assets\\..\\..\\secret.txt', '//secret.txt', '/./../secret.txt',
  ];
  for (const attempt of attempts) {
    const found = resolveAppFile(root, attempt);
    assert.ok(found === null || found.startsWith(root + path.sep), `${attempt} -> ${found}`);
    assert.notEqual(found && fs.readFileSync(found, 'utf8'), 'top secret', attempt);
  }
});

test('broken or hostile paths are refused', () => {
  assert.equal(resolveAppFile(root, '/%E0%A4%A'), null);   // incomplete %-sequence
  assert.equal(resolveAppFile(root, '/index.html\0.png'), null);
});

test('a folder is not sent as a file', () => {
  assert.equal(resolveAppFile(root, '/assets'), inRoot('index.html'));
});
