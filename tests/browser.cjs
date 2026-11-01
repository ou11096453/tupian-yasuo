const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '..');
const output = path.resolve(process.env.TEST_OUTPUT || path.join(root, 'temp'));
const baseURL = process.env.BASE_URL || 'http://127.0.0.1:5000';
const sample = fs.readFileSync(
  path.join(root, 'src/static-build/assets/icon-small.png'),
);
async function replaceFiles(page, files) {
  await page.locator('file-drop').evaluate(
    (element, values) => {
      const event = new Event('filedrop');
      event.files = values.map(
        ({ name, mimeType, base64 }) =>
          new File(
            [Uint8Array.from(atob(base64), (char) => char.charCodeAt(0))],
            name,
            { type: mimeType },
          ),
      );
      element.dispatchEvent(event);
    },
    files.map(({ name, mimeType, buffer }) => ({
      name,
      mimeType,
      base64: buffer.toString('base64'),
    })),
  );
}
function safeOutput(file) {
  let current = file;
  while (!fs.existsSync(current)) current = path.dirname(current);
  while (true) {
    if (fs.lstatSync(current).isSymbolicLink())
      throw new Error(`Linked path: ${current}`);
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return file;
}
safeOutput(output);
fs.mkdirSync(output, { recursive: true });

async function main() {
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.BROWSER_EXECUTABLE,
  });
  try {
    for (const viewport of [
      { width: 320, height: 640 },
      { width: 390, height: 844 },
      { width: 844, height: 390 },
      { width: 1440, height: 900 },
    ]) {
      const context = await browser.newContext({
        viewport,
        acceptDownloads: true,
      });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', (err) => errors.push(err.message));
      await page.goto(baseURL);
      await page.getByRole('button', { name: '选择图片' }).waitFor();
      assert.equal(
        await page.getByRole('button', { name: '粘贴', exact: true }).count(),
        0,
      );
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth + 1,
        ),
        false,
      );
      await page.screenshot({
        path: safeOutput(path.join(output, `app-intro-${viewport.width}.png`)),
      });
      await page
        .locator('input[type=file]')
        .first()
        .setInputFiles([
          {
            name: '超长测试图片-abcdefghijklmnopqrstuvwxyz.png',
            mimeType: 'image/png',
            buffer: sample,
          },
          { name: 'second.png', mimeType: 'image/png', buffer: sample },
        ]);
      await page.getByRole('heading', { name: '批量压缩' }).waitFor();
      assert.equal(
        await page.locator('#batch-settings select').inputValue(),
        'image/webp',
      );
      assert.equal(
        await page.locator('#batch-settings input[type=range]').inputValue(),
        '90',
      );
      assert.equal(
        await page.locator('#batch-settings input[type=checkbox]').isChecked(),
        false,
      );
      await page.getByRole('button', { name: '开始压缩', exact: true }).click();
      await page
        .getByRole('button', { name: '重新压缩', exact: true })
        .waitFor({ timeout: 120000 });
      assert.equal(await page.locator('ul a[download]').count(), 2);
      await page.getByRole('button', { name: /^打包下载/ }).click();
      await page.getByRole('link', { name: '下载 ZIP', exact: true }).waitFor();
      const downloadEvent = page.waitForEvent('download');
      await page.getByRole('link', { name: '下载 ZIP', exact: true }).click();
      const download = await downloadEvent;
      const downloaded = safeOutput(
        path.join(output, `batch-${viewport.width}.zip`),
      );
      await download.saveAs(downloaded);
      const data = fs.readFileSync(downloaded);
      assert.equal(data.readUInt32LE(0), 0x04034b50);
      assert.equal(data.readUInt16LE(data.length - 12), 2);
      assert.equal(
        await page
          .locator('section')
          .evaluate((el) => el.scrollWidth > el.clientWidth + 1),
        false,
      );
      await page.screenshot({
        path: safeOutput(path.join(output, `app-batch-${viewport.width}.png`)),
      });
      await page
        .locator('input[type=file]')
        .first()
        .setInputFiles([
          { name: 'added.png', mimeType: 'image/png', buffer: sample },
        ]);
      assert.equal(await page.locator('ul li').count(), 3);
      await page
        .getByRole('button', { name: '移除 added.png', exact: true })
        .click();
      assert.equal(await page.locator('ul li').count(), 2);
      await replaceFiles(page, [
        { name: 'replacement.png', mimeType: 'image/png', buffer: sample },
        {
          name: 'broken.png',
          mimeType: 'image/png',
          buffer: Buffer.alloc(1024 * 1024, 113),
        },
      ]);
      assert.equal(await page.locator('ul li').count(), 2);
      await page.getByRole('button', { name: '开始压缩', exact: true }).click();
      await page
        .getByRole('button', { name: '重新压缩', exact: true })
        .waitFor({ timeout: 120000 });
      assert.equal(await page.locator('ul a[download]').count(), 1);
      assert.ok(
        (await page.locator('[role=status]').allTextContents())
          .join(' ')
          .includes('失败 1 张'),
      );
      assert.equal(
        (await page.locator('[role=status]').first().textContent()).includes(
          'MB',
        ),
        false,
        'Failed originals must not inflate successful-file statistics',
      );
      if (viewport.width < 800)
        await page
          .getByRole('button', { name: '压缩设置', exact: true })
          .click();
      for (const format of ['image/jpeg', 'image/webp', 'image/png']) {
        await page.locator('#batch-settings select').selectOption(format);
        await replaceFiles(page, [
          { name: 'format.png', mimeType: 'image/png', buffer: sample },
          { name: 'format2.png', mimeType: 'image/png', buffer: sample },
        ]);
        await page
          .getByRole('button', { name: '开始压缩', exact: true })
          .click();
        await page
          .getByRole('button', { name: '重新压缩', exact: true })
          .waitFor({ timeout: 120000 });
        assert.equal(await page.locator('ul a[download]').count(), 2);
        const result = await page
          .locator('ul a[download]')
          .first()
          .evaluate(async (link) => {
            const blob = await (await fetch(link.href)).blob();
            const bitmap = await createImageBitmap(blob);
            const data = Array.from(
              new Uint8Array(await blob.arrayBuffer()).slice(0, 12),
            );
            const result = {
              type: blob.type,
              width: bitmap.width,
              height: bitmap.height,
              data,
            };
            bitmap.close();
            return result;
          });
        assert.equal(result.type, format);
        assert.ok(result.width > 0 && result.height > 0);
        if (format === 'image/png')
          assert.deepEqual(
            result.data.slice(0, 8),
            [137, 80, 78, 71, 13, 10, 26, 10],
          );
        else if (format === 'image/webp')
          assert.equal(Buffer.from(result.data.slice(8)).toString(), 'WEBP');
        else assert.deepEqual(result.data.slice(0, 2), [255, 216]);
      }
      await replaceFiles(
        page,
        Array.from({ length: 8 }, (_, i) => ({
          name: `cancel-${i}.png`,
          mimeType: 'image/png',
          buffer: sample,
        })),
      );
      await page.getByRole('button', { name: '开始压缩', exact: true }).click();
      await page.getByRole('button', { name: '取消压缩', exact: true }).click();
      assert.ok(
        (await page.locator('[role=status]').allTextContents())
          .join(' ')
          .includes('已取消'),
      );
      await replaceFiles(page, [
        { name: 'single.png', mimeType: 'image/png', buffer: sample },
      ]);
      await page.waitForFunction(
        () =>
          [...document.querySelectorAll('a[download]')].filter(
            (link) =>
              link.href.startsWith('blob:') &&
              link.getAttribute('aria-disabled') !== 'true',
          ).length === 2,
        null,
        { timeout: 120000 },
      );
      const outputEncoder = page
        .locator('select:has(option[value="webP"])')
        .last();
      assert.equal(await outputEncoder.inputValue(), 'webP');
      assert.equal(
        await page
          .locator('range-input[name="quality"]')
          .evaluate((el) => el.value),
        '90',
      );
      assert.equal(
        await page.locator('input[name="resize.enable"]:checked').count(),
        0,
      );
      assert.equal(
        await page.locator('input[name="quantize.enable"]:checked').count(),
        0,
      );
      await page.screenshot({
        path: safeOutput(path.join(output, `app-single-${viewport.width}.png`)),
      });
      const clipped = await page
        .locator(
          'select,button[title="保存当前侧设置"],button[title="导入已保存的设置"]',
        )
        .evaluateAll((elements) =>
          elements
            .filter((element) => {
              const rect = element.getBoundingClientRect();
              return (
                rect.height > 0 &&
                (rect.left < -1 || rect.right > innerWidth + 1)
              );
            })
            .map((element) => element.outerHTML),
        );
      assert.deepEqual(
        clipped,
        [],
        `Single editor clipped controls: ${clipped.join('\n')}`,
      );
      await replaceFiles(page, [
        { name: 'single-new.png', mimeType: 'image/png', buffer: sample },
      ]);
      await page.waitForFunction(
        () =>
          [...document.querySelectorAll('a[download]')].filter(
            (link) =>
              link.href.startsWith('blob:') &&
              link.getAttribute('aria-disabled') !== 'true',
          ).length === 2 &&
          [...document.querySelectorAll('a[download]')].every((link) =>
            link.download.startsWith('single-new.'),
          ),
        null,
        { timeout: 120000 },
      );
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth + 1,
        ),
        false,
      );
      assert.equal(errors.length, 0, errors.join('\n'));
      await context.close();
      console.log(
        `PASS actual app ${viewport.width}x${viewport.height}: JPEG/WebP/PNG, ZIP, add/remove, replacement, failure isolation, cancellation, single editor`,
      );
    }
  } finally {
    await browser.close();
  }
}
main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
