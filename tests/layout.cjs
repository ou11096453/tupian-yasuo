const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '..');
const output = path.resolve(process.env.TEST_OUTPUT || path.join(root, 'temp'));
function checkPath(target) {
  let current = target;
  while (!fs.existsSync(current)) current = path.dirname(current);
  while (true) {
    if (fs.lstatSync(current).isSymbolicLink())
      throw new Error(`Linked path: ${current}`);
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
}
checkPath(output);
fs.mkdirSync(output, { recursive: true });
const css = fs.readFileSync(
  path.join(root, 'src/client/lazy-app/Batch/style.css'),
  'utf8',
);
const introCss = fs
  .readFileSync(
    path.join(root, 'src/shared/prerendered-app/Intro/style.css'),
    'utf8',
  )
  .replace(/composes:[^;]+;/g, '');
const img = `data:image/png;base64,${fs
  .readFileSync(path.join(root, 'src/static-build/assets/icon-small.png'))
  .toString('base64')}`;
const logo = `data:image/svg+xml;base64,${fs
  .readFileSync(
    path.join(root, 'src/shared/prerendered-app/Intro/imgs/logo.svg'),
  )
  .toString('base64')}`;
const pageHead = (style) =>
  `<html lang="zh-CN"><head><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>body{margin:0} ${style}</style></head><body>`;
const batch =
  pageHead(css) +
  `<section class="batch">
<header class="header"><button class="backBtn" aria-label="返回"><svg></svg></button><h1>批量压缩</h1><span class="count">20 张</span><button class="settingsToggle"><svg></svg><span class="buttonLabel">设置</span></button><button class="addBtn"><svg></svg><span class="buttonLabel">添加图片</span></button></header>
<div class="workspace"><aside id="batch-settings" class="controls"><h2>压缩设置</h2><label class="settingItem"><span>输出格式</span><select><option>JPEG</option><option>WebP</option><option>PNG</option></select></label><label class="settingItem"><span>质量 <strong>75%</strong></span><input type="range"></label><label class="toggleLabel"><input type="checkbox">限制最大宽度</label><label class="settingItem"><span>最大宽度 / px</span><input type="number" value="1920"></label></aside>
<main class="content"><div class="summary" role="status"><span>已完成 20/20，失败 1 张</span><strong>123.45 MB → 61.72 MB<span class="saved">节省 50%</span></strong></div><progress class="progress" max="20" value="20"></progress><ul class="itemList">${Array.from(
    { length: 20 },
    (_, i) =>
      `<li class="item"><img class="thumb" src="${img}" alt=""><div class="info"><div class="name" title="long filename">超长文件名称用于检查手机与电脑的截断以及布局-${i}-abcdefghijklmnopqrstuv.png</div><div class="sizes">123.45 MB → 61.72 MB</div>${
        i === 1
          ? '<span class="error">无法解码图片：this-is-a-very-long-error-message-with-no-space-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx</span>'
          : ''
      }</div><span class="itemStatus saved">${
        i === 1 ? '失败' : '-50%'
      }</span><div class="itemActions"><a class="iconBtn" aria-label="下载">↓</a><button class="iconBtn" aria-label="移除">−</button></div></li>`,
  ).join('')}</ul></main></div>
<footer class="actionBar"><button class="compressBtn">重新压缩</button><a class="downloadBtn">下载 ZIP</a></footer></section></body></html>`;
const intro =
  pageHead(introCss) +
  `<div class="intro" style="position:absolute;inset:0"><div class="main"><h1 class="logo-container"><img class="logo" src="${logo}" alt=""><span>在线图片压缩</span></h1><div class="load-img"><div class="load-img-content"><button class="load-btn">选择图片</button></div></div></div><button class="install-btn">安装</button></div></body></html>`;

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
      const page = await browser.newPage({ viewport });
      for (const [name, html] of [
        ['batch', batch],
        ['intro', intro],
      ]) {
        await page.setContent(html);
        await page
          .locator('img')
          .first()
          .evaluate((img) => img.decode());
        assert.equal(
          await page.evaluate(
            () => document.documentElement.scrollWidth > innerWidth,
          ),
          false,
        );
        if (name === 'batch') {
          const overflow = await page
            .locator('.batch')
            .evaluate((el) => el.scrollWidth > el.clientWidth + 1);
          assert.equal(
            overflow,
            false,
            `${viewport.width} horizontal overflow`,
          );
          const footer = await page.locator('.actionBar').boundingBox();
          assert.ok(footer.y + footer.height <= viewport.height + 1);
          const buttons = await page
            .locator('.header button,.actionBar button,.iconBtn')
            .evaluateAll((els) =>
              els.map((el) => el.getBoundingClientRect().height),
            );
          assert.ok(buttons.every((height) => height === 0 || height >= 44));
          if (viewport.width < 800) {
            assert.equal(await page.locator('.controls').isVisible(), false);
            await page
              .locator('.controls')
              .evaluate((el) => el.classList.add('open'));
            assert.equal(await page.locator('.controls').isVisible(), true);
          } else
            assert.equal(await page.locator('.controls').isVisible(), true);
        }
        const target = path.join(
          output,
          `${name}-${viewport.width}x${viewport.height}.png`,
        );
        checkPath(target);
        await page.screenshot({ path: target });
        console.log(
          `PASS source CSS layout ${name} ${viewport.width}x${viewport.height}`,
        );
      }
      await page.close();
    }
  } finally {
    await browser.close();
  }
}
main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
