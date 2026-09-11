import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const api = require('../../miniprogram/utils/api.js');

test('miniprogram POST without explicit data sends an empty JSON object', async t => {
  const previousGetApp = globalThis.getApp;
  const previousWx = globalThis.wx;
  t.after(() => {
    globalThis.getApp = previousGetApp;
    globalThis.wx = previousWx;
  });

  let captured;
  globalThis.getApp = () => ({ globalData: { apiBase: 'http://127.0.0.1:3150/api/v1' } });
  globalThis.wx = {
    request(options) {
      captured = options;
      options.success({ statusCode: 202, data: { success: true, data: { id: 'job-test' } } });
    }
  };

  const result = await api.request('/observations/test/analyze', { method: 'POST' });
  assert.deepEqual(result, { id: 'job-test' });
  assert.equal(captured.method, 'POST');
  assert.deepEqual(captured.data, {});
  assert.equal(captured.header['content-type'], 'application/json');
});

test('miniprogram GET does not attach an empty JSON body', async t => {
  const previousGetApp = globalThis.getApp;
  const previousWx = globalThis.wx;
  t.after(() => {
    globalThis.getApp = previousGetApp;
    globalThis.wx = previousWx;
  });

  let captured;
  globalThis.getApp = () => ({ globalData: { apiBase: 'http://127.0.0.1:3150/api/v1' } });
  globalThis.wx = {
    request(options) {
      captured = options;
      options.success({ statusCode: 200, data: { success: true, data: { status: 'ok' } } });
    }
  };

  await api.request('/health');
  assert.equal(Object.hasOwn(captured, 'data'), false);
  assert.equal(Object.hasOwn(captured.header, 'content-type'), false);
});
