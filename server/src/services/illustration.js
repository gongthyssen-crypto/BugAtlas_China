import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

export async function generateIllustration({ config, observation, analysis, outputPath }) {
  if (config.demoMode || !config.image.apiKey) {
    await createDemoIllustration(outputPath, analysis?.candidates?.[0]?.commonName ?? '自然访客');
    return { filePath: outputPath, provider: 'demo', label: 'AI 艺术化示意图（演示）' };
  }
  const candidate = analysis?.candidates?.[0]?.commonName ?? '未确定昆虫候选';
  const prompt = `创作一幅无文字的自然博物学昆虫插画，主体为“${candidate}”这一候选方向，只作为艺术化示意，不用于识别。米白纸张、细腻铜版画线条与克制的矿物水彩，包含少量植物标本构图。不得出现标签、标题、数字、水印、汉字或任何字符。`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 120000);
  try {
    const response = await fetch(`${config.image.baseUrl.replace(/\/$/, '')}/v1/images/generations`, {
      method: 'POST',
      headers: { authorization: `Bearer ${config.image.apiKey}`, 'content-type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({ model: config.image.model, prompt, size: '1024x1024', quality: 'medium', n: 1, response_format: 'b64_json' })
    });
    if (!response.ok) throw Object.assign(new Error(`Image API failed with HTTP ${response.status}`), { code: 'IMAGE_UPSTREAM_ERROR', retryable: response.status >= 500 || response.status === 429 });
    const body = await response.json();
    const item = body.data?.[0];
    let image;
    if (item?.b64_json) image = Buffer.from(item.b64_json, 'base64');
    else if (item?.url) {
      const download = await fetch(item.url, { signal: controller.signal });
      if (!download.ok) throw new Error(`Image download failed with HTTP ${download.status}`);
      image = Buffer.from(await download.arrayBuffer());
    } else throw new Error('Image API response contains no image data');
    const metadata = await sharp(image).metadata();
    if (!metadata.width || !metadata.height || image.length > 20 * 1024 * 1024) throw new Error('Image API returned an invalid image');
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await sharp(image).png().toFile(outputPath);
    return { filePath: outputPath, provider: 'gpt-image-compatible', label: 'AI 艺术化示意图' };
  } catch (error) {
    if (!config.demoFallback) throw error;
    await createDemoIllustration(outputPath, candidate);
    return { filePath: outputPath, provider: 'demo-fallback', label: 'AI 艺术化示意图（演示回退）', fallbackReason: error.code ?? 'IMAGE_UNAVAILABLE' };
  } finally {
    clearTimeout(timer);
  }
}

async function createDemoIllustration(outputPath, label) {
  const safe = String(label).replace(/[<>&'\"]/g, '');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
    <defs><filter id="grain"><feTurbulence baseFrequency=".8" numOctaves="3" seed="7" result="n"/><feBlend in="SourceGraphic" in2="n" mode="multiply"/></filter></defs>
    <rect width="1024" height="1024" fill="#e9dfc4"/>
    <path d="M130 890C240 650 310 500 405 310M832 900C742 675 700 516 631 340" stroke="#69704c" stroke-width="15" fill="none" opacity=".58"/>
    <g transform="translate(512 495)" stroke="#2f3425" stroke-width="13" stroke-linecap="round" fill="none">
      <ellipse cy="70" rx="78" ry="180" fill="#bb8436"/><ellipse cy="-98" rx="60" ry="66" fill="#30372a"/>
      <path d="M-58 -128L-125 -205M58 -128L125 -205M-74 -20L-245 -175M74 -20L245 -175M-78 70L-260 70M78 70L260 70M-62 150L-210 282M62 150L210 282"/>
      <path d="M-60 6C-270 -96-318 35-215 170C-132 272-65 133-60 6ZM60 6C270-96 318 35 215 170C132 272 65 133 60 6Z" fill="#d8d4b2" opacity=".78"/>
      <path d="M-70 17H70M-77 80H77M-62 143H62" stroke="#f0c75e" stroke-width="28"/>
    </g>
    <text x="512" y="950" text-anchor="middle" font-family="Microsoft YaHei, sans-serif" font-size="28" fill="#5d6245" letter-spacing="4">${safe} · 艺术化示意</text>
  </svg>`;
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await sharp(Buffer.from(svg)).png().toFile(outputPath);
}
