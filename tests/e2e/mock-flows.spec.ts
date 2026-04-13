import { expect, test, type Page } from '@playwright/test';

const STARTUP_SPLASH_SESSION_KEY = 'tapdance-startup-dismissed';
const MOCK_MODE_SESSION_KEY = 'tapdance-use-mock-mode';

function trackDialogs(page: Page) {
  const messages: string[] = [];
  page.on('dialog', async (dialog) => {
    messages.push(dialog.message());
    await dialog.dismiss();
  });
  return messages;
}

async function openWorkspace(page: Page, options?: { useMockMode?: boolean }) {
  await page.addInitScript(
    ({ useMockMode, startupSplashSessionKey, mockModeSessionKey }) => {
      window.sessionStorage.setItem(startupSplashSessionKey, '1');
      if (useMockMode) {
        window.sessionStorage.setItem(mockModeSessionKey, '1');
        return;
      }
      window.sessionStorage.removeItem(mockModeSessionKey);
    },
    {
      useMockMode: options?.useMockMode ?? false,
      startupSplashSessionKey: STARTUP_SPLASH_SESSION_KEY,
      mockModeSessionKey: MOCK_MODE_SESSION_KEY,
    },
  );
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '视频制作' })).toBeVisible();
}

async function createProject(page: Page, cardPattern: RegExp) {
  await page.getByRole('button', { name: cardPattern }).click();
  await page.getByRole('button', { name: '创建项目' }).click();
}

test.describe('mock browser flows', () => {
  test('covers the creative workflow end to end with mock content', async ({ page }) => {
    test.setTimeout(60_000);
    const dialogs = trackDialogs(page);

    await openWorkspace(page, { useMockMode: true });
    await createProject(page, /故事、资产、分镜与生成/);

    await expect(page.getByPlaceholder('例如：在一个赛博朋克世界里，落魄调酒师发现自己被追杀，逃进雨夜霓虹街道，最后在天台举枪反抗。')).toBeVisible();
    await page.getByPlaceholder('例如：在一个赛博朋克世界里，落魄调酒师发现自己被追杀，逃进雨夜霓虹街道，最后在天台举枪反抗。').fill(
      '深夜霓虹街道里，落魄调酒师被追兵逼到天台，最后在暴雨中反击，电影感、紧张、写实。',
    );
    await page.getByRole('button', { name: '生成简报' }).click();

    await expect(page.getByText('创意简报')).toBeVisible();
    await page.waitForFunction(() => document.querySelectorAll('[data-testid^="asset-delete-"]').length > 0);

    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-testid^="asset-delete-"]'));
      if (buttons.length === 0) {
        throw new Error('No creative asset delete buttons found.');
      }
      buttons.forEach((button) => button.click());
    });
    await page.waitForFunction(() => document.querySelectorAll('[data-testid^="asset-delete-"]').length === 0);

    const generateShotsButton = page.getByRole('button', { name: '生成分镜列表' }).first();
    await expect(generateShotsButton).toBeEnabled({ timeout: 20_000 });
    await generateShotsButton.click();
    await expect(page.getByRole('heading', { name: '分镜列表' })).toBeVisible();

    await page.locator('[data-testid^="shot-generate-prompts-"]').first().click();
    await expect(page.getByText('首帧图像提示词 (Pro)')).toBeVisible();

    await page.locator('[data-testid^="shot-generate-first-frame-"]').first().click();
    await expect(page.getByRole('img', { name: 'Shot 1 First Frame' })).toBeVisible();
    await page.locator('[data-testid^="shot-generate-last-frame-"]').first().click();
    await expect(page.getByRole('img', { name: 'Shot 1 Last Frame' })).toBeVisible();

    await page.getByRole('button', { name: '视频生成' }).click();
    await expect(page.getByRole('heading', { name: '视频生成', exact: true })).toBeVisible();
    await page.locator('[data-testid^="shot-generate-video-"]').first().click();

    await expect(page.locator('video')).toHaveCount(1, { timeout: 20_000 });
    await expect(page.getByText('生成完成')).toBeVisible();
    expect(dialogs).toEqual([]);
  });

  test('covers the fast workflow end to end with mock content', async ({ page }) => {
    test.setTimeout(45_000);
    const dialogs = trackDialogs(page);

    await openWorkspace(page, { useMockMode: true });
    await createProject(page, /一句提示词全能参考视频生成/);

    await expect(page.getByPlaceholder('例如：一间临海日式客房从黄昏缓慢过渡到深夜，房间布局保持一致，最后出现静坐的少女，电影感、克制、写实。')).toBeVisible();
    await page.getByPlaceholder('例如：一间临海日式客房从黄昏缓慢过渡到深夜，房间布局保持一致，最后出现静坐的少女，电影感、克制、写实。').fill(
      '暮色中的咖啡馆吧台，镜头从空镜推进到店员端出一杯冒着冷雾的气泡饮，电影感、写实、克制。',
    );
    await page.getByRole('button', { name: '先生成分镜图' }).click();

    await expect(page.getByText('开场分镜')).toBeVisible();
    await expect(page.getByText('推进分镜')).toBeVisible();
    const generateSceneButtons = page.getByRole('button', { name: '生成分镜图' });
    await generateSceneButtons.nth(0).click();
    await expect(page.getByRole('img', { name: '开场分镜' })).toBeVisible();
    await generateSceneButtons.nth(1).click();
    await expect(page.getByRole('img', { name: '推进分镜' })).toBeVisible();
    await page.getByRole('button', { name: '进入视频生成' }).click();

    await expect(page.getByRole('button', { name: '生成视频' })).toBeVisible();
    await page.getByRole('button', { name: '生成视频' }).click();

    await expect(page.getByText(/mock-\d+/)).toBeVisible();
    await expect(page.getByText('云端状态 · 已完成')).toBeVisible();
    await expect(page.locator('video')).toHaveCount(1);
    expect(dialogs).toEqual([]);
  });

  test('opens fast video generation directly without creating storyboard images', async ({ page }) => {
    const dialogs = trackDialogs(page);

    await openWorkspace(page, { useMockMode: true });
    await createProject(page, /一句提示词全能参考视频生成/);

    const promptInput = page.getByPlaceholder('例如：一间临海日式客房从黄昏缓慢过渡到深夜，房间布局保持一致，最后出现静坐的少女，电影感、克制、写实。');
    await expect(promptInput).toBeVisible();
    await promptInput.fill('一只白色机械鸟掠过清晨的玻璃温室，镜头低角度跟随，写实，电影感。');

    await page.getByRole('button', { name: '不生成分镜直接生成视频' }).click();

    await expect(page.getByText('视频提示词（中文）')).toBeVisible();
    await expect(page.getByText('一只白色机械鸟掠过清晨的玻璃温室').first()).toBeVisible();
    expect(dialogs).toEqual([]);
  });
});
