const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
let compile;
try {
  const ts = require('typescript');
  compile = (source) =>
    ts.transpileModule(source, {
      compilerOptions: { target: ts.ScriptTarget.ES2020 },
    }).outputText;
} catch {
  compile = require('node:module').stripTypeScriptTypes;
}
const base = {
  File,
  Blob,
  TextEncoder,
  TextDecoder,
  Uint8Array,
  Uint32Array,
  DataView,
  AbortController,
  DOMException,
  setTimeout,
  console,
  Error,
};
const signalCheck = (signal) => {
  if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
};
function context(source, bindings = {}) {
  const ctx = vm.createContext({ ...base, ...bindings });
  vm.runInContext(compile(source), ctx);
  return ctx;
}

async function main() {
  let groups = 0;
  const zipSource = read('src/client/lazy-app/Batch/zip.ts')
    .replace(/^import .*;\r?\n/, '')
    .replace('export async function', 'async function');
  const zipCtx = context(zipSource, { assertSignal: signalCheck });
  const files = [
    new File(['hello'], '图片.jpg'),
    new File(['second'], '图片.jpg'),
    new File([], '../empty.png'),
    new File(['case'], '图片.JPG'),
  ];
  const archive = await zipCtx.createZip(files, new AbortController().signal);
  const bytes = new Uint8Array(await archive.arrayBuffer());
  const view = new DataView(bytes.buffer);
  const names = [];
  let offset = 0;
  let index = 0;
  while (view.getUint32(offset, true) === 0x04034b50) {
    const size = view.getUint32(offset + 18, true);
    const nameLength = view.getUint16(offset + 26, true);
    assert.equal(view.getUint16(offset + 6, true), 0x800);
    names.push(
      new TextDecoder().decode(
        bytes.slice(offset + 30, offset + 30 + nameLength),
      ),
    );
    const payload = bytes.slice(
      offset + 30 + nameLength,
      offset + 30 + nameLength + size,
    );
    assert.equal(new TextDecoder().decode(payload), await files[index].text());
    if (index === 0)
      assert.equal(view.getUint32(offset + 14, true), 0x3610a686);
    offset += 30 + nameLength + size;
    index++;
  }
  assert.deepEqual(names, [
    '图片.jpg',
    '图片-2.jpg',
    '_empty.png',
    '图片-3.JPG',
  ]);
  assert.equal(view.getUint32(offset, true), 0x02014b50);
  assert.equal(view.getUint16(bytes.length - 12, true), files.length);
  assert.equal(view.getUint32(bytes.length - 6, true), offset);
  const abort = new AbortController();
  abort.abort();
  await assert.rejects(zipCtx.createZip(files, abort.signal), {
    name: 'AbortError',
  });
  await assert.rejects(
    zipCtx.createZip(Array(65536), new AbortController().signal),
    /数量/,
  );
  await assert.rejects(
    zipCtx.createZip(
      [{ name: 'huge.png', size: 0xffffffff }],
      new AbortController().signal,
    ),
    /4 GB/,
  );
  groups++;
  console.log(
    'PASS ZIP: UTF-8, duplicate names, payload, CRC, offsets, cancellation, ZIP32 limits',
  );

  const source = read('src/client/lazy-app/Batch/index.tsx');
  assert.equal(
    source.slice(source.indexOf('\n  render(')).includes('URL.createObjectURL'),
    false,
  );
  const batchCode =
    source
      .slice(source.indexOf('interface Props'), source.indexOf('\n  render('))
      .replace('export default class Batch', 'class Batch') +
    '\n}\nglobalThis.Batch = Batch;';
  let id = 0;
  const live = new Set();
  const urls = {
    createObjectURL() {
      const url = `blob:${id++}`;
      live.add(url);
      return url;
    },
    revokeObjectURL(url) {
      live.delete(url);
    },
  };
  class Component {
    constructor(props) {
      this.props = props;
    }
    setState(next) {
      this.state = { ...this.state, ...next };
    }
  }
  const encodedSettings = [];
  const encoder = (mimeType) => ({
    meta: { mimeType, defaultOptions: { quality: 90 } },
    encode: async (_signal, _bridge, data, options) => {
      encodedSettings.push({ mimeType, data, options });
      return new Uint8Array([1, 2]);
    },
  });
  const batchCtx = context(batchCode, {
    Component,
    URL: urls,
    WorkerBridge: class {},
    assertSignal: signalCheck,
    encoderMap: {
      mozJPEG: encoder('image/jpeg'),
      webP: encoder('image/webp'),
      oxiPNG: encoder('image/png'),
    },
    decodeImage: async () => ({ width: 300, height: 1 }),
    flattenAlpha: (data) => data,
    builtinResize: (data, sx, sy, sw, sh, width, height) => ({ width, height }),
  });
  const batch = new batchCtx.Batch({
    files: [files[0]],
    showSnack: () => Promise.resolve(''),
    onBack() {},
  });
  assert.equal(batch.state.format, 'image/webp');
  assert.equal(batch.state.quality, 90);
  assert.equal(batch.state.useResize, false);
  const defaultOutput = await batch.compressFile(
    files[0],
    new AbortController().signal,
    batch.state,
  );
  assert.equal(defaultOutput.type, 'image/webp');
  assert.equal(encodedSettings[0].options.quality, 90);
  assert.equal(encodedSettings[0].data.width, 300);
  assert.equal(encodedSettings[0].data.height, 1);
  batch.compressFile = async () =>
    new File(['old'], 'out.jpg', { type: 'image/jpeg' });
  await batch.onCompressAll();
  assert.ok(batch.state.items[0].compressed);
  batch.compressFile = async () => {
    throw new Error('failure');
  };
  await batch.onCompressAll();
  assert.equal(batch.state.items[0].compressed, undefined);
  assert.equal(batch.state.items[0].downloadUrl, undefined);
  assert.equal(batch.state.items[0].error, 'failure');
  batch.compressFile = async () =>
    new File(['new'], 'out.jpg', { type: 'image/jpeg' });
  await batch.onCompressAll();
  assert.equal(batch.state.items[0].error, undefined);
  const next = { ...batch.props, files: [files[1], files[2]] };
  batch.componentWillReceiveProps(next);
  batch.props = next;
  assert.equal(batch.state.items.length, 2);
  assert.equal(batch.state.items[0].file, files[1]);
  let finish;
  batch.compressFile = () =>
    new Promise((resolve) => {
      finish = resolve;
    });
  const pending = batch.onCompressAll();
  batch.onCancel();
  finish(new File(['cancelled'], 'cancelled.jpg'));
  await pending;
  assert.equal(batch.state.processing, false);
  assert.equal(batch.state.items[0].compressed, undefined);
  const invalidSettings = { ...batch.state, useResize: true, maxWidth: -1 };
  batch.setState(invalidSettings);
  await batch.onCompressAll();
  assert.equal(batch.state.processing, false);
  const encoded = await batchCtx.Batch.prototype.compressFile.call(
    batch,
    files[0],
    new AbortController().signal,
    { ...batch.state, useResize: true, maxWidth: 1, format: 'image/webp' },
  );
  assert.equal(encoded.type, 'image/webp');
  assert.equal(encoded.name, '图片.webp');
  batch.componentWillUnmount();
  assert.equal(live.size, 0);
  groups++;
  console.log(
    'PASS batch: WebP90 defaults without resize, retries, new files, cancellation, width validation, output MIME, URL cleanup',
  );

  const compress = read('src/client/lazy-app/Compress/index.tsx');
  assert.match(
    compress,
    /type: 'webP',\s+options: encoderMap\.webP\.meta\.defaultOptions/,
  );
  for (const type of ['webP', 'mozJPEG']) {
    const metadata = read(`src/features/encoders/${type}/shared/meta.ts`);
    const options = context(
      metadata
        .slice(metadata.indexOf('export const defaultOptions'))
        .replace(
          'export const defaultOptions: EncodeOptions =',
          'globalThis.options =',
        ),
      { MozJpegColorSpace: { YCbCr: 1 } },
    ).options;
    assert.equal(options.quality, 90);
    if (type === 'webP') {
      assert.equal(options.method, 4);
      assert.equal(options.alpha_quality, 100);
    }
  }
  const reset = compress.slice(
    compress.indexOf('function stateForNewSourceData'),
    compress.indexOf('\n/**\n * If two processors'),
  );
  const equivalent = compress.slice(
    compress.indexOf('function processorStateEquivalent'),
    compress.indexOf('\nconst loadingIndicator'),
  );
  const clean = read('src/client/lazy-app/util/clean-modify.ts').replace(
    /export function/g,
    'function',
  );
  const resetCtx = context(clean + '\n' + reset + '\n' + equivalent, {
    URL: urls,
  });
  const old = {
    sides: [
      { file: 'old-left', downloadUrl: 'blob:left' },
      { file: 'old-right', downloadUrl: 'blob:right' },
    ],
  };
  const cleared = resetCtx.stateForNewSourceData(old);
  assert.equal(cleared.sides[0].file, undefined);
  assert.equal(cleared.sides[1].file, undefined);
  assert.equal(old.sides[0].file, 'old-left');
  const processors = {
    resize: { enabled: true },
    quantize: { enabled: false },
  };
  assert.equal(
    resetCtx.processorStateEquivalent(processors, { ...processors }),
    true,
  );
  groups++;
  console.log(
    'PASS single editor: both sides cleared, immutable reset, equivalent processors',
  );

  const util = read('src/client/lazy-app/util/index.ts');
  const abortCode = util
    .slice(util.indexOf('export async function abortable'))
    .replace('export async function', 'async function');
  const abortCtx = context(abortCode, { assertSignal: signalCheck });
  const ac = new AbortController();
  let listeners = 0;
  const add = ac.signal.addEventListener.bind(ac.signal);
  const remove = ac.signal.removeEventListener.bind(ac.signal);
  ac.signal.addEventListener = (...args) => {
    listeners++;
    return add(...args);
  };
  ac.signal.removeEventListener = (...args) => {
    listeners--;
    return remove(...args);
  };
  assert.equal(await abortCtx.abortable(ac.signal, Promise.resolve(42)), 42);
  assert.equal(listeners, 0);
  const waiting = abortCtx.abortable(ac.signal, new Promise(() => {}));
  ac.abort();
  await assert.rejects(waiting, { name: 'AbortError' });
  assert.equal(listeners, 0);
  groups++;
  console.log('PASS abort listeners: removed on completion and cancellation');
  const sw = read('src/sw/to-cache.ts');
  assert.ok(sw.includes('batch.main') && sw.includes('...batch.deps'));
  assert.ok(sw.includes('threads()') && !sw.includes('checkThreadsSupport()'));
  assert.ok(
    sw.includes('addWithDeps(oxi);') && sw.includes('addWithDeps(oxiMt);'),
  );
  const filesCtx = context(
    read('src/shared/image-files.ts').replace(/export /g, ''),
  );
  assert.equal(filesCtx.isImageFile(new File(['qoi'], 'image.qoi')), true);
  assert.equal(filesCtx.isImageFile(new File(['data'], 'file.txt')), false);
  groups++;
  console.log('PASS offline batch resources and image input filtering');
  const defaults = {
    resize: { enabled: false, width: 1, height: 1 },
    quantize: { enabled: false, colors: 256 },
  };
  let storage = '{invalid';
  const settingsCtx = context(
    read('src/client/lazy-app/Compress/settings.ts')
      .replace(/^import .*;\r?\n/gm, '')
      .replace(/export /g, ''),
    {
      defaultProcessorState: defaults,
      encoderMap: { mozJPEG: { meta: { defaultOptions: { quality: 90 } } } },
      localStorage: {
        getItem: () => storage,
        setItem: (_key, value) => {
          storage = value;
        },
      },
      window: { dispatchEvent() {} },
      CustomEvent: class {},
    },
  );
  assert.equal(settingsCtx.readSavedSettings(0), undefined);
  storage = JSON.stringify({
    latestSettings: { processorState: {}, encoderState: { type: 'unknown' } },
  });
  assert.equal(settingsCtx.readSavedSettings(0), undefined);
  const savedSettings = {
    processorState: defaults,
    encoderState: { type: 'mozJPEG', options: { quality: 80 } },
  };
  assert.equal(settingsCtx.saveSettings(1, savedSettings), true);
  assert.equal(
    settingsCtx.readSavedSettings(1).encoderState.options.quality,
    80,
  );
  settingsCtx.localStorage.getItem = () => {
    throw Error('Storage disabled');
  };
  assert.equal(settingsCtx.readSavedSettings(0), undefined);
  settingsCtx.localStorage.setItem = () => {
    throw Error('Storage full');
  };
  assert.equal(settingsCtx.saveSettings(0, savedSettings), false);
  groups++;
  console.log(
    'PASS saved settings: invalid JSON, invalid shape, round trip, blocked/full storage',
  );
  console.log(`${groups} regression groups passed`);
}
main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
