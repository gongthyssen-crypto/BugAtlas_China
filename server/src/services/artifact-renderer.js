import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const palette = { ink: '#20281f', moss: '#52613d', paper: '#f3eddc', rust: '#b85e38', gold: '#d7ae57', fog: '#d9deca' };

function esc(value = '') {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function wrap(value, max = 22, lines = 5) {
  const chars = [...String(value ?? '')];
  const result = [];
  while (chars.length && result.length < lines) result.push(chars.splice(0, max).join(''));
  if (chars.length && result.length) result[result.length - 1] = `${result[result.length - 1].slice(0, -1)}…`;
  return result;
}

function textLines(lines, x, y, fontSize, lineHeight, options = {}) {
  const { fill = palette.ink, weight = 400, anchor = 'start', letterSpacing = 0 } = options;
  return lines.map((line, index) => `<text x="${x}" y="${y + index * lineHeight}" text-anchor="${anchor}" font-family="Microsoft YaHei, SimHei, sans-serif" font-size="${fontSize}" font-weight="${weight}" letter-spacing="${letterSpacing}" fill="${fill}">${esc(line)}</text>`).join('');
}

async function frameImage(inputPath, width, height, { preserveWhole = false } = {}) {
  const resizeOptions = preserveWhole
    ? { fit: 'contain', position: 'centre', background: palette.paper }
    : { fit: 'cover', position: 'centre' };
  return sharp(inputPath)
    .rotate()
    .resize(width, height, resizeOptions)
    .modulate({ saturation: 0.92 })
    .png()
    .toBuffer();
}

export async function createDemoObservationImage(outputPath) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1400" height="1000"><defs><radialGradient id="b"><stop stop-color="#f3d56f"/><stop offset="1" stop-color="#708449"/></radialGradient><filter id="g"><feTurbulence baseFrequency=".18" numOctaves="2" seed="4"/><feBlend in="SourceGraphic" mode="soft-light"/></filter></defs><rect width="1400" height="1000" fill="#738348"/><circle cx="1100" cy="180" r="350" fill="#c6d395" opacity=".4"/><path d="M0 920C330 690 450 500 590 0M1400 950C1100 690 970 480 850 0" stroke="#dfe5b7" stroke-width="60" opacity=".38" fill="none"/><g transform="translate(700 500) rotate(-8)" stroke="#282d23" stroke-width="14" stroke-linecap="round"><ellipse cy="35" rx="88" ry="210" fill="#b98338"/><ellipse cy="-155" rx="66" ry="74" fill="#242b22"/><path d="M-64-190L-150-280M64-190L150-280M-78-70L-280-210M78-70L280-210M-90 30L-310 15M90 30L310 15M-70 145L-250 300M70 145L250 300" fill="none"/><path d="M-62-40C-300-180-360 40-220 190C-100 305-55 140-62-40ZM62-40C300-180 360 40 220 190C100 305 55 140 62-40Z" fill="#d9ddc0" opacity=".88"/><path d="M-78-20H78M-86 55H86M-74 130H74" stroke="#f3c44d" stroke-width="32"/></g><rect width="1400" height="1000" filter="url(#g)" opacity=".09"/></svg>`;
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await sharp(Buffer.from(svg)).jpeg({ quality: 91 }).toFile(outputPath);
}

export async function renderArtifact({ config, observation, analysis, type, includeAiIllustration = false }) {
  const artifactId = `art_${crypto.randomUUID()}`;
  const outputDir = path.join(config.dataDir, 'artifacts');
  const outputPath = path.join(outputDir, `${artifactId}.png`);
  await fs.mkdir(outputDir, { recursive: true });
  const preferredImage = includeAiIllustration && observation.illustrationPath ? observation.illustrationPath : observation.imagePath;
  const candidate = analysis?.candidates?.[0];
  const commonName = candidate?.commonName ?? '等待更多证据的自然访客';
  const sensor = observation.sensorSnapshot ?? {};
  if (type === 'detail') await renderDetail({ outputPath, imagePath: preferredImage, observation, analysis, commonName, sensor, aiImage: includeAiIllustration && Boolean(observation.illustrationPath) });
  else await renderPostcard({ outputPath, imagePath: preferredImage, observation, analysis, commonName, sensor, aiImage: includeAiIllustration && Boolean(observation.illustrationPath) });
  const bytes = await fs.readFile(outputPath);
  const metadata = await sharp(bytes).metadata();
  return {
    id: artifactId,
    observationId: observation.id,
    type: type === 'detail' ? 'detail' : 'postcard',
    templateVersion: type === 'detail' ? 'museum-detail-v1' : 'museum-postcard-v1',
    format: 'png',
    width: metadata.width,
    height: metadata.height,
    filePath: outputPath,
    sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
    createdAt: new Date().toISOString()
  };
}

async function renderPostcard({ outputPath, imagePath, observation, analysis, commonName, sensor, aiImage }) {
  const photo = await frameImage(imagePath, 900, 720, { preserveWhole: aiImage });
  const prose = wrap(analysis?.postcardText ?? analysis?.childExplanation ?? '记录一只昆虫，也记录它出现时的风、光与空气。', 14, 6);
  const date = new Date(observation.capturedAt).toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' });
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1000">
    <rect width="1600" height="1000" fill="${palette.paper}"/><path d="M0 905C300 810 545 900 815 832S1300 735 1600 845V1000H0Z" fill="${palette.fog}"/>
    <rect x="50" y="50" width="1500" height="900" rx="8" fill="none" stroke="${palette.ink}" stroke-width="2"/>
    <rect x="80" y="82" width="900" height="720" fill="#fff" stroke="${palette.ink}" stroke-width="3"/>
    <image x="80" y="82" width="900" height="720" href="data:image/png;base64,${photo.toString('base64')}"/>
    <rect x="1040" y="88" width="430" height="104" fill="${palette.ink}"/>
    ${textLines(['虫迹中国'], 1075, 157, 46, 54, { fill: palette.paper, weight: 700, letterSpacing: 8 })}
    ${textLines(['NATURE POST · 001'], 1077, 225, 18, 24, { fill: palette.rust, weight: 700, letterSpacing: 3 })}
    ${textLines(wrap(`候选｜${commonName}`, 14, 2), 1045, 305, 36, 52, { weight: 700 })}
    <line x1="1045" y1="392" x2="1470" y2="392" stroke="${palette.gold}" stroke-width="6"/>
    ${textLines(prose, 1045, 452, 27, 46)}
    <circle cx="1410" cy="730" r="72" fill="none" stroke="${palette.rust}" stroke-width="4"/><circle cx="1410" cy="730" r="58" fill="none" stroke="${palette.rust}" stroke-width="1"/>
    ${textLines(['自然', '来信'], 1410, 719, 23, 31, { fill: palette.rust, weight: 700, anchor: 'middle', letterSpacing: 5 })}
    ${textLines([observation.locationLabel, `${date} · ${observation.schoolAlias}`], 82, 855, 23, 38, { fill: palette.moss })}
    ${textLines([`${sensor.temperatureC ?? '—'}℃ · ${sensor.humidityPct ?? '—'}%RH`, `光照 ${sensor.lightRaw ?? '—'}`], 1015, 852, 19, 35, { weight: 700 })}
    ${textLines([observation.dataSource === 'demo' ? '演示数据 · 不计入真实统计' : '现场观察数据', aiImage ? 'AI 艺术化示意图 · 不参与识别' : '学生观察原图'], 1470, 852, 18, 35, { fill: palette.rust, anchor: 'end' })}
    ${textLines(['AI 辅助分析，仅供自然教育；请结合持续观察或专家资料核验。'], 800, 935, 17, 20, { fill: '#5f6657', anchor: 'middle' })}
  </svg>`;
  await sharp(Buffer.from(svg)).png().toFile(outputPath);
}

async function renderDetail({ outputPath, imagePath, observation, analysis, commonName, sensor, aiImage }) {
  const photo = await frameImage(imagePath, 940, 690, { preserveWhole: aiImage });
  const candidate = analysis?.candidates?.[0];
  const evidence = (candidate?.evidence ?? ['当前证据不足']).slice(0, 4).map(item => `· ${item}`);
  const verify = (candidate?.verifyNext ?? ['换一个角度补拍', '记录昆虫的动作']).slice(0, 4).map((item, index) => `${index + 1}. ${item}`);
  const teacher = wrap(analysis?.teacherExplanation ?? '观察仍需更多可核验特征。', 30, 7);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920">
    <rect width="1080" height="1920" fill="${palette.paper}"/><rect x="34" y="34" width="1012" height="1852" fill="none" stroke="${palette.ink}" stroke-width="2"/>
    ${textLines(['虫宿博物志'], 70, 105, 34, 40, { fill: palette.rust, weight: 700, letterSpacing: 8 })}
    ${textLines(['FIELD NOTE / 观察标本页'], 1010, 103, 17, 22, { fill: palette.moss, anchor: 'end', letterSpacing: 2 })}
    <image x="70" y="145" width="940" height="690" href="data:image/png;base64,${photo.toString('base64')}"/>
    <rect x="70" y="835" width="940" height="40" fill="${palette.ink}" opacity=".9"/>
    ${textLines([aiImage ? 'AI 艺术化示意图 · 不参与识别' : `${observation.locationLabel} · 学生观察原图`], 95, 862, 17, 21, { fill: palette.paper })}
    ${textLines(['首要候选'], 70, 910, 20, 26, { fill: palette.rust, weight: 700, letterSpacing: 3 })}
    ${textLines([commonName], 70, 978, 54, 60, { weight: 700 })}
    ${textLines(['为什么这样想'], 70, 1055, 25, 30, { fill: palette.moss, weight: 700 })}
    ${textLines(evidence, 70, 1105, 23, 39)}
    <rect x="570" y="890" width="440" height="305" rx="12" fill="#dfe2cf"/>
    ${textLines(['环境快照'], 610, 945, 23, 30, { fill: palette.moss, weight: 700 })}
    ${textLines([`${sensor.temperatureC ?? '—'} ℃  温度`, `${sensor.humidityPct ?? '—'} %RH  湿度`, `${sensor.lightRaw ?? '—'} / 1023  相对光照`, observation.dataSource === 'demo' ? '演示数据' : '现场数据'], 610, 1000, 26, 47, { weight: 700 })}
    <line x1="70" y1="1245" x2="1010" y2="1245" stroke="${palette.gold}" stroke-width="6"/>
    ${textLines(['下一次，继续看什么？'], 70, 1315, 28, 34, { fill: palette.rust, weight: 700 })}
    ${textLines(verify, 70, 1370, 25, 45)}
    ${textLines(['给教师的观察提示'], 70, 1585, 25, 30, { fill: palette.moss, weight: 700 })}
    ${textLines(teacher, 70, 1635, 21, 35)}
    <rect x="70" y="1780" width="940" height="70" fill="${palette.ink}"/>
    ${textLines(['AI 辅助分析，仅供自然教育；请保持距离，不要徒手捕捉未知昆虫。'], 540, 1825, 17, 20, { fill: palette.paper, anchor: 'middle' })}
  </svg>`;
  await sharp(Buffer.from(svg)).png().toFile(outputPath);
}
