import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { renderArtifact } from '../src/services/artifact-renderer.js';

async function pixelAt(imagePath, left, top) {
  const { data } = await sharp(imagePath)
    .extract({ left, top, width: 1, height: 1 })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return [...data];
}

test('AI illustrations keep their full top and bottom inside both artifact frames', async t => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'bug-atlas-artifact-test-'));
  t.after(() => fs.rm(dataDir, { recursive: true, force: true }));

  const illustrationPath = path.join(dataDir, 'edge-markers.png');
  const source = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">
    <rect width="100" height="10" fill="#ff0000"/>
    <rect y="10" width="100" height="80" fill="#00ff00"/>
    <rect y="90" width="100" height="10" fill="#0000ff"/>
  </svg>`;
  await sharp(Buffer.from(source)).png().toFile(illustrationPath);

  const observation = {
    id: 'edge-marker-observation',
    capturedAt: '2026-09-11T00:00:00.000Z',
    locationLabel: '测试地点',
    schoolAlias: '测试观察组',
    dataSource: 'demo',
    sensorSnapshot: { temperatureC: 25, humidityPct: 58, lightRaw: 520 },
    imagePath: illustrationPath,
    illustrationPath
  };
  const analysis = {
    candidates: [{ commonName: '测试昆虫', evidence: ['测试证据'], verifyNext: ['继续观察'] }],
    postcardText: '测试自然来信',
    teacherExplanation: '测试教师提示'
  };

  const cases = [
    { type: 'postcard', x: 530, top: 90, bottom: 794 },
    { type: 'detail', x: 540, top: 153, bottom: 827 }
  ];
  for (const specimen of cases) {
    const artifact = await renderArtifact({
      config: { dataDir },
      observation,
      analysis,
      type: specimen.type,
      includeAiIllustration: true
    });
    const topPixel = await pixelAt(artifact.filePath, specimen.x, specimen.top);
    const bottomPixel = await pixelAt(artifact.filePath, specimen.x, specimen.bottom);
    assert.ok(topPixel[0] > 180 && topPixel[1] < 80 && topPixel[2] < 80, `${specimen.type} lost the red top edge: ${topPixel}`);
    assert.ok(bottomPixel[2] > 180 && bottomPixel[0] < 80 && bottomPixel[1] < 80, `${specimen.type} lost the blue bottom edge: ${bottomPixel}`);
  }
});
