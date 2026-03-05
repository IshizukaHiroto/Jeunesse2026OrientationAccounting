const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

async function main() {
  const baseUrl = process.argv[2];
  const outputMp4 = process.argv[3];
  const rawDir = process.argv[4];

  if (!baseUrl || !outputMp4 || !rawDir) {
    throw new Error('usage: node record-dashboard.cjs <baseUrl> <outputMp4> <rawDir>');
  }

  fs.mkdirSync(path.dirname(outputMp4), { recursive: true });
  fs.mkdirSync(rawDir, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    recordVideo: {
      dir: rawDir,
      size: { width: 390, height: 844 }
    }
  });

  const page = await context.newPage();
  const video = page.video();

  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);

  await page.click('#manual-refresh-btn');
  await page.waitForTimeout(2500);

  const summaries = page.locator('summary.section-summary');
  const summaryCount = await summaries.count();

  for (let i = 0; i < summaryCount; i += 1) {
    await summaries.nth(i).click();
    await page.waitForTimeout(500);
  }

  for (let i = summaryCount - 1; i >= 0; i -= 1) {
    await summaries.nth(i).click();
    await page.waitForTimeout(500);
  }

  await page.evaluate(() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }));
  await page.waitForTimeout(1800);
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
  await page.waitForTimeout(1400);

  await context.close();
  await browser.close();

  const recordedPath = await video.path();
  fs.copyFileSync(recordedPath, outputMp4.replace(/\.mp4$/, '.webm'));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
