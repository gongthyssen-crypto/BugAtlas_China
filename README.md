# 虫迹中国——AI 自然观察站

“虫迹中国”把 Arduino 微气候采集、微信小程序观察、AI 辅助识别、自然明信片和城乡学校交流串成一条完整的博物教育体验。本仓库按 [PRD](./materials/PRD.md) 实现 MVP。

## 仓库结构

```text
firmware/       Arduino UNO R3 固件
server/         Windows 本地串口桥接、SQLite、AI/TTS、图片与 REST API
miniprogram/    微信原生小程序
materials/      PRD、路演稿和踩点材料
```

## 快速开始（无硬件、无密钥）

```powershell
pnpm install
pnpm start
```

服务默认监听 `http://127.0.0.1:3050`，首次启动自动进入带永久标识的演示模式。打开微信开发者工具，导入仓库根目录并选择“测试号”；项目配置会将小程序源码指向 `miniprogram/`，仓库不硬编码个人 AppID。在“发现昆虫”页可使用“一键载入演示观察”完整走通分析、语音、制图与发布流程。

## 真实服务配置

复制 `server/.env.example` 为仓库根目录 `.env.local`，填入本机密钥。密钥只由本地服务读取，不得写入小程序、日志或 Git。项目也支持 `KIMI_ANTHROPIC_AUTH_MODE=bearer` 以兼容不同网关认证方式。

```powershell
$env:DEMO_MODE = 'false'
pnpm start
```

## Arduino

接线：DHT11 数据接 D2；`5V → GL5528 → A0 → 10kΩ → GND`；可选 HC-SR501 OUT 接 D3；所有模块共地。D0/D1 保留给 USB 串口。

```powershell
arduino-cli core install arduino:avr@1.8.8
pnpm firmware:compile
arduino-cli upload -p COM3 --fqbn arduino:avr:uno firmware/bug_atlas_station
```

固件目标为 Arduino UNO R3，115200 bps，默认每 2 秒采样和上报。仓库脚本会优先使用忽略提交的 `tools/arduino-cli/` 本地工具；实际串口可在小程序“演示设置”页枚举和连接。

## 验证

```powershell
pnpm test
pnpm check
```

测试覆盖 CRC、粘包/拆包、无效帧恢复、核心 API 和演示模式端到端流程。真实 Arduino、微信开发者工具模拟器和外部 AI 网关仍需在对应设备/额度可用时完成最终联调。
