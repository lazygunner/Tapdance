import test from 'node:test';
import assert from 'node:assert/strict';

import { startMockApiServer } from '../server/mockApiServer.mjs';

async function startTestMockApiServer(options: { port: number; scenario: string }) {
  try {
    return await startMockApiServer(options);
  } catch (error: any) {
    if (error?.code === 'EPERM' && error?.syscall === 'listen') {
      return null;
    }
    throw error;
  }
}

test('mock API server simulates Seedance CLI concurrency once and then accepts the next submit', async () => {
  const server = await startTestMockApiServer({ port: 0, scenario: 'concurrency_once' });
  if (!server) {
    return;
  }

  try {
    const firstResponse = await fetch(`${server.baseUrl}/api/seedance/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        projectId: 'project-1',
        prompt: '本地 mock 并发测试',
        options: {
          modelVersion: 'seedance2.0fast',
          ratio: '16:9',
          duration: 4,
          videoResolution: '720p',
        },
      }),
    });
    const firstPayload = await firstResponse.json();
    assert.equal(firstResponse.ok, true);
    assert.equal(firstPayload.genStatus, 'fail');
    assert.match(firstPayload.raw.fail_reason, /ret=1310, message=ExceedConcurrencyLimit/u);

    const secondResponse = await fetch(`${server.baseUrl}/api/seedance/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        projectId: 'project-1',
        prompt: '本地 mock 成功测试',
        options: {
          modelVersion: 'seedance2.0fast',
          ratio: '16:9',
          duration: 4,
          videoResolution: '720p',
        },
      }),
    });
    const secondPayload = await secondResponse.json();
    assert.equal(secondResponse.ok, true);
    assert.match(secondPayload.submitId, /^mock-submit-/u);
    assert.equal(secondPayload.genStatus, 'success');

    const taskResponse = await fetch(`${server.baseUrl}/api/seedance/task/${secondPayload.submitId}`);
    const taskPayload = await taskResponse.json();
    assert.equal(taskPayload.genStatus, 'success');
    assert.equal(taskPayload.downloadedFiles.length, 1);
  } finally {
    await server.close();
  }
});

test('mock API server returns OpenAI-compatible chat JSON for fast video plan prompts', async () => {
  const server = await startTestMockApiServer({ port: 0, scenario: 'success' });
  if (!server) {
    return;
  }

  try {
    const response = await fetch(`${server.baseUrl}/api/v3/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer mock',
      },
      body: JSON.stringify({
        model: 'mock-text',
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'user',
            content: 'You are designing a fast video generation workflow. Return ONLY a JSON object with this shape: {"scenes":[],"videoPrompt":{}}',
          },
        ],
      }),
    });
    const payload = await response.json();
    const parsed = JSON.parse(payload.choices[0].message.content);
    assert.equal(Array.isArray(parsed.scenes), true);
    assert.equal(typeof parsed.videoPrompt.promptZh, 'string');
  } finally {
    await server.close();
  }
});

test('mock Ark API preserves Seedance 2.5 request fields and returns task type constraint asynchronously', async () => {
  const server = await startTestMockApiServer({ port: 0, scenario: 'task_type_constraint' });
  if (!server) return;

  try {
    const createResponse = await fetch(`${server.baseUrl}/api/v3/contents/generations/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer mock' },
      body: JSON.stringify({
        model: 'doubao-seedance-2-5-260628',
        content: [{ type: 'text', text: '编辑参考视频' }],
        ratio: 'adaptive',
        duration: -1,
        resolution: '720p',
        output_format: 'mov',
      }),
    });
    const created = await createResponse.json();
    assert.equal(createResponse.ok, true);
    assert.match(created.id, /^mock-task-/u);

    const taskResponse = await fetch(`${server.baseUrl}/api/v3/contents/generations/tasks/${created.id}`);
    const task = await taskResponse.json();
    assert.equal(task.status, 'failed');
    assert.equal(task.model, 'doubao-seedance-2-5-260628');
    assert.equal(task.output_format, 'mov');
    assert.equal(task.error.code, 'InvalidParameter.TaskTypeConstraint');
  } finally {
    await server.close();
  }
});

test('mock Ark asset API can simulate one account flow-limit response and then recover', async () => {
  const server = await startTestMockApiServer({ port: 0, scenario: 'ark_flow_limit_once' });
  if (!server) return;

  const requestBody = {
    action: 'ListAssets',
    version: '2024-01-01',
    body: {
      Filter: { GroupIds: ['mock-group-aigc-1'], GroupType: 'AIGC' },
      PageNumber: 1,
      PageSize: 100,
    },
  };

  try {
    const limitedResponse = await fetch(`${server.baseUrl}/api/seedance/ark/assets/call`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    });
    const limited = await limitedResponse.json();
    assert.equal(limitedResponse.status, 429);
    assert.equal(limited.code, 'AccountFlowLimitExceeded');
    assert.equal(limited.action, 'ListAssets');
    assert.match(limited.requestId, /^mock-ark-request-/u);

    const recoveredResponse = await fetch(`${server.baseUrl}/api/seedance/ark/assets/call`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    });
    const recovered = await recoveredResponse.json();
    assert.equal(recoveredResponse.ok, true);
    assert.equal(recovered.Result.TotalCount, 1);
    assert.equal(recovered.Result.Items[0].Id, 'mock-asset-aigc-1');
  } finally {
    await server.close();
  }
});
