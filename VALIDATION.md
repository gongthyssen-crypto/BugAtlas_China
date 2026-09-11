# MVP 验证记录

验证日期：2026-09-11（Asia/Shanghai）

## 已通过

- Node.js `v24.13.0`、pnpm `11.2.2`。
- Arduino CLI `1.5.1`、Arduino AVR Boards Core `1.8.8`。
- Arduino UNO 编译：Flash 4,670 / 32,256 bytes（14%）；SRAM 507 / 2,048 bytes（24%）。
- 协议自动测试：CRC-16/CCITT-FALSE、噪声/拆包/粘包、CRC 错误恢复、传感器无效哨兵值。
- 服务端演示流程：模拟遥测、观察冻结、候选分析、插画、TTS、两种 PNG、审核发布、广场筛选。
- Windows SAPI：已生成 16 kHz、16-bit、单声道 WAV；当前系统可用中文语音包含 Microsoft Huihui、Kangkang、Yaoyao。
- 作品尺寸：自然明信片 1600×1000 PNG；博物详解图 1080×1920 PNG。
- GPT Image 2 兼容网关：真实最小请求成功，返回 PNG（网关实际返回 1254×1254，服务端会在模板合成阶段裁切到目标版式）。
- Kimi 多模态：使用项目本机凭证完成真实端到端分析，任务状态 `succeeded`、服务标识 `kimi-anthropic`，在演示传感器模式且没有 Arduino 参与时也能返回昆虫候选，没有触发演示回退。
- 小程序分析请求：修复无参数 POST 声明 JSON 却不发送请求体导致 Fastify 立即返回 400 的问题，并加入请求格式回归测试。
- 小程序静态检查：6 个页面所需 JS/JSON/WXML/WXSS 文件齐全，所有 JS 和 JSON 可解析。

## 需要带设备/工具完成的最终验收

- 当前电脑已枚举到 Arduino 对应的 COM3，但测试时端口被 Arduino IDE 串口监视器占用，后端会明确返回 `SERIAL_PORT_BUSY`。尚需关闭串口监视器后完成固件上传、30 分钟有效帧率、拔插重连与传感器断线实测。
- 微信开发者工具模拟器已连接 `127.0.0.1:3150` 并成功访问后端；仍需使用实际拍照流程完成 `wx.chooseMedia` / `wx.saveImageToPhotosAlbum` 权限与真机视觉实测。

## 建议现场验收顺序

1. 接好 DHT11、裸光敏电阻 + 10kΩ 分压与可选 PIR 后插入 UNO。
2. 上传固件，在小程序设置页连接对应 COM 口，观察状态由离线变为实时。
3. 分别遮挡 DHT11、用手电照射光敏电阻、拔掉 USB，核对降级/陈旧/离线标识。
4. 先在演示传感器模式跑一遍真实 Kimi，再连接 Arduino 验证完整流程；若外部 AI 超时，继续使用带“演示分析”标识的回退流程。
