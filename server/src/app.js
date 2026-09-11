import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import sharp from 'sharp';
import { openDatabase, rowToArtifact, rowToObservation, rowToPost, rowToSnapshot } from './db.js';
import { DemoSensors } from './services/demo-sensors.js';
import { SerialBridge } from './services/serial-bridge.js';
import { JobService } from './services/jobs.js';
import { analyzeObservation } from './services/analysis.js';
import { generateIllustration } from './services/illustration.js';
import { synthesizeSpeech } from './services/tts.js';
import { createDemoObservationImage, renderArtifact } from './services/artifact-renderer.js';

const habitats = new Set(['mountain_forest_edge', 'wetland', 'farmland', 'campus', 'garden', 'other']);
const habitatLabels = {
  mountain_forest_edge: '山地林缘', wetland: '湿地', farmland: '农田', campus: '校园', garden: '花园', other: '其他'
};

function clean(value, max = 120, fallback = '') {
  const text = String(value ?? fallback).trim();
  return text.slice(0, max);
}

function regionLabel(code) {
  if (String(code).startsWith('110109')) return '北京·门头沟';
  if (String(code).startsWith('110102')) return '北京·西城';
  if (String(code).startsWith('110108')) return '北京·海淀';
  return '中国·自然观察站';
}

function apiSuccess(request, data) {
  return { success: true, requestId: request.id, data, error: null };
}

function apiError(request, code, message, retryable = false) {
  return { success: false, requestId: request.id, data: null, error: { code, message, retryable } };
}

function storedObservation(row) {
  if (!row) return null;
  return { ...rowToObservation(row), imagePath: row.image_path, audioPath: row.audio_path, illustrationPath: row.illustration_path };
}

export async function buildApp({ config, logger = true } = {}) {
  const app = Fastify({ logger, requestIdHeader: 'x-request-id' });
  const db = openDatabase(config.dataDir);
  const jobs = new JobService(db, app.log);
  let demoMode = db.prepare("SELECT value FROM settings WHERE key = 'demoMode'").get()?.value;
  demoMode = demoMode == null ? config.demoMode : demoMode === 'true';
  config.demoMode = demoMode;

  await app.register(cors, { origin: /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/ });
  await app.register(multipart, {
    limits: { files: 2, fileSize: 10 * 1024 * 1024, fields: 20, fieldSize: 256 * 1024 }
  });

  const insertSnapshot = db.prepare(`INSERT INTO sensor_snapshots (
    station_id, device_id, captured_at, received_at, uptime_ms, temperature_c, humidity_pct,
    light_raw, light_relative_pct, human_presence, status_flags, device_state, source
  ) VALUES (@stationId, @deviceId, @capturedAt, @receivedAt, @uptimeMs, @temperatureC, @humidityPct,
    @lightRaw, @lightRelativePct, @humanPresence, @statusFlags, @deviceState, @source)`);
  const storeSnapshot = snapshot => {
    insertSnapshot.run({ ...snapshot, humanPresence: snapshot.humanPresence == null ? null : Number(snapshot.humanPresence) });
  };
  const demoSensors = new DemoSensors({ stationId: config.stationId, onSnapshot: storeSnapshot });
  const serialBridge = new SerialBridge({ stationId: config.stationId, onSnapshot: storeSnapshot, logger: app.log });
  if (demoMode) demoSensors.start();

  const getObservationRow = id => db.prepare('SELECT * FROM observations WHERE id = ?').get(id);
  const getAnalysis = id => {
    const row = db.prepare('SELECT result_json FROM analyses WHERE observation_id = ?').get(id);
    return row ? JSON.parse(row.result_json) : null;
  };
  const insertArtifact = artifact => {
    db.prepare(`INSERT INTO artifacts (id, observation_id, type, template_version, format, width, height, file_path, sha256, created_at)
      VALUES (@id, @observationId, @type, @templateVersion, @format, @width, @height, @filePath, @sha256, @createdAt)`).run(artifact);
    return rowToArtifact(db.prepare('SELECT * FROM artifacts WHERE id = ?').get(artifact.id));
  };

  app.setErrorHandler((error, request, reply) => {
    if (error.statusCode === 413) return reply.code(413).send(apiError(request, 'UPLOAD_TOO_LARGE', '文件不得超过 10 MB'));
    if (error.code === 'FST_ERR_CTP_EMPTY_JSON_BODY') return reply.code(400).send(apiError(request, 'REQUEST_BODY_REQUIRED', '请求缺少 JSON 内容'));
    if (error.validation) return reply.code(400).send(apiError(request, 'REQUEST_INVALID', '请求参数不完整或格式错误'));
    request.log.error({ requestId: request.id, errorCode: error.code ?? 'INTERNAL_ERROR', message: error.message }, 'Request failed');
    return reply.code(error.statusCode ?? 500).send(apiError(request, error.code ?? 'INTERNAL_ERROR', error.publicMessage ?? '本地服务暂时无法完成请求', Boolean(error.retryable)));
  });

  app.get('/', async (_request, reply) => reply.type('text/html; charset=utf-8').send(`<!doctype html><meta charset="utf-8"><title>虫宿博物志本地服务</title><style>body{font:18px/1.7 Georgia,"Microsoft YaHei";max-width:760px;margin:12vh auto;color:#263022;background:#f3eddc}code{background:#dfe2cf;padding:.15em .4em}</style><h1>虫宿博物志 · 本地服务</h1><p>串口桥接、AI、语音和作品服务正在运行。</p><p>健康检查：<code>/api/v1/health</code></p>`));

  app.get('/api/v1/health', async request => apiSuccess(request, {
    serviceId: 'bug-atlas-china-local',
    status: 'ok',
    mode: demoMode ? 'demo' : 'live',
    database: 'ok',
    serial: serialBridge.status(),
    adapters: {
      kimi: config.kimi.apiKey ? 'configured' : 'demo-fallback',
      image: config.image.apiKey ? 'configured' : 'demo-fallback',
      tts: process.platform === 'win32' ? 'windows-sapi' : 'unavailable'
    },
    version: '0.1.0',
    time: new Date().toISOString()
  }));

  app.get('/api/v1/settings', async request => apiSuccess(request, { mode: demoMode ? 'demo' : 'live' }));
  app.post('/api/v1/settings/mode', {
    schema: { body: { type: 'object', required: ['mode'], properties: { mode: { enum: ['demo', 'live'] } } } }
  }, async (request, reply) => {
    demoMode = request.body.mode === 'demo';
    config.demoMode = demoMode;
    db.prepare("INSERT INTO settings (key, value) VALUES ('demoMode', ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(String(demoMode));
    if (demoMode) demoSensors.start(); else demoSensors.stop();
    return reply.send(apiSuccess(request, { mode: request.body.mode }));
  });

  app.get('/api/v1/serial/ports', async request => {
    const ports = await serialBridge.listPorts();
    return apiSuccess(request, ports.map(port => ({
      port: port.path, manufacturer: port.manufacturer ?? null, serialNumber: port.serialNumber ?? null,
      vendorId: port.vendorId ?? null, productId: port.productId ?? null, friendlyName: port.friendlyName ?? null
    })));
  });
  app.post('/api/v1/serial/connect', {
    schema: { body: { type: 'object', required: ['port'], properties: { port: { type: 'string' }, baudRate: { type: 'integer', const: 115200 } } } }
  }, async request => {
    const status = await serialBridge.connect(request.body.port, request.body.baudRate ?? 115200);
    demoMode = false;
    config.demoMode = false;
    demoSensors.stop();
    db.prepare("INSERT INTO settings (key, value) VALUES ('demoMode', 'false') ON CONFLICT(key) DO UPDATE SET value='false'").run();
    return apiSuccess(request, status);
  });
  app.delete('/api/v1/serial/connection', async (_request, reply) => {
    await serialBridge.disconnect();
    return reply.code(204).send();
  });
  app.get('/api/v1/device', async request => apiSuccess(request, { ...serialBridge.status(), mode: demoMode ? 'demo' : 'live' }));

  app.get('/api/v1/sensors/latest', async (request, reply) => {
    const row = demoMode
      ? db.prepare("SELECT * FROM sensor_snapshots WHERE source = 'demo' ORDER BY id DESC LIMIT 1").get()
      : db.prepare("SELECT * FROM sensor_snapshots WHERE source = 'live' ORDER BY id DESC LIMIT 1").get();
    if (!row) return reply.code(404).send(apiError(request, 'SENSOR_DATA_UNAVAILABLE', '还没有收到环境数据', true));
    return apiSuccess(request, rowToSnapshot(row));
  });
  app.get('/api/v1/sensors/history', async request => {
    const limit = Math.min(1000, Math.max(1, Number(request.query.limit ?? 60)));
    const source = demoMode ? 'demo' : 'live';
    const rows = db.prepare('SELECT * FROM sensor_snapshots WHERE station_id = ? AND source = ? ORDER BY id DESC LIMIT ?').all(request.query.stationId ?? config.stationId, source, limit);
    return apiSuccess(request, rows.reverse().map(row => rowToSnapshot(row)));
  });

  async function saveObservation({ imageBuffer, imageExtension, metadata, dataSource }) {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const uploadDir = path.join(config.dataDir, 'uploads', 'observations', id);
    await fs.mkdir(uploadDir, { recursive: true });
    const imagePath = path.join(uploadDir, `image.${imageExtension}`);
    await fs.writeFile(imagePath, imageBuffer);
    const latestRow = demoMode
      ? db.prepare("SELECT * FROM sensor_snapshots WHERE source = 'demo' ORDER BY id DESC LIMIT 1").get()
      : db.prepare("SELECT * FROM sensor_snapshots WHERE source = 'live' ORDER BY id DESC LIMIT 1").get();
    const snapshot = rowToSnapshot(latestRow) ?? { stationId: config.stationId, source: 'demo', dataAgeMs: 0, temperatureC: null, humidityPct: null, lightRaw: null };
    const habitat = habitats.has(metadata.habitat) ? metadata.habitat : 'campus';
    db.prepare(`INSERT INTO observations (
      id, station_id, school_alias, region_code, location_label, habitat, captured_at, image_path,
      user_description, sensor_snapshot_json, data_source, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      id,
      clean(metadata.stationId, 40, config.stationId) || config.stationId,
      clean(metadata.schoolAlias, 60, '少年自然观察组') || '少年自然观察组',
      clean(metadata.regionCode, 12, '110000') || '110000',
      clean(metadata.locationLabel, 80, '校园自然角') || '校园自然角',
      habitat,
      now,
      imagePath,
      clean(metadata.userDescription, 1000),
      JSON.stringify(snapshot),
      dataSource,
      now,
      now
    );
    return rowToObservation(getObservationRow(id));
  }

  app.post('/api/v1/observations', async (request, reply) => {
    let imageBuffer = null;
    let extension = null;
    let metadata = {};
    for await (const part of request.parts()) {
      if (part.type === 'file') {
        if (part.fieldname !== 'image') continue;
        imageBuffer = await part.toBuffer();
        const imageInfo = await sharp(imageBuffer).metadata();
        if (!['jpeg', 'png'].includes(imageInfo.format)) return reply.code(415).send(apiError(request, 'IMAGE_FORMAT_UNSUPPORTED', '只支持 JPG 或 PNG 图片'));
        extension = imageInfo.format === 'jpeg' ? 'jpg' : 'png';
      } else if (part.fieldname === 'metadata') {
        try { metadata = JSON.parse(part.value); } catch { return reply.code(400).send(apiError(request, 'METADATA_INVALID', '观察信息不是有效 JSON')); }
      }
    }
    if (!imageBuffer) return reply.code(400).send(apiError(request, 'IMAGE_REQUIRED', '请选择一张昆虫或自然观察照片'));
    const observation = await saveObservation({ imageBuffer, imageExtension: extension, metadata, dataSource: demoMode ? 'demo' : 'live' });
    return reply.code(201).send(apiSuccess(request, observation));
  });

  app.post('/api/v1/demo/observations', async (request, reply) => {
    const tempDir = path.join(config.dataDir, 'demo');
    const tempImage = path.join(tempDir, 'demo-hoverfly.jpg');
    await createDemoObservationImage(tempImage);
    const imageBuffer = await fs.readFile(tempImage);
    const observation = await saveObservation({
      imageBuffer,
      imageExtension: 'jpg',
      dataSource: 'demo',
      metadata: {
        stationId: config.stationId,
        schoolAlias: clean(request.body?.schoolAlias, 60, '王平中学自然观察组'),
        regionCode: clean(request.body?.regionCode, 12, '110109'),
        locationLabel: clean(request.body?.locationLabel, 80, '九龙山脚下自然课堂'),
        habitat: request.body?.habitat ?? 'mountain_forest_edge',
        userDescription: clean(request.body?.userDescription, 1000, '黄黑相间，停在花朵附近，有透明翅膀，偶尔悬停。')
      }
    });
    return reply.code(201).send(apiSuccess(request, observation));
  });

  app.get('/api/v1/observations/:id', async (request, reply) => {
    const row = getObservationRow(request.params.id);
    if (!row) return reply.code(404).send(apiError(request, 'OBSERVATION_NOT_FOUND', '没有找到这条观察'));
    return apiSuccess(request, { ...rowToObservation(row), analysis: getAnalysis(row.id) });
  });
  app.patch('/api/v1/observations/:id', async (request, reply) => {
    const row = getObservationRow(request.params.id);
    if (!row) return reply.code(404).send(apiError(request, 'OBSERVATION_NOT_FOUND', '没有找到这条观察'));
    const next = {
      userDescription: request.body.userDescription == null ? row.user_description : clean(request.body.userDescription, 1000),
      schoolAlias: request.body.schoolAlias == null ? row.school_alias : clean(request.body.schoolAlias, 60),
      locationLabel: request.body.locationLabel == null ? row.location_label : clean(request.body.locationLabel, 80),
      habitat: habitats.has(request.body.habitat) ? request.body.habitat : row.habitat
    };
    db.prepare('UPDATE observations SET user_description=?, school_alias=?, location_label=?, habitat=?, updated_at=? WHERE id=?')
      .run(next.userDescription, next.schoolAlias, next.locationLabel, next.habitat, new Date().toISOString(), row.id);
    return apiSuccess(request, rowToObservation(getObservationRow(row.id)));
  });
  app.get('/api/v1/observations/:id/image', async (request, reply) => {
    const row = getObservationRow(request.params.id);
    if (!row) return reply.code(404).send();
    const metadata = await sharp(row.image_path).metadata();
    return reply.type(metadata.format === 'png' ? 'image/png' : 'image/jpeg').send(await fs.readFile(row.image_path));
  });
  app.get('/api/v1/observations/:id/illustration', async (request, reply) => {
    const row = getObservationRow(request.params.id);
    if (!row?.illustration_path) return reply.code(404).send();
    return reply.type('image/png').send(await fs.readFile(row.illustration_path));
  });
  app.post('/api/v1/observations/:id/audio', async (request, reply) => {
    const row = getObservationRow(request.params.id);
    if (!row) return reply.code(404).send(apiError(request, 'OBSERVATION_NOT_FOUND', '没有找到这条观察'));
    const part = await request.file();
    if (!part) return reply.code(400).send(apiError(request, 'AUDIO_REQUIRED', '没有收到录音文件'));
    const allowed = new Map([['audio/mpeg', 'mp3'], ['audio/mp3', 'mp3'], ['audio/wav', 'wav'], ['audio/x-wav', 'wav'], ['audio/mp4', 'm4a']]);
    const extension = allowed.get(part.mimetype);
    if (!extension) return reply.code(415).send(apiError(request, 'AUDIO_FORMAT_UNSUPPORTED', '录音格式需为 MP3、WAV 或 M4A'));
    const audioPath = path.join(path.dirname(row.image_path), `observation.${extension}`);
    await fs.writeFile(audioPath, await part.toBuffer());
    db.prepare('UPDATE observations SET audio_path=?, updated_at=? WHERE id=?').run(audioPath, new Date().toISOString(), row.id);
    return apiSuccess(request, { observationId: row.id, hasAudio: true });
  });

  app.post('/api/v1/observations/:id/analyze', async (request, reply) => {
    const row = getObservationRow(request.params.id);
    if (!row) return reply.code(404).send(apiError(request, 'OBSERVATION_NOT_FOUND', '没有找到这条观察'));
    db.prepare("UPDATE observations SET ai_status='queued', updated_at=? WHERE id=?").run(new Date().toISOString(), row.id);
    const job = jobs.create('analysis', async progress => {
      progress(25);
      db.prepare("UPDATE observations SET ai_status='running', updated_at=? WHERE id=?").run(new Date().toISOString(), row.id);
      const current = storedObservation(getObservationRow(row.id));
      const result = await analyzeObservation({ config, observation: current, imagePath: row.image_path });
      progress(85);
      const now = new Date().toISOString();
      db.prepare('INSERT INTO analyses (observation_id, result_json, created_at) VALUES (?, ?, ?) ON CONFLICT(observation_id) DO UPDATE SET result_json=excluded.result_json, created_at=excluded.created_at')
        .run(row.id, JSON.stringify(result), now);
      db.prepare("UPDATE observations SET ai_status='succeeded', updated_at=? WHERE id=?").run(now, row.id);
      return result;
    });
    return reply.code(202).send(apiSuccess(request, job));
  });
  app.get('/api/v1/observations/:id/analysis', async (request, reply) => {
    const analysis = getAnalysis(request.params.id);
    if (!analysis) return reply.code(404).send(apiError(request, 'ANALYSIS_NOT_READY', 'AI 分析还未完成', true));
    return apiSuccess(request, analysis);
  });
  app.post('/api/v1/observations/:id/transcribe', async (request, reply) => {
    const row = getObservationRow(request.params.id);
    if (!row) return reply.code(404).send(apiError(request, 'OBSERVATION_NOT_FOUND', '没有找到这条观察'));
    const job = jobs.create('transcription', async () => {
      if (!row.audio_path) throw Object.assign(new Error('没有可转写的录音，请继续使用文字描述'), { code: 'AUDIO_NOT_FOUND' });
      throw Object.assign(new Error('MVP 未配置外部 ASR；录音已保留，可使用文字输入'), { code: 'ASR_NOT_CONFIGURED' });
    });
    return reply.code(202).send(apiSuccess(request, job));
  });
  app.post('/api/v1/observations/:id/tts', async (request, reply) => {
    const row = getObservationRow(request.params.id);
    const analysis = getAnalysis(request.params.id);
    if (!row || !analysis) return reply.code(409).send(apiError(request, 'ANALYSIS_REQUIRED', '请先完成 AI 分析'));
    const job = jobs.create('tts', async progress => {
      progress(35);
      const text = request.body?.textSource === 'teacherExplanation' ? analysis.teacherExplanation : analysis.ttsText;
      const speech = await synthesizeSpeech({ config, text, voice: request.body?.voiceProfile, rate: Number(request.body?.rate ?? 0) });
      progress(85);
      const bytes = await fs.readFile(speech.filePath);
      const artifact = {
        id: `audio_${crypto.randomUUID()}`,
        observationId: row.id,
        type: 'audio', templateVersion: 'windows-sapi-v1', format: 'wav', width: 0, height: 0,
        filePath: speech.filePath,
        sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
        createdAt: new Date().toISOString()
      };
      const stored = insertArtifact(artifact);
      return { ...stored, audioUrl: `/api/v1/audio/${artifact.id}`, voice: speech.voice, cached: speech.cached };
    });
    return reply.code(202).send(apiSuccess(request, job));
  });
  app.get('/api/v1/audio/:artifactId', async (request, reply) => {
    const row = db.prepare("SELECT * FROM artifacts WHERE id = ? AND type = 'audio'").get(request.params.artifactId);
    if (!row) return reply.code(404).send();
    return reply.type('audio/wav').send(await fs.readFile(row.file_path));
  });

  app.post('/api/v1/observations/:id/illustrations', async (request, reply) => {
    const row = getObservationRow(request.params.id);
    const analysis = getAnalysis(request.params.id);
    if (!row || !analysis) return reply.code(409).send(apiError(request, 'ANALYSIS_REQUIRED', '请先完成 AI 分析'));
    const job = jobs.create('illustration', async progress => {
      progress(15);
      const outputPath = path.join(config.dataDir, 'illustrations', `${row.id}.png`);
      const result = await generateIllustration({ config, observation: storedObservation(row), analysis, outputPath });
      progress(90);
      if (result.filePath) db.prepare('UPDATE observations SET illustration_path=?, updated_at=? WHERE id=?').run(result.filePath, new Date().toISOString(), row.id);
      return { provider: result.provider, label: result.label, fallbackReason: result.fallbackReason ?? null, illustrationUrl: result.filePath ? `/api/v1/observations/${row.id}/illustration` : null };
    });
    return reply.code(202).send(apiSuccess(request, job));
  });
  app.post('/api/v1/observations/:id/artifacts', async (request, reply) => {
    const row = getObservationRow(request.params.id);
    const analysis = getAnalysis(request.params.id);
    if (!row || !analysis) return reply.code(409).send(apiError(request, 'ANALYSIS_REQUIRED', '请先完成 AI 分析'));
    const type = request.body?.type === 'detail' ? 'detail' : 'postcard';
    const rendered = await renderArtifact({
      config,
      observation: storedObservation(row),
      analysis,
      type,
      includeAiIllustration: Boolean(request.body?.includeAiIllustration)
    });
    return reply.code(201).send(apiSuccess(request, insertArtifact(rendered)));
  });
  app.get('/api/v1/artifacts/:id', async (request, reply) => {
    const row = db.prepare('SELECT * FROM artifacts WHERE id = ?').get(request.params.id);
    if (!row) return reply.code(404).send(apiError(request, 'ARTIFACT_NOT_FOUND', '没有找到这件作品'));
    return apiSuccess(request, rowToArtifact(row));
  });
  app.get('/api/v1/artifacts/:id/file', async (request, reply) => {
    const row = db.prepare("SELECT * FROM artifacts WHERE id = ? AND format = 'png'").get(request.params.id);
    if (!row) return reply.code(404).send();
    return reply.type('image/png').header('content-disposition', `inline; filename="${row.id}.png"`).send(await fs.readFile(row.file_path));
  });

  app.post('/api/v1/posts', async (request, reply) => {
    const artifact = db.prepare("SELECT * FROM artifacts WHERE id = ? AND type = 'postcard'").get(request.body?.artifactId);
    if (!artifact) return reply.code(400).send(apiError(request, 'POSTCARD_REQUIRED', '请选择一张已生成的自然明信片'));
    const observation = getObservationRow(artifact.observation_id);
    const id = `post_${crypto.randomUUID()}`;
    const now = new Date().toISOString();
    const status = request.body?.moderationStatus === 'approved' ? 'approved' : 'pending';
    db.prepare(`INSERT INTO posts (id, observation_id, artifact_id, school_alias, region_code, region_label, habitat, message, moderation_status, data_source, published_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      id, observation.id, artifact.id, observation.school_alias, observation.region_code, regionLabel(observation.region_code),
      observation.habitat, clean(request.body?.message, 140, `来自${observation.location_label}的自然来信`), status, observation.data_source, now
    );
    return reply.code(201).send(apiSuccess(request, rowToPost(db.prepare('SELECT * FROM posts WHERE id = ?').get(id))));
  });
  app.get('/api/v1/posts', async request => {
    const limit = Math.min(50, Math.max(1, Number(request.query.limit ?? 20)));
    const conditions = ["moderation_status = 'approved'"];
    const params = [];
    for (const [queryKey, column] of [['regionCode', 'region_code'], ['habitat', 'habitat'], ['schoolAlias', 'school_alias'], ['dataSource', 'data_source']]) {
      if (request.query[queryKey]) { conditions.push(`${column} = ?`); params.push(request.query[queryKey]); }
    }
    if (request.query.cursor) { conditions.push('published_at < ?'); params.push(request.query.cursor); }
    params.push(limit + 1);
    const rows = db.prepare(`SELECT * FROM posts WHERE ${conditions.join(' AND ')} ORDER BY published_at DESC LIMIT ?`).all(...params);
    const hasMore = rows.length > limit;
    const items = rows.slice(0, limit).map(rowToPost);
    return apiSuccess(request, { items, nextCursor: hasMore ? items.at(-1)?.publishedAt : null });
  });
  app.get('/api/v1/posts/:id', async (request, reply) => {
    const row = db.prepare('SELECT * FROM posts WHERE id = ?').get(request.params.id);
    if (!row) return reply.code(404).send(apiError(request, 'POST_NOT_FOUND', '没有找到这封自然来信'));
    return apiSuccess(request, { ...rowToPost(row), observation: rowToObservation(getObservationRow(row.observation_id)) });
  });
  app.patch('/api/v1/posts/:id/moderation', async (request, reply) => {
    const status = request.body?.status;
    if (!['approved', 'rejected', 'pending'].includes(status)) return reply.code(400).send(apiError(request, 'MODERATION_STATUS_INVALID', '审核状态无效'));
    const result = db.prepare('UPDATE posts SET moderation_status = ? WHERE id = ?').run(status, request.params.id);
    if (!result.changes) return reply.code(404).send(apiError(request, 'POST_NOT_FOUND', '没有找到这封自然来信'));
    return apiSuccess(request, rowToPost(db.prepare('SELECT * FROM posts WHERE id = ?').get(request.params.id)));
  });
  app.get('/api/v1/stations', async request => {
    const stationRows = [
      ['BJ-MTG-SJMZ-01', '王平中学自然观察组', '110109', '北京·门头沟', 'mountain_forest_edge'],
      ['BJ-XC-XHSD-01', '什刹海少年自然组', '110102', '北京·西城', 'wetland'],
      ['BJ-HD-ZGC-01', '中关村校园观察组', '110108', '北京·海淀', 'campus'],
      ['BJ-NJY-SYZ-01', '农机站自然观察组', '110108', '北京·海淀', 'farmland']
    ];
    const counts = db.prepare('SELECT station_id, COUNT(*) count FROM observations GROUP BY station_id').all();
    const countMap = new Map(counts.map(row => [row.station_id, row.count]));
    return apiSuccess(request, stationRows.map(([stationId, schoolAlias, regionCode, region, habitat]) => ({ stationId, schoolAlias, regionCode, regionLabel: region, habitat, habitatLabel: habitatLabels[habitat], observationCount: countMap.get(stationId) ?? 0 })));
  });
  app.post('/api/v1/comparisons/questions', async request => apiSuccess(request, {
    questions: [
      '两处观察站的温度和相对光照有什么差别？这些差别是否在多次观察中重复出现？',
      '两地昆虫的活动位置有什么不同？下一次可以统一记录哪些特征来公平比较？'
    ],
    note: '问题用于引导观察，不代表环境变量与昆虫出现之间已有因果结论。'
  }));
  app.get('/api/v1/jobs/:jobId', async (request, reply) => {
    const job = jobs.get(request.params.jobId);
    if (!job) return reply.code(404).send(apiError(request, 'JOB_NOT_FOUND', '没有找到这个任务'));
    return apiSuccess(request, job);
  });

  app.addHook('onClose', async () => {
    demoSensors.stop();
    await serialBridge.disconnect();
    db.close();
  });

  app.decorate('services', { db, jobs, demoSensors, serialBridge });
  return app;
}
