import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {adapterFile} from '../src/platform.mjs';

const code = fs.readFileSync(adapterFile, 'utf8');
function client() {
  const layer = { __value: { enable_i18n: false, untouched: 'original' },
    get(field, fallback) { return field in this.__value ? this.__value[field] : fallback; } };
  return { layer, object: { getLayer(name) { return name === '72216192' ? layer : { name, get: () => 'other' }; } } };
}
test('only internal app pages receive the adapter', () => {
  for (const location of [{ protocol: 'https:', hostname: '-' }, { protocol: 'app:', hostname: 'external' }]) {
    const context = vm.createContext({ location }); vm.runInContext(code, context);
    assert.equal(context.__codexZhLauncher, undefined);
  }
});
test('translation gate changes; other layers, fields and original objects stay intact', () => {
  const { object, layer } = client();
  const context = vm.createContext({ location: { protocol: 'app:', hostname: '-' }, __STATSIG__: { firstInstance: object, instances: { a: object } } });
  vm.runInContext(code, context);
  assert.equal(object.getLayer('72216192').get('enable_i18n', false), true);
  assert.equal(object.getLayer('72216192').get('untouched', false), 'original');
  assert.equal(object.getLayer('72216192').get('missing', 'fallback'), 'fallback');
  assert.equal(object.getLayer('other').get(), 'other');
  assert.equal(layer.__value.enable_i18n, false);
});
test('late SDK instances and reassigned methods are covered once', () => {
  const context = vm.createContext({ location: { protocol: 'app:', hostname: '-' } });
  vm.runInContext(code, context);
  context.__STATSIG__ = { instances: {} };
  const first = client().object, second = client().object;
  context.__STATSIG__.firstInstance = first;
  context.__STATSIG__.instances.second = second;
  assert.equal(first.getLayer('72216192').get('enable_i18n'), true);
  assert.equal(second.getLayer('72216192').get('enable_i18n'), true);
  first.getLayer = () => ({ get: (field, fallback) => fallback });
  assert.equal(first.getLayer('72216192').get('enable_i18n', false), true);
  vm.runInContext(code, context);
  assert.equal(context.__codexZhLauncher.clients, 2);
});
