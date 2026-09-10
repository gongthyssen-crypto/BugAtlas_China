import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

export async function generateIllustration({ config, observation, analysis, outputPath }) {
  if (!config.image.apiKey) return { filePath: null, provider: 'not-configured', label: '未配置 IMAGE-2，作品将使用原始观察照片' };
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
    return { filePath: null, provider: 'original-fallback', label: 'IMAGE-2 暂不可用，作品已回退原始观察照片', fallbackReason: error.code ?? 'IMAGE_UNAVAILABLE' };
  } finally {
    clearTimeout(timer);
  }
}
