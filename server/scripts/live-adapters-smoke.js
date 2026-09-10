import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { createConfig } from '../src/config.js';
import { analyzeObservation } from '../src/services/analysis.js';
import { demoAnalysis } from '../src/services/analysis.js';
import { generateIllustration } from '../src/services/illustration.js';
import { createDemoObservationImage } from '../src/services/artifact-renderer.js';

const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'bug-atlas-live-'));
try {
  const config = createConfig({ dataDir: tempDir, demoMode: false, demoFallback: false });
  if (!config.kimi.apiKey || !config.image.apiKey) throw new Error('Live adapter credentials are not configured in the process environment');
  const imagePath = path.join(tempDir, 'observation.jpg');
  await createDemoObservationImage(imagePath);
  const observation = {
    id: 'live-smoke-test',
    userDescription: '黄黑相间，有透明翅膀，停在花朵附近。',
    habitat: 'campus',
    locationLabel: '本地适配器联调',
    regionCode: '110000',
    sensorSnapshot: { temperatureC: 25.1, humidityPct: 61.2, lightRaw: 480 }
  };
  const imageOnly = process.argv.includes('--image-only');
  const analysis = imageOnly ? demoAnalysis(observation) : await analyzeObservation({ config, observation, imagePath });
  if (!imageOnly) console.log(JSON.stringify({ adapter: 'kimi', ok: true, provider: analysis.modelProvider, candidateCount: analysis.candidates.length }));
  const outputPath = path.join(tempDir, 'illustration.png');
  const illustration = await generateIllustration({ config, observation, analysis, outputPath });
  const metadata = await sharp(outputPath).metadata();
  console.log(JSON.stringify({ adapter: 'image', ok: true, provider: illustration.provider, format: metadata.format, width: metadata.width, height: metadata.height }));
} finally {
  await fs.rm(tempDir, { recursive: true, force: true });
}
