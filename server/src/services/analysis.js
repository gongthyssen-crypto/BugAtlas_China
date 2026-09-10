import fs from 'node:fs/promises';
import sharp from 'sharp';
import { z } from 'zod';

const candidateSchema = z.object({
  commonName: z.string().min(1).max(40),
  scientificName: z.string().max(80).nullable().optional().default(null),
  confidence: z.number().min(0).max(1),
  evidence: z.array(z.string().max(80)).max(6),
  counterEvidence: z.array(z.string().max(80)).max(6),
  verifyNext: z.array(z.string().max(80)).min(1).max(6)
});

const analysisSchema = z.object({
  candidates: z.array(candidateSchema).max(3),
  childExplanation: z.string().min(1).max(800),
  teacherExplanation: z.string().min(1).max(1200),
  safetyNotice: z.string().min(1).max(240),
  ttsText: z.string().min(1).max(1000),
  postcardText: z.string().min(1).max(180)
});

const disclaimer = 'AI 辅助分析，仅供自然教育；请结合持续观察或专家资料核验。';

function demoAnalysis(observation, provider = 'demo') {
  const place = observation.locationLabel || '观察站旁';
  return {
    observationId: observation.id,
    modelProvider: provider,
    modelName: 'curated-demo-v1',
    promptVersion: 'insect-analysis-v1',
    candidates: [
      {
        commonName: '食蚜蝇类',
        scientificName: null,
        confidence: 0.72,
        evidence: ['黄黑相间的警戒色', '常见访花行为', '身体轮廓接近双翅目昆虫'],
        counterEvidence: ['照片未清楚显示触角和翅脉'],
        verifyNext: ['从侧面补拍翅膀', '观察触角长短', '记录它是否能悬停飞行']
      },
      {
        commonName: '蜜蜂类',
        scientificName: null,
        confidence: 0.38,
        evidence: ['黄黑配色', '在花朵附近活动'],
        counterEvidence: ['体表绒毛和两对翅膀特征不够清晰'],
        verifyNext: ['观察后足是否携带花粉', '补拍身体表面绒毛']
      }
    ],
    childExplanation: `这位在${place}遇见的访花客，可能是很会模仿蜜蜂外表的食蚜蝇。它的黄黑花纹能提醒天敌保持距离。先别急着给它下结论，试着看看它能不能停在空中，或从侧面数一数翅膀。`,
    teacherExplanation: '当前候选主要依据体色、访花行为和可见体态提出。食蚜蝇与膜翅目昆虫存在拟态混淆，应继续检查触角、翅膀对数、翅脉及后足携粉结构。环境快照是观察背景，不应被当作物种识别的决定性依据。',
    safetyNotice: '请保持距离观察，不要徒手捕捉、触摸或喂食未知昆虫。',
    ttsText: '这位访花客可能是食蚜蝇。它用黄黑花纹模仿蜜蜂保护自己。请继续观察它能不能悬停飞行，并从侧面看看翅膀。记住，我们还需要更多证据才能核验。',
    postcardText: '一位黄黑相间的访花客来到观察站。我们记录下空气、光线和它的动作，也留下了一个等待继续验证的自然问题。',
    disclaimer,
    generatedAt: new Date().toISOString()
  };
}

function extractJson(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const source = fenced ?? text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1);
  return JSON.parse(source);
}

function promptFor(observation) {
  return `请依据照片和观察记录进行谨慎的昆虫候选分析。不得做权威鉴定，不得给出触摸、食用、医疗或检疫安全结论。证据不足可返回空 candidates。只输出 JSON，不要 Markdown。\n\n字段：{candidates:[{commonName,scientificName|null,confidence:0..1,evidence:string[],counterEvidence:string[],verifyNext:string[]}],childExplanation,teacherExplanation,safetyNotice,ttsText,postcardText}。candidates 最多 3 个，postcardText 不超过 140 个中文字符。\n\n观察：${JSON.stringify({
    description: observation.userDescription,
    habitat: observation.habitat,
    locationLabel: observation.locationLabel,
    regionCode: observation.regionCode,
    sensorSnapshot: observation.sensorSnapshot
  })}`;
}

export async function analyzeObservation({ config, observation, imagePath }) {
  if (config.demoMode || !config.kimi.apiKey) return demoAnalysis(observation);
  const image = await fs.readFile(imagePath);
  const metadata = await sharp(image).metadata();
  const mediaType = metadata.format === 'png' ? 'image/png' : 'image/jpeg';
  const headers = { 'content-type': 'application/json', 'anthropic-version': '2023-06-01' };
  if (config.kimi.authMode === 'bearer') headers.authorization = `Bearer ${config.kimi.apiKey}`;
  else headers['x-api-key'] = config.kimi.apiKey;
  const requestBody = JSON.stringify({
    model: config.kimi.model,
    max_tokens: 1800,
    system: '你是谨慎的儿童博物教育助手，只输出符合给定 JSON 字段的数据。',
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: mediaType, data: image.toString('base64') } },
        { type: 'text', text: promptFor(observation) }
      ]
    }]
  });
  headers['idempotency-key'] = `analysis-${observation.id}`;
  try {
    const deadline = Date.now() + 45000;
    let lastError;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const remaining = deadline - Date.now();
      if (remaining <= 0) break;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), Math.min(attempt === 0 ? 30000 : 15000, remaining));
      try {
        const response = await fetch(`${config.kimi.baseUrl.replace(/\/$/, '')}/v1/messages`, {
          method: 'POST', headers, signal: controller.signal, body: requestBody
        });
        if (!response.ok) {
          const error = new Error(`Kimi request failed with HTTP ${response.status}`);
          error.code = 'AI_UPSTREAM_ERROR';
          error.retryable = response.status >= 500 || response.status === 429;
          throw error;
        }
        const body = await response.json();
        const text = body.content?.filter(item => item.type === 'text').map(item => item.text).join('\n') ?? '';
        const parsed = analysisSchema.parse(extractJson(text));
        return {
          observationId: observation.id,
          modelProvider: 'kimi-anthropic',
          modelName: config.kimi.model,
          promptVersion: 'insect-analysis-v1',
          ...parsed,
          disclaimer,
          generatedAt: new Date().toISOString()
        };
      } catch (error) {
        lastError = error.name === 'AbortError'
          ? Object.assign(new Error('Kimi request timed out'), { code: 'AI_TIMEOUT', retryable: true })
          : error;
        if (attempt === 1 || !lastError.retryable) throw lastError;
      } finally {
        clearTimeout(timer);
      }
    }
    throw lastError ?? Object.assign(new Error('Kimi request timed out'), { code: 'AI_TIMEOUT', retryable: true });
  } catch (error) {
    if (config.demoFallback) return { ...demoAnalysis(observation, 'demo-fallback'), fallbackReason: error.code ?? 'AI_UNAVAILABLE' };
    throw error;
  }
}

export { analysisSchema, demoAnalysis, disclaimer };
