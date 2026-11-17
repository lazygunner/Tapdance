import { expect, test, type Page } from '@playwright/test';

async function openCanvas(page: Page) {
  // Exercise the real persistence client against a deterministic bridge contract,
  // without touching the user's local database or external providers.
  const state = new Map<string, unknown>();
  await page.route('**/api/seedance/state/**', async (route) => {
    const key = decodeURIComponent(new URL(route.request().url()).pathname.split('/state/')[1]);
    if (route.request().method() === 'PUT') state.set(key, route.request().postDataJSON().value);
    await route.fulfill({ json: { key, value: state.get(key) ?? null, updatedAt: null } });
  });
  await page.route('**/api/seedance/assets/save', async (route) => {
    const body = route.request().postDataJSON();
    await route.fulfill({ json: { kind: body.kind, rootPath: '/test', relativePath: `${body.assetId}.png`, absolutePath: '/test/result', fileName: 'result', url: body.sourceUrl || `data:${body.mimeType};base64,${body.dataBase64}` } });
  });
  await page.route('**/api/seedance/assets/config', (route) => route.fulfill({ json: { rootPath: '/test', defaultRootPath: '/test', usingDefaultPath: true } }));
  await page.addInitScript(() => {
    sessionStorage.setItem('tapdance-startup-dismissed', '1');
    sessionStorage.setItem('tapdance-use-mock-mode', '1');
  });
  await page.goto('/');
  await page.getByRole('button', { name: /自由编排文字、图片、音频与视频/ }).click();
  await page.getByRole('button', { name: '创建项目', exact: true }).click();
  await expect(page.getByRole('region', { name: '无限画布编辑器' })).toBeVisible();
  return state;
}
const cards = (page: Page) => page.locator('[data-canvas-node-id]');
const editor = (page: Page) => page.getByRole('region', { name: '无限画布编辑器' });
const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';

test('canvas groups, duplicates, undo and recycle restore persist across reopening', async ({ page }) => {
  await openCanvas(page);
  await editor(page).getByRole('button', { name: '图片', exact: true }).click();
  await editor(page).getByRole('button', { name: '视频', exact: true }).click();
  await expect(cards(page)).toHaveCount(2);
  await editor(page).focus();
  await page.keyboard.press(`${modifier}+a`);
  await page.getByRole('button', { name: '成组', exact: true }).click();
  await expect(page.locator('.canvas-group-frame')).toHaveCount(1);
  await page.keyboard.press(`${modifier}+d`);
  await expect(cards(page)).toHaveCount(4);
  await page.getByRole('button', { name: '撤销', exact: true }).click();
  await expect(cards(page)).toHaveCount(2);
  await page.getByRole('button', { name: '重做', exact: true }).click();
  await expect(cards(page)).toHaveCount(4);
  await editor(page).focus();
  await page.keyboard.press(`${modifier}+a`);
  await page.keyboard.press('Delete');
  await page.getByRole('button', { name: '移入回收站', exact: true }).click();
  await expect(cards(page)).toHaveCount(0);
  await page.getByRole('button', { name: '画布回收站', exact: true }).click();
  await page.getByRole('button', { name: '恢复', exact: true }).click();
  await page.getByRole('button', { name: '关闭画布回收站' }).click();
  await expect(cards(page)).toHaveCount(4);
  await page.getByRole('button', { name: '画布小地图', exact: true }).click();
  await expect(page.locator('.canvas-minimap')).toBeVisible();
  await page.getByRole('button', { name: '整理画布', exact: true }).click();
  await page.getByRole('button', { name: '复位视口', exact: true }).click();
  await expect(editor(page).locator('.canvas-topbar')).toBeInViewport();
  expect(await editor(page).evaluate((element) => element.scrollTop)).toBe(0);
  await page.screenshot({ path: 'tmp/canvas-desktop.png' });
  // Allow the existing project storage debounce to finish before reloading.
  await page.waitForTimeout(1200);
  await page.reload();
  // App can resume either its saved view or the project list.
  await page.getByText(/个画布节点/).first().click();
  await expect(cards(page)).toHaveCount(4);
});

test('text input keeps native shortcuts, mock generation works and dialogs block canvas deletion', async ({ page }) => {
  await openCanvas(page);
  await editor(page).getByRole('button', { name: '文字', exact: true }).click();
  const input = page.getByRole('textbox', { name: '文字内容' });
  await input.fill('雨中的咖啡馆，电影感');
  await input.press(`${modifier}+a`);
  await input.press('Backspace');
  await expect(cards(page)).toHaveCount(1);
  await input.fill('雨中的咖啡馆，电影感');
  await page.getByRole('button', { name: '生成文字', exact: true }).click();
  await expect(input).toHaveValue(/Mock response:/);
  await page.locator('input[type="file"]').setInputFiles({ name: 'invalid.pdf', mimeType: 'application/pdf', buffer: Buffer.from('invalid') });
  await expect(page.getByRole('status')).toContainText('仅支持图片、音频或视频文件');
  await page.getByRole('button', { name: '关闭提示' }).click();
  await page.getByRole('button', { name: '删除节点', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press(`${modifier}+a`);
  await page.keyboard.press('Backspace');
  await page.getByRole('button', { name: '取消', exact: true }).click();
  await expect(cards(page)).toHaveCount(1);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.evaluate(() => window.getSelection()?.removeAllRanges());
  await page.setViewportSize({ width: 720, height: 820 });
  await editor(page).scrollIntoViewIfNeeded();
  await page.getByRole('button', { name: '复位视口', exact: true }).click();
  await page.screenshot({ path: 'tmp/canvas-narrow.png' });
});

test('wheel pans and modifier zooms; Shift selection and drag move a group together', async ({ page }) => {
  await openCanvas(page);
  await editor(page).getByRole('button', { name: '图片', exact: true }).click();
  await editor(page).getByRole('button', { name: '视频', exact: true }).click();
  await page.getByRole('button', { name: '整理画布', exact: true }).click();
  await page.getByRole('button', { name: '复位视口', exact: true }).click();
  const surface = page.getByTestId('infinite-canvas-surface');
  const before = await surface.getAttribute('style');
  await surface.hover({ position: { x: 60, y: 180 } });
  await page.mouse.wheel(0, 50);
  await expect(surface).not.toHaveAttribute('style', before!);
  const zoom = await page.locator('.infinite-canvas-zoom').textContent();
  await page.keyboard.down(modifier);
  await page.mouse.wheel(0, -100);
  await page.keyboard.up(modifier);
  await expect(page.locator('.infinite-canvas-zoom')).not.toHaveText(zoom!);
  await page.getByRole('button', { name: '复位视口', exact: true }).click();
  const first = await cards(page).nth(0).boundingBox();
  const second = await cards(page).nth(1).boundingBox();
  await page.mouse.click(first!.x + 4, first!.y + 5);
  await page.keyboard.down('Shift');
  await page.mouse.click(second!.x + 4, second!.y + 5);
  await page.keyboard.up('Shift');
  await expect(page.locator('[data-canvas-node-id][data-selected="true"]')).toHaveCount(2);
  const positions = await cards(page).evaluateAll((elements) => elements.map((element) => ({ x: (element as HTMLElement).style.left, y: (element as HTMLElement).style.top })));
  await page.mouse.move(first!.x + 4, first!.y + 5);
  await page.mouse.down();
  await page.mouse.move(first!.x + 49, first!.y + 39, { steps: 6 });
  await page.mouse.up();
  const moved = await cards(page).evaluateAll((elements) => elements.map((element) => ({ x: (element as HTMLElement).style.left, y: (element as HTMLElement).style.top })));
  expect(parseFloat(moved[0].x) - parseFloat(positions[0].x)).toBeCloseTo(parseFloat(moved[1].x) - parseFloat(positions[1].x));
  expect(moved[0]).not.toEqual(positions[0]);
});

test('imports images, orders references, generates mock video and supports the light theme', async ({ page }) => {
  const state = await openCanvas(page);
  const bytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
  await page.locator('input[type="file"]').setInputFiles({ name: '参考一.png', mimeType: 'image/png', buffer: bytes });
  await page.locator('input[type="file"]').setInputFiles({ name: '参考二.png', mimeType: 'image/png', buffer: bytes });
  await editor(page).getByRole('button', { name: '视频', exact: true }).click();
  await expect(cards(page)).toHaveCount(3);
  await page.getByRole('button', { name: '添加参考节点', exact: true }).click();
  await page.getByRole('option', { name: '参考一.png', exact: true }).click();
  await page.getByRole('button', { name: '添加参考节点', exact: true }).click();
  await page.getByRole('option', { name: '参考二.png', exact: true }).click();
  await page.getByRole('button', { name: '上移参考二.png' }).click();
  await expect(page.locator('.canvas-reference-inspector li').first()).toContainText('参考二.png');
  await page.getByRole('button', { name: '高级创作配置', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('textbox', { name: '视频提示词' }).fill('雨中的咖啡馆，镜头缓慢推进');
  await page.getByRole('button', { name: '生成视频', exact: true }).first().click();
  await expect(page.getByText('正在生成…', { exact: true })).toBeVisible();
  await expect(cards(page).last().locator('video')).toHaveCount(1, { timeout: 15_000 });
  await page.getByRole('button', { name: '切换画布主题' }).click();
  await expect(page.locator('.app-shell')).toHaveClass(/theme-light/);
  await page.getByRole('button', { name: '复位视口', exact: true }).click();
  await page.screenshot({ path: 'tmp/canvas-light.png' });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(page.locator('.infinite-canvas-edge-particle').first()).toBeHidden();
  await page.setViewportSize({ width: 430, height: 850 });
  await page.getByRole('button', { name: '复位视口', exact: true }).click();
  await page.screenshot({ path: 'tmp/canvas-phone.png' });
  // Resume an accepted video task after a fresh mount, without creating a new job.
  await expect.poll(() => {
    const projects = state.get('projects') as Array<{ canvasFlow: { nodes: Array<{ type: string; status: string }> } }> | undefined;
    return projects?.[0]?.canvasFlow.nodes.find((node) => node.type === 'video')?.status;
  }).toBe('completed');
  const persisted = state.get('projects') as Array<{ canvasFlow: { nodes: Array<Record<string, unknown>> } }>;
  const pending = persisted[0].canvasFlow.nodes.find((node) => node.type === 'video')!;
  Object.assign(pending, { status: 'generating', mediaUrl: '', taskId: 'operations/mock-resume', pendingTask: { provider: 'gemini', id: 'operations/mock-resume', mock: true } });
  await page.reload();
  await page.getByText(/个画布节点/).first().click();
  await expect(cards(page).last().locator('video')).toHaveCount(1, { timeout: 15_000 });
});

test('selecting a media node exposes the NiegeIP composer and creates images directly', async ({ page }) => {
  await openCanvas(page);
  await editor(page).getByRole('button', { name: '图片', exact: true }).click();
  const composer = page.getByTestId('canvas-creation-composer');
  await expect(composer).toBeVisible();
  await expect(composer.getByText('图片创作', { exact: true })).toBeVisible();
  await expect(composer.getByRole('button', { name: '生成图片', exact: true })).toBeDisabled();
  const prompt = composer.getByRole('textbox', { name: '图片创作提示词' });
  await prompt.fill('一杯清晨窗边的咖啡，暖色光线');
  await composer.getByRole('button', { name: '生成参数', exact: true }).click();
  await page.getByRole('button', { name: '3:4', exact: true }).click();
  await page.getByRole('button', { name: '2 张', exact: true }).click();
  await page.getByRole('button', { name: '关闭生成参数', exact: true }).click();
  await composer.getByRole('button', { name: '生成图片', exact: true }).click();
  await expect(composer.getByRole('button', { name: '生成中…', exact: true })).toBeDisabled();
  await expect(cards(page)).toHaveCount(2);
  await expect(cards(page).locator('.canvas-node__media > img')).toHaveCount(2, { timeout: 15_000 });
  await expect(composer.getByRole('button', { name: '生成图片', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: '整理画布', exact: true }).click();
  await page.getByRole('button', { name: '复位视口', exact: true }).click();
  // Deselect on an empty part of the surface, then use an ordinary card click.
  await page.getByTestId('infinite-canvas-surface').click({ position: { x: 20, y: 165 } });
  await expect(composer).toHaveCount(0);
  await cards(page).first().locator('.canvas-node__header').click({ position: { x: 3, y: 5 } });
  await expect(composer).toBeVisible();
  await expect(composer.getByRole('textbox', { name: '图片创作提示词' })).toContainText('一杯清晨窗边的咖啡');
  await page.screenshot({ path: 'tmp/canvas-image-composer.png' });
});

test('composer mentions current canvas media, switches nodes and generates video without an extra dialog', async ({ page }) => {
  const state = await openCanvas(page);
  const bytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
  await page.locator('input[type="file"]').setInputFiles({ name: '咖啡参考.png', mimeType: 'image/png', buffer: bytes });
  await expect(cards(page)).toHaveCount(1);
  await editor(page).getByRole('button', { name: '视频', exact: true }).click();
  const composer = page.getByTestId('canvas-creation-composer');
  await expect(composer.getByText('视频创作', { exact: true })).toBeVisible();
  const prompt = composer.getByRole('textbox', { name: '视频创作提示词' });
  await prompt.fill('@');
  await prompt.press('End');
  await prompt.press('ArrowRight');
  await expect(page.getByRole('listbox', { name: '可引用素材' })).toBeVisible();
  await page.getByRole('option', { name: /咖啡参考/ }).click();
  await prompt.press('End');
  await page.keyboard.insertText(' 镜头缓慢推进');
  await expect(composer.getByTestId('canvas-composer-reference')).toHaveCount(1);
  await expect(prompt.locator('[data-prompt-token]')).toHaveCount(1);
  await composer.getByRole('button', { name: '生成视频', exact: true }).click();
  await expect(cards(page).last().locator('video')).toHaveCount(1, { timeout: 15_000 });
  await expect.poll(() => {
    const projects = state.get('projects') as Array<{ canvasFlow: { nodes: Array<{ type: string; content: string; mentionNodeIds?: string[] }> } }> | undefined;
    return projects?.[0]?.canvasFlow.nodes.find((node) => node.type === 'video')?.mentionNodeIds?.length;
  }).toBe(1);
  await composer.getByRole('button', { name: '放大创作面板' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: '缩小创作面板' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.setViewportSize({ width: 430, height: 850 });
  await expect(composer.getByRole('textbox', { name: '视频创作提示词' })).toBeInViewport();
  await expect(composer.getByRole('button', { name: '生成视频', exact: true })).toBeInViewport();
  await page.screenshot({ path: 'tmp/canvas-composer-phone.png' });
});

test('adding a reference from the composer connects it to the creation target', async ({ page }) => {
  await openCanvas(page);
  await editor(page).getByRole('button', { name: '视频', exact: true }).click();
  const targetId = await cards(page).first().getAttribute('data-canvas-node-id');
  const composer = page.getByTestId('canvas-creation-composer');
  await composer.getByRole('button', { name: '添加创作参考素材' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  const bytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
  await page.locator('input[type="file"]').setInputFiles({ name: '参考图.png', mimeType: 'image/png', buffer: bytes });
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(cards(page)).toHaveCount(2);
  await expect(page.locator('[data-canvas-node-id][data-selected="true"]')).toHaveAttribute('data-canvas-node-id', targetId!);
  await expect(composer.getByTestId('canvas-composer-reference')).toHaveCount(1);
});

test('new Ark tiers appear in the composer with model-specific parameters', async ({ page }) => {
  await openCanvas(page);
  await editor(page).getByRole('button', { name: '视频', exact: true }).click();
  const composer = page.getByTestId('canvas-creation-composer');
  for (const name of ['Seedance 2.0 Mini', 'Seedance 2.5 Flash', 'Seedance 2.5']) {
    await composer.getByRole('button', { name: '选择生成模型' }).click();
    await page.getByRole('option', { name: new RegExp(`^${name.replaceAll('.', '\\.')} \\(`) }).click();
    await composer.getByRole('button', { name: '生成参数' }).click();
    const panel = page.getByRole('dialog', { name: '生成参数', exact: true });
    await expect(panel.getByRole('button', { name: '720p', exact: true })).toBeVisible();
    await expect(panel.getByRole('button', { name: '1080p', exact: true })).toHaveCount(name === 'Seedance 2.5' ? 1 : 0);
    await expect(panel.getByRole('button', { name: 'MOV', exact: true })).toHaveCount(name === 'Seedance 2.0 Mini' ? 0 : 1);
    await panel.press('Escape');
  }
  await editor(page).getByRole('button', { name: '图片', exact: true }).click();
  await composer.getByRole('button', { name: '选择生成模型' }).click();
  await expect(page.getByRole('option', { name: /^Seedream 5.5 / })).toBeVisible();
  await page.getByRole('option', { name: /^Seedream 5.5 / }).click();
  await expect(composer.getByRole('button', { name: '选择生成模型' })).toContainText('Seedream 5.5');
});
