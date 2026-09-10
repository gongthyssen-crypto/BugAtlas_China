import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export async function synthesizeSpeech({ config, text, voice, rate = 0 }) {
  const selectedVoice = voice || config.tts.voice;
  const hash = crypto.createHash('sha256').update(`${selectedVoice}\0${rate}\0${text}`).digest('hex');
  const outputDir = path.join(config.dataDir, 'audio');
  const outputPath = path.join(outputDir, `${hash}.wav`);
  await fs.mkdir(outputDir, { recursive: true });
  try {
    await fs.access(outputPath);
    return { filePath: outputPath, voice: selectedVoice, cached: true };
  } catch {}

  if (process.platform !== 'win32') {
    const error = new Error('Windows SAPI is only available on Windows');
    error.code = 'TTS_PLATFORM_UNAVAILABLE';
    throw error;
  }
  const powershell = process.env.SystemRoot ? path.join(process.env.SystemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe') : 'powershell.exe';
  await execFileAsync(powershell, [
    '-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
    '-File', path.join(config.serverDir, 'scripts', 'sapi-tts.ps1'),
    '-Text', text,
    '-OutputPath', outputPath,
    '-Voice', selectedVoice,
    '-Rate', String(rate)
  ], { timeout: 20000, windowsHide: true, maxBuffer: 1024 * 1024 });
  return { filePath: outputPath, voice: selectedVoice, cached: false };
}
