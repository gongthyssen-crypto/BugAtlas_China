import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

test('settings page schedules silent reconnect checks only while visible', t => {
  const previousPage = globalThis.Page;
  const previousSetTimeout = globalThis.setTimeout;
  const previousClearTimeout = globalThis.clearTimeout;
  t.after(() => {
    globalThis.Page = previousPage;
    globalThis.setTimeout = previousSetTimeout;
    globalThis.clearTimeout = previousClearTimeout;
  });

  let pageDefinition;
  let scheduledCallback;
  let scheduledDelay;
  let clearedTimer;
  globalThis.Page = definition => { pageDefinition = definition; };
  globalThis.setTimeout = (callback, delay) => {
    scheduledCallback = callback;
    scheduledDelay = delay;
    return 77;
  };
  globalThis.clearTimeout = timer => { clearedTimer = timer; };

  const settingsPath = require.resolve('../../miniprogram/pages/settings/settings.js');
  delete require.cache[settingsPath];
  require(settingsPath);

  let refreshOptions;
  const context = {
    ...pageDefinition,
    pageVisible: true,
    refresh(options) { refreshOptions = options; }
  };
  context.scheduleRefresh(2000);
  assert.equal(scheduledDelay, 2000);
  assert.equal(context.refreshTimer, 77);
  scheduledCallback();
  assert.deepEqual(refreshOptions, { showLoading: false });

  context.onHide();
  assert.equal(clearedTimer, 77);
  assert.equal(context.refreshTimer, null);
  context.scheduleRefresh(2000);
  assert.equal(context.refreshTimer, null);
});
