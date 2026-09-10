import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { buildApp } from '../src/app.js';
import { createConfig } from '../src/config.js';

async function body(response) {
  const parsed = response.json();
  assert.equal(parsed.success, true, JSON.stringify(parsed.error));
  return parsed.data;
}

async function waitJob(app, id) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const job = await body(await app.inject({ method: 'GET', url: `/api/v1/jobs/${id}` }));
    if (job.status === 'succeeded') return job.result;
    if (job.status === 'failed') assert.fail(JSON.stringify(job.error));
    await new Promise(resolve => setTimeout(resolve, 15));
  }
  assert.fail(`Job ${id} did not finish`);
}

test('demo mode completes observation, analysis, artifacts and feed flow', async t => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'bug-atlas-test-'));
  const config = createConfig({ dataDir, demoMode: true });
  const app = await buildApp({ config, logger: false });
  t.after(async () => {
    await app.close();
    await fs.rm(dataDir, { recursive: true, force: true });
  });

  const health = await body(await app.inject({ method: 'GET', url: '/api/v1/health' }));
  assert.equal(health.mode, 'demo');
  assert.equal(health.database, 'ok');
  const latest = await body(await app.inject({ method: 'GET', url: '/api/v1/sensors/latest' }));
  assert.equal(latest.source, 'demo');
  assert.equal(typeof latest.lightRaw, 'number');

  const observation = await body(await app.inject({ method: 'POST', url: '/api/v1/demo/observations', payload: {} }));
  assert.equal(observation.dataSource, 'demo');
  assert.equal(observation.sensorSnapshot.source, 'demo');

  const analysisJob = await body(await app.inject({ method: 'POST', url: `/api/v1/observations/${observation.id}/analyze`, payload: {} }));
  const analysis = await waitJob(app, analysisJob.id);
  assert.ok(analysis.candidates.length <= 3);
  assert.match(analysis.disclaimer, /AI 辅助分析/);

  const illustrationJob = await body(await app.inject({ method: 'POST', url: `/api/v1/observations/${observation.id}/illustrations`, payload: {} }));
  const illustration = await waitJob(app, illustrationJob.id);
  assert.match(illustration.label, /不参与识别|艺术化示意/);

  const postcard = await body(await app.inject({ method: 'POST', url: `/api/v1/observations/${observation.id}/artifacts`, payload: { type: 'postcard', includeAiIllustration: true } }));
  const detail = await body(await app.inject({ method: 'POST', url: `/api/v1/observations/${observation.id}/artifacts`, payload: { type: 'detail', includeAiIllustration: true } }));
  assert.deepEqual([postcard.width, postcard.height], [1600, 1000]);
  assert.deepEqual([detail.width, detail.height], [1080, 1920]);
  const postcardFile = await app.inject({ method: 'GET', url: postcard.fileUrl });
  assert.equal(postcardFile.statusCode, 200);
  assert.equal((await sharp(postcardFile.rawPayload).metadata()).format, 'png');

  const post = await body(await app.inject({ method: 'POST', url: '/api/v1/posts', payload: { artifactId: postcard.id, message: '来自测试的自然来信', moderationStatus: 'approved' } }));
  assert.equal(post.moderationStatus, 'approved');
  const feed = await body(await app.inject({ method: 'GET', url: '/api/v1/posts?habitat=mountain_forest_edge' }));
  assert.equal(feed.items.length, 1);
  assert.equal(feed.items[0].dataSource, 'demo');
});
