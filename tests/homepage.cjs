const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const output = path.resolve(
  process.env.TEST_OUTPUT || path.join(__dirname, '../temp/homepage'),
);
const baseURL = process.env.BASE_URL || 'http://127.0.0.1:5000';

function check(target) {
  let current = target;
  while (!fs.existsSync(current)) current = path.dirname(current);
  for (;;) {
    assert.equal(fs.lstatSync(current).isSymbolicLink(), false);
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
}
check(output);
assert.equal(fs.existsSync(output), false, 'Use a fresh output directory');
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
      { width: 768, height: 1024 },
      { width: 844, height: 390 },
      { width: 1440, height: 900 },
      { width: 2560, height: 1440 },
    ]) {
      const context = await browser.newContext({
        viewport,
        serviceWorkers: 'block',
        hasTouch: viewport.width < 900,
      });
      const page = await context.newPage();
      await page.goto(baseURL);
      const upload = page.getByRole('button', {
        name: '选择图片',
        exact: true,
      });
      await upload.waitFor();
      await page.evaluate(() => {
        const event = new Event('beforeinstallprompt', { cancelable: true });
        event.prompt = () => Promise.resolve();
        event.userChoice = Promise.resolve({ outcome: 'dismissed' });
        dispatchEvent(event);
      });
      await page.getByRole('button', { name: '安装', exact: true }).waitFor();
      assert.equal(
        await page.getByRole('button', { name: '粘贴', exact: true }).count(),
        0,
      );
      const invalid = await page.evaluate(() => {
        const bad = [];
        for (const el of document.querySelectorAll(
          'header, h1, button, main img',
        )) {
          const r = el.getBoundingClientRect();
          if (r.width && (r.left < -1 || r.right > innerWidth + 1))
            bad.push(el.tagName + ' overflow');
          if (el.tagName === 'BUTTON' && (r.width < 44 || r.height < 44))
            bad.push('small target');
        }
        if (
          [...document.querySelectorAll('main img')].some(
            (img) => !img.complete || !img.naturalWidth,
          )
        )
          bad.push('broken image');
        return bad;
      });
      assert.deepEqual(invalid, []);
      await upload.focus();
      assert.equal(
        await upload.evaluate((el) => getComputedStyle(el).outlineStyle),
        'solid',
      );
      const chooser = page.waitForEvent('filechooser');
      await upload.press('Enter');
      await chooser;
      if (viewport.width === 390) {
        const tapChooser = page.waitForEvent('filechooser');
        await upload.tap({ position: { x: 16, y: 16 } });
        await tapChooser;
      }
      await page.screenshot({
        path: path.join(output, `homepage-${viewport.width}.png`),
        fullPage: true,
      });
      await context.close();
      console.log(
        `PASS homepage ${viewport.width}x${viewport.height}: images, install layout, targets, focus, file picker`,
      );
    }

    for (const [label, name] of [
      ['插画', 'artwork.webp'],
      ['屏幕截图', 'screen.webp'],
      ['摄影', 'photo.webp'],
    ]) {
      const context = await browser.newContext({ serviceWorkers: 'block' });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', (err) => errors.push(err.message));
      await page.goto(baseURL);
      await page.getByRole('button', { name: `压缩${label}示例` }).click();
      await page.waitForFunction(
        (name) =>
          [...document.querySelectorAll('a[download]')].some(
            (a) =>
              a.download === name &&
              a.href.startsWith('blob:') &&
              a.getAttribute('aria-disabled') !== 'true',
          ),
        name,
        { timeout: 120000 },
      );
      assert.deepEqual(errors, []);
      await context.close();
      console.log(`PASS ${label}: actual default WebP output ready`);
    }

    const context = await browser.newContext({ serviceWorkers: 'block' });
    const page = await context.newPage();
    await page.route('**/demo-artwork-*.jpg', (route) => route.abort());
    await page.goto(baseURL);
    const example = page.getByRole('button', { name: '压缩插画示例' });
    await example.click();
    await page
      .getByText('示例图片加载失败，请重试或选择自己的图片', { exact: true })
      .waitFor();
    await example.waitFor({ state: 'visible' });
    assert.equal(await example.isEnabled(), true);
    await page.unroute('**/demo-artwork-*.jpg');
    let release;
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    await page.route('**/demo-artwork-*.jpg', async (route) => {
      await gate;
      await route.abort().catch(() => {});
    });
    await example.click();
    await page.locator('button[aria-busy=true]').waitFor();
    const chooser = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: '选择图片', exact: true }).click();
    await chooser;
    assert.equal(await example.isEnabled(), true);
    release();
    await page.unrouteAll({ behavior: 'wait' });
    await context.close();
    console.log(
      'PASS example failure and cancellation: retries remain available',
    );
  } finally {
    await browser.close();
  }
}
main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
