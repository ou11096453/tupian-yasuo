const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '..');
const baseURL = process.env.BASE_URL || 'http://127.0.0.1:5000';
const icon = fs.readFileSync(
  path.join(root, 'src/static-build/assets/icon-small.png'),
);
const file = (name, buffer, mimeType = 'image/png') => ({
  name,
  buffer,
  mimeType,
});
const qoi = Buffer.from(
  '716f696600000001000000010400ffff0000ff0000000000000001',
  'hex',
);
const svg = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 64"><rect x="64" width="64" height="64" fill="red"/></svg>',
);
async function drop(page, files) {
  await page.locator('file-drop').evaluate(
    (el, values) => {
      const event = new Event('filedrop');
      event.files = values.map(
        ({ name, base64, mimeType }) =>
          new File(
            [Uint8Array.from(atob(base64), (char) => char.charCodeAt(0))],
            name,
            { type: mimeType },
          ),
      );
      el.dispatchEvent(event);
    },
    files.map(({ name, buffer, mimeType }) => ({
      name,
      base64: buffer.toString('base64'),
      mimeType,
    })),
  );
}
async function compressed(page, start = '开始压缩') {
  await page.getByRole('button', { name: start, exact: true }).click();
  await page
    .getByRole('button', { name: '重新压缩', exact: true })
    .waitFor({ timeout: 120000 });
}
async function pixels(link) {
  return link.evaluate(async (el) => {
    const blob = await (await fetch(el.href)).blob();
    const bitmap = await createImageBitmap(blob);
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(bitmap, 0, 0);
    const first = Array.from(ctx.getImageData(0, 0, 1, 1).data);
    const result = {
      type: blob.type,
      width: bitmap.width,
      height: bitmap.height,
      first,
    };
    bitmap.close();
    canvas.width = canvas.height = 1;
    return result;
  });
}
async function main() {
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.BROWSER_EXECUTABLE,
  });
  try {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      reducedMotion: 'reduce',
    });
    const page = await context.newPage();
    const errors = [];
    const failedRequests = [];
    page.on('pageerror', (err) => errors.push(err.message));
    page.on('requestfailed', (request) => failedRequests.push(request.url()));
    await context.addInitScript(() => {
      localStorage.setItem('leftSideSettings', '{invalid');
      localStorage.setItem(
        'rightSideSettings',
        '{"latestSettings":{"processorState":{}}}',
      );
    });
    await page.goto(baseURL);
    await page.getByRole('button', { name: '选择图片' }).waitFor();
    await page
      .locator('input[type=file]')
      .first()
      .setInputFiles([
        file('transparent.svg', svg, 'image/svg+xml'),
        file('decoder.qoi', qoi, 'image/qoi'),
        file(
          'decoder.webp',
          fs.readFileSync(path.join(root, 'src/sw/tiny.webp')),
          'image/webp',
        ),
        file(
          'decoder.avif',
          fs.readFileSync(path.join(root, 'src/sw/tiny.avif')),
          'image/avif',
        ),
      ]);
    await page.getByRole('heading', { name: '批量压缩' }).waitFor();
    await page.getByRole('button', { name: '压缩设置', exact: true }).click();
    await page.locator('#batch-settings select').selectOption('image/jpeg');
    await page.getByRole('checkbox', { name: '限制最大宽度' }).check();
    await page.getByRole('spinbutton').fill('32');
    await compressed(page);
    assert.equal(await page.locator('ul a[download]').count(), 4);
    const jpeg = await pixels(page.locator('ul a[download]').first());
    assert.equal(jpeg.type, 'image/jpeg');
    assert.equal(jpeg.width, 32);
    assert.equal(jpeg.height, 16);
    assert.ok(
      jpeg.first.every((value) => value > 245),
      JSON.stringify(jpeg),
    );
    await page.getByRole('spinbutton').fill('0');
    await page.getByRole('button', { name: '重新压缩', exact: true }).click();
    assert.equal(
      await page.getByRole('button', { name: '取消压缩', exact: true }).count(),
      0,
    );
    await page.getByRole('spinbutton').fill('32');
    await drop(page, [
      file('invalid.svg', Buffer.from('<svg/>'), 'image/svg+xml'),
      file('working.png', icon),
    ]);
    await compressed(page);
    assert.equal(await page.locator('ul a[download]').count(), 1);
    assert.ok(
      (await page.locator('[role=status]').allTextContents())
        .join(' ')
        .includes('失败 1 张'),
    );
    await drop(page, [file('single-alpha.svg', svg, 'image/svg+xml')]);
    await page.waitForFunction(
      () =>
        [...document.querySelectorAll('a[download]')].filter(
          (el) =>
            el.href.startsWith('blob:') &&
            el.getAttribute('aria-disabled') !== 'true',
        ).length === 2,
      null,
      { timeout: 120000 },
    );
    await page
      .locator('select:has(option[value="webP"])')
      .last()
      .selectOption('mozJPEG');
    await page.waitForFunction(
      () =>
        [...document.querySelectorAll('a[download$=".jpg"]')].some(
          (el) =>
            el.href.startsWith('blob:') &&
            el.getAttribute('aria-disabled') !== 'true',
        ),
      null,
      { timeout: 120000 },
    );
    assert.equal(
      await page
        .locator('range-input[name="quality"]')
        .evaluate((el) => el.value),
      '90',
    );
    const single = await pixels(page.locator('a[download$=".jpg"]'));
    assert.equal(single.width, 128);
    assert.ok(
      single.first.every((value) => value > 245),
      JSON.stringify(single),
    );
    await page.getByRole('button', { name: '返回', exact: true }).click();
    await page.getByRole('button', { name: '选择图片' }).waitFor();
    await page.waitForFunction(
      async () => {
        if (!navigator.serviceWorker.controller) return false;
        const requests = (
          await Promise.all(
            (
              await caches.keys()
            ).map(async (key) => (await caches.open(key)).keys()),
          )
        ).flat();
        const urls = requests.map((request) => request.url);
        return (
          urls.some((url) => /mozjpeg.*\.wasm/.test(url)) &&
          urls.some((url) => /oxipng.*\.wasm/.test(url)) &&
          urls.some((url) => /webp_enc.*\.wasm/.test(url))
        );
      },
      null,
      { timeout: 120000 },
    );
    await context.setOffline(true);
    await page.reload();
    await page.getByRole('button', { name: '选择图片' }).waitFor();
    await page
      .locator('input[type=file]')
      .first()
      .setInputFiles([file('offline1.png', icon), file('offline2.png', icon)]);
    await compressed(page);
    assert.equal(await page.locator('ul a[download]').count(), 2);
    await page.getByRole('button', { name: '压缩设置', exact: true }).click();
    for (const format of ['image/jpeg', 'image/webp', 'image/png']) {
      await page.locator('#batch-settings select').selectOption(format);
      await compressed(page, '重新压缩');
      assert.equal(
        await page.locator('ul a[download]').count(),
        2,
        JSON.stringify({
          format,
          statuses: await page.locator('[role=status]').allTextContents(),
          failedRequests,
        }),
      );
      assert.equal(
        (await pixels(page.locator('ul a[download]').first())).type,
        format,
      );
    }
    assert.equal(errors.length, 0, errors.join('\n'));
    await context.close();
    console.log(
      'PASS SVG/QOI/WebP/AVIF input, resize, JPEG alpha, invalid SVG/settings, reduced motion, offline reload and JPEG/WebP/PNG',
    );
  } finally {
    await browser.close();
  }
}
main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
