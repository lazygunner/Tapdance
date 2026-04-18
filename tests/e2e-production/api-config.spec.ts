import { expect, test, type Page } from '@playwright/test';

const STARTUP_SPLASH_SESSION_KEY = 'tapdance-startup-dismissed';

async function openApiConfig(page: Page) {
  await page.addInitScript((startupSplashSessionKey) => {
    window.sessionStorage.setItem(startupSplashSessionKey, '1');
  }, STARTUP_SPLASH_SESSION_KEY);

  await page.goto('/');
  await expect(page.getByRole('heading', { name: '视频制作' })).toBeVisible();
  await page.getByRole('button', { name: /API 配置/ }).click();
  await expect(page.getByRole('heading', { name: '默认模型配置' })).toBeVisible();
}

test.describe('production API configuration smoke checks', () => {
  test('keeps critical API configuration regions visible in production build', async ({ page }) => {
    await openApiConfig(page);

    await expect(page.getByRole('heading', { name: '连接配置' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Google Gemini API' })).toBeVisible();
    await expect(page.getByRole('heading', { name: '字节火山引擎 API' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Seedance 2.0 CLI' })).toBeVisible();
    await expect(page.getByRole('heading', { name: '火山 TOS 对象存储配置' })).toBeVisible();
    await expect(page.getByRole('link', { name: '官方文档' })).toHaveAttribute('href', 'https://jimeng.jianying.com/ai-tool/install');
    await expect(page.getByRole('button', { name: /重新检查|检查中/ })).toBeVisible();

    await expect(page.getByRole('heading', { name: '本地 MOCK API Server' })).toHaveCount(0);
  });
});
