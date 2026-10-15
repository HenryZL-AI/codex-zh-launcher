(() => {
  if (location.protocol !== 'app:' || location.hostname !== '-') return;
  const marker = '__codexZhLauncher';
  if (globalThis[marker]?.version === 1) return;
  globalThis[marker] = { version: 1, installed: true, intercepted: 0, clients: 0 };
  const clients = new WeakSet();
  const globals = new WeakSet();
  const registries = new WeakMap();
  function prepareClient(client) {
    if (!client || typeof client !== 'object' || clients.has(client)) return client;
    clients.add(client);
    globalThis[marker].clients += 1;
    let original = client.getLayer;
    let previous;
    let wrapped;
    Object.defineProperty(client, 'getLayer', {
      configurable: true, enumerable: true,
      get() {
        if (typeof original !== 'function') return original;
        if (previous !== original) {
          previous = original;
          wrapped = function (name, ...args) {
            const result = original.call(this, name, ...args);
            if (String(name) !== '72216192') return result;
            globalThis[marker].intercepted += 1;
            return { ...result, __value: { ...result.__value, enable_i18n: true },
              get(field, fallback) { return field === 'enable_i18n' ? true : result.get(field, fallback); } };
          };
        }
        return wrapped;
      },
      set(value) { original = value; },
    });
    return client;
  }
  function prepareRegistry(registry) {
    if (!registry || typeof registry !== 'object') return registry;
    if (registries.has(registry)) return registries.get(registry);
    const proxy = new Proxy(registry, {
      get(target, name, receiver) { return prepareClient(Reflect.get(target, name, receiver)); },
      set(target, name, value, receiver) { return Reflect.set(target, name, prepareClient(value), receiver); },
    });
    registries.set(registry, proxy); registries.set(proxy, proxy);
    for (const client of Object.values(registry)) prepareClient(client);
    return proxy;
  }
  function prepareGlobal(object) {
    if (!object || globals.has(object)) return object;
    globals.add(object);
    let first = prepareClient(object.firstInstance);
    let instances = prepareRegistry(object.instances);
    Object.defineProperty(object, 'firstInstance', { configurable: true, enumerable: true,
      get() { return prepareClient(first); }, set(value) { first = prepareClient(value); } });
    Object.defineProperty(object, 'instances', { configurable: true, enumerable: true,
      get() { return instances; }, set(value) { instances = prepareRegistry(value); } });
    return object;
  }
  let value = prepareGlobal(globalThis.__STATSIG__);
  Object.defineProperty(globalThis, '__STATSIG__', { configurable: true, enumerable: true,
    get() { return value; }, set(next) { value = prepareGlobal(next); } });
})();
