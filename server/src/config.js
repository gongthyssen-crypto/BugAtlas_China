import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const serverDir = path.resolve(moduleDir, '..');
const workspaceDir = path.resolve(serverDir, '..');

dotenv.config({ path: path.join(workspaceDir, '.env.local'), quiet: true });
dotenv.config({ path: path.join(serverDir, '.env'), quiet: true });

const bool = (value, fallback) => value == null ? fallback : /^(1|true|yes|on)$/i.test(value);

export function createConfig(overrides = {}) {
  const dataDir = overrides.dataDir ?? process.env.DATA_DIR ?? path.join(serverDir, 'data');
  return {
    workspaceDir,
    serverDir,
    dataDir,
    host: overrides.host ?? process.env.HOST ?? '127.0.0.1',
    port: Number(overrides.port ?? process.env.PORT ?? 3150),
    stationId: overrides.stationId ?? process.env.STATION_ID ?? 'BJ-MTG-SJMZ-01',
    demoMode: overrides.demoMode ?? bool(process.env.DEMO_MODE, true),
    demoFallback: overrides.demoFallback ?? bool(process.env.DEMO_FALLBACK, true),
    kimi: {
      baseUrl: process.env.KIMI_ANTHROPIC_BASE_URL ?? 'https://api.kimi.com/coding',
      apiKey: process.env.KIMI_ANTHROPIC_API_KEY ?? '',
      model: process.env.KIMI_ANTHROPIC_MODEL ?? 'k3',
      authMode: process.env.KIMI_ANTHROPIC_AUTH_MODE ?? 'x-api-key'
    },
    image: {
      baseUrl: process.env.IMAGE_API_BASE_URL ?? 'https://s.lconai.com',
      apiKey: process.env.IMAGE_API_KEY ?? '',
      model: process.env.IMAGE_MODEL ?? 'gpt-image-2'
    },
    tts: {
      provider: process.env.TTS_PROVIDER ?? 'windows-sapi',
      voice: process.env.TTS_VOICE ?? 'Microsoft Yaoyao'
    }
  };
}
