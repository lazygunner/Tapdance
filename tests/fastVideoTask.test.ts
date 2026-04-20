import test from 'node:test';
import assert from 'node:assert/strict';

import { buildSeedanceCliFailure, inferFastFlowTemplateId, isSeedanceConcurrencyLimitError } from '../src/features/fastVideoFlow/utils/fastVideoTask.ts';
import { createEmptyFastVideoProject } from '../src/features/fastVideoFlow/services/fastFlowMappers.ts';

test('buildSeedanceCliFailure extracts fail_reason from CLI payloads', () => {
  const failure = buildSeedanceCliFailure({
    submit_id: '4439f70a301f7f46',
    gen_status: 'fail',
    fail_reason: 'api error: ret=1310, message=ExceedConcurrencyLimit, logid=20260415231940192168002047933B4A0',
  });

  assert.equal(
    failure.userMessage,
    '提交失败：当前并发任务数已达上限，请等待已有任务完成后重试。',
  );
  assert.match(failure.detail, /ExceedConcurrencyLimit/);
});

test('isSeedanceConcurrencyLimitError matches known CLI concurrency failures', () => {
  assert.equal(isSeedanceConcurrencyLimitError('api error: ret=1310, message=ExceedConcurrencyLimit'), true);
  assert.equal(isSeedanceConcurrencyLimitError('some other error'), false);
});

test('inferFastFlowTemplateId uses multi-image reference for more than two storyboard scenes', () => {
  const input = createEmptyFastVideoProject().input;

  assert.equal(inferFastFlowTemplateId(input, 1), 'first_frame');
  assert.equal(inferFastFlowTemplateId(input, 2), 'first_last_frame');
  assert.equal(inferFastFlowTemplateId(input, 3), 'multi_image_reference');
});
