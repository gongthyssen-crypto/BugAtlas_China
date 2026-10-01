# 现有文件说明

本文是仓库文件索引，按职责说明当前纳入 Git 的文件。项目定位、运行步骤、接线和接口用法见 [README.md](README.md)；验证进度见 [VALIDATION.md](VALIDATION.md)。路径中的 `presention/` 是仓库现有目录名。

## 根目录

| 文件 | 用途 |
| --- | --- |
| `README.md` | 项目总览，包含硬件清单、运行方式、配置、接线、小程序导入与常见问题。 |
| `FILES.md` | 本文件，帮助按职责定位仓库中的文件。 |
| `VALIDATION.md` | 已完成的验证记录和仍需现场完成的验收项。 |
| `昆虫旅馆设计方案-精简版` | 早期产品方案文本，记录场景、硬件和观察流程等设计思路；文件无扩展名。 |
| `package.json` | pnpm 工作区的顶层命令入口：启动、开发、测试、检查与固件编译。 |
| `pnpm-workspace.yaml` | 将 `server/` 声明为工作区包，并配置需要本地编译的依赖。 |
| `pnpm-lock.yaml` | 锁定 JavaScript 依赖版本，供可重复安装使用。 |
| `project.config.json` | 微信开发者工具从仓库根目录导入小程序时使用的工程配置。 |
| `start-backend.ps1` | Windows 后端启动脚本：读取本机配置、检查已有进程、启动服务并检查健康状态。 |
| `stop-backend.ps1` | Windows 后端关闭脚本：核对进程后停止本项目服务。 |
| `.gitignore` | 排除本机凭证、依赖、运行数据、工具和生成文件。 |

## `docs/`：公开接线图

| 文件 | 用途 |
| --- | --- |
| `docs/arduino-wiring.svg` | Arduino UNO、DHT11、光敏电阻和可选人体红外模块的矢量接线图；README 使用此图。 |
| `docs/arduino-wiring.png` | 同一接线图的位图版本，便于预览或插入其他材料。 |

## `firmware/`：Arduino 固件

| 文件 | 用途 |
| --- | --- |
| `firmware/README.md` | 固件接线、串口参数及 HELLO 数据帧说明。 |
| `firmware/bug_atlas_station/bug_atlas_station.ino` | UNO 主程序：采集温湿度、相对光照和可选人体感应数据，维护状态灯，并通过串口收发协议帧。 |
| `firmware/bug_atlas_station/protocol_types.h` | 接收帧结构定义，供固件的协议处理代码使用。 |

## `server/`：本地后端

后端负责 HTTP 接口、SQLite、Arduino 串口、分析、插画、作品合成和语音。运行时文件默认写入被 Git 忽略的 `server/data/`。

| 文件 | 用途 |
| --- | --- |
| `server/package.json` | 后端依赖及 `dev`、`start`、`test`、`check` 命令。 |
| `server/.env.example` | 环境变量示例；复制到根目录 `.env.local` 后再填写本机配置。 |
| `server/src/index.js` | 后端进程入口：创建配置和应用并启动监听。 |
| `server/src/config.js` | 加载本机环境变量，设置监听地址、数据目录、演示模式和外部服务参数。 |
| `server/src/app.js` | Fastify 应用和 REST 接口：设备、传感器、观察、异步任务、作品、语音、审核与广场。 |
| `server/src/db.js` | 建立 SQLite 数据库和表，并将数据库记录转换为接口数据。 |
| `server/src/protocol/crc16.js` | 串口协议使用的 CRC-16/CCITT-FALSE 校验。 |
| `server/src/protocol/frame.js` | 协议帧编码、解析以及 HELLO、传感器报告等载荷解码。 |
| `server/src/services/serial-bridge.js` | 枚举和连接串口、处理数据帧、统计通信状态及断线重连。 |
| `server/src/services/demo-sensors.js` | 无硬件时定时生成并标记演示传感器快照。 |
| `server/src/services/jobs.js` | 管理分析、插画、语音等异步任务的状态。 |
| `server/src/services/analysis.js` | 生成谨慎的昆虫候选分析；配置凭证时调用 Kimi，否则提供明确标记的演示结果。 |
| `server/src/services/illustration.js` | 调用图片服务生成无文字昆虫示意图，并处理不可用时的回退。 |
| `server/src/services/artifact-renderer.js` | 将照片或插画、文字和环境数据排版为自然明信片及博物详解图，也生成演示观察图。 |
| `server/src/services/tts.js` | 调用 Windows SAPI 生成并缓存讲解语音。 |
| `server/scripts/sapi-tts.ps1` | 供语音服务调用的 Windows SAPI PowerShell 脚本。 |
| `server/scripts/check-project.js` | 检查 JavaScript、JSON 是否可解析，以及六个小程序页面文件是否齐全。 |
| `server/scripts/live-adapters-smoke.js` | 使用已配置的真实凭证联通分析与图片服务的手动冒烟脚本。 |

### `server/test/`：自动测试

| 文件 | 验证内容 |
| --- | --- |
| `app.test.js` | 演示模式下观察、分析、作品和广场的完整流程。 |
| `artifact-renderer.test.js` | AI 插画在两种作品版式中的完整显示。 |
| `mentor-page.test.js` | AI 小导师页面恢复及分析失败时的提示。 |
| `miniprogram-api.test.js` | 小程序 GET、POST 请求体格式。 |
| `protocol.test.js` | CRC、拆包与粘包、错误帧恢复、无效传感器值。 |
| `settings-retry.test.js` | 设置页在可见期间的自动重连检查。 |

## `miniprogram/`：微信原生小程序

| 文件 | 用途 |
| --- | --- |
| `miniprogram/app.js` | 小程序入口，初始化本地后端地址，并在运行期间维护当前观察记录 ID。 |
| `miniprogram/app.json` | 注册六个页面、导航栏、底部标签与全局窗口设置。 |
| `miniprogram/app.wxss` | 全局配色、排版和通用组件样式。 |
| `miniprogram/sitemap.json` | 小程序页面索引规则。 |
| `miniprogram/utils/config.js` | 默认 API 地址和地址格式规范化。 |
| `miniprogram/utils/api.js` | HTTP 请求、照片与录音上传、异步任务轮询和错误信息处理。 |

每个 `miniprogram/pages/<页面名>/` 目录都有同名的四个文件：`.js` 处理页面数据与交互，`.json` 配置页面，`.wxml` 定义界面结构，`.wxss` 定义页面样式。

| 页面目录 | 页面职责 |
| --- | --- |
| `pages/home/` | 观察站首页，展示当前环境快照、光照历史和服务状态。 |
| `pages/observe/` | 拍照、文字或录音记录、地点与生境填写，以及提交观察或演示观察。 |
| `pages/mentor/` | 展示候选昆虫、儿童版与教师版讲解、安全提醒，并播放语音。 |
| `pages/studio/` | 生成插画、明信片和详解图，预览、保存并提交发布。 |
| `pages/feed/` | 展示已发布作品，按生境筛选并预览图片。 |
| `pages/settings/` | 查看本地服务和串口状态、切换演示模式、连接 Arduino、设置 API 地址。 |

`miniprogram/components/status-pill/` 是环境数据状态徽标；目录中的 `.js` 根据数据来源与时效生成标签，`.json`、`.wxml`、`.wxss` 分别定义组件配置、结构和样式。

## `presention/`：展示素材

| 文件 | 用途 |
| --- | --- |
| `presention/虫宿博物志-创客马拉松-路演.html` | 可在浏览器中查看的路演展示页面。 |
| `presention/虫宿博物志-海报-01.png`、`虫宿博物志-海报-02.png` | 两张成品海报。 |
| `presention/海报草图.png` | 海报设计草图。 |
| `presention/明信片样例.png` | 自然明信片示例图。 |
| `presention/博物观察标本页样例.png` | 博物观察标本页示例图。 |

## 本机目录与未纳入 Git 的文件

`materials/` 存放本机产品资料、调研和私有配置；`tools/` 存放本机工具；`output/` 存放生成物；`node_modules/` 和 `server/node_modules/` 是依赖；`server/data/` 是数据库、上传内容、作品、语音和日志。它们均被 Git 忽略，不属于公开文件清单。根目录 `project.private.config.json`、`miniprogram/project.config.json`、`miniprogram/project.private.config.json` 是本机微信开发者工具配置；如创建根目录 `.env.local`，它用于保存本机环境变量。请勿将这些本机文件中的凭证写入仓库。
