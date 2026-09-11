import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const api = require('../../miniprogram/utils/api.js');

function createPageContext(definition) {
  return {
    ...definition,
    data: structuredClone(definition.data),
    setData(patch) { Object.assign(this.data, patch); }
  };
}

test('mentor page onShow recovers a cached page when onLoad was skipped', async t => {
  const previousPage = globalThis.Page;
  const previousGetApp = globalThis.getApp;
  const previousWx = globalThis.wx;
  const previousRequest = api.request;
  t.after(() => {
    globalThis.Page = previousPage;
    globalThis.getApp = previousGetApp;
    globalThis.wx = previousWx;
    api.request = previousRequest;
  });

  let pageDefinition;
  globalThis.Page = definition => { pageDefinition = definition; };
  globalThis.getApp = () => ({ globalData: { currentObservationId: 'observation-1' } });
  globalThis.wx = { showToast() {} };

  const mentorPath = require.resolve('../../miniprogram/pages/mentor/mentor.js');
  delete require.cache[mentorPath];
  require(mentorPath);

  api.request = async path => {
    assert.equal(path, '/observations/observation-1');
    return {
      id: 'observation-1',
      dataSource: 'demo',
      analysis: {
        candidates: [{ commonName: '食蚜蝇类', evidence: ['黄黑相间'], counterEvidence: null, verifyNext: ['补拍翅膀'] }],
        childExplanation: '儿童讲解',
        teacherExplanation: '教师讲解'
      }
    };
  };

  const context = createPageContext(pageDefinition);
  await context.onShow();

  assert.equal(context.data.id, 'observation-1');
  assert.equal(context.data.loading, false);
  assert.equal(context.data.errorMessage, '');
  assert.equal(context.data.candidateCount, 1);
  assert.equal(context.data.sourceLabel, '演示分析');
  assert.equal(context.data.analysis.candidates[0].commonName, '食蚜蝇类');
  assert.deepEqual(context.data.analysis.candidates[0].counterEvidence, []);
});

test('mentor page exposes a retryable error instead of a blank screen', async t => {
  const previousPage = globalThis.Page;
  const previousGetApp = globalThis.getApp;
  const previousWx = globalThis.wx;
  const previousRequest = api.request;
  t.after(() => {
    globalThis.Page = previousPage;
    globalThis.getApp = previousGetApp;
    globalThis.wx = previousWx;
    api.request = previousRequest;
  });

  let pageDefinition;
  globalThis.Page = definition => { pageDefinition = definition; };
  globalThis.getApp = () => ({ globalData: { currentObservationId: 'observation-2' } });
  globalThis.wx = { showToast() {} };

  const mentorPath = require.resolve('../../miniprogram/pages/mentor/mentor.js');
  delete require.cache[mentorPath];
  require(mentorPath);
  api.request = async () => { throw { message: '无法连接本地服务', detail: 'request:fail timeout' }; };

  const context = createPageContext(pageDefinition);
  await context.load();

  assert.equal(context.data.loading, false);
  assert.equal(context.data.analysis, null);
  assert.match(context.data.errorMessage, /无法连接本地服务/);
  assert.match(context.data.errorMessage, /timeout/);
});
