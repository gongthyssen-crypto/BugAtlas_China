# Arduino UNO R3 固件

`bug_atlas_station/bug_atlas_station.ino` 不依赖第三方 Arduino 库，直接实现 DHT11 时序和 PRD v1 二进制协议，适合现场减少依赖安装。

## 接线

| UNO | 器件 | 说明 |
| --- | --- | --- |
| D2 | DHT11 DATA | 裸器件需 10kΩ 上拉到 5V |
| A0 | 裸光敏电阻与 10kΩ 电阻的分压中点 | 5V → 光敏电阻 → A0 → 10kΩ → GND；光敏电阻无正负极 |
| D3 | HC-SR501 OUT | 可在代码中关闭 `ENABLE_PIR` |
| D13 | 板载 LED | 正常慢闪，降级/故障快闪 |

协议：115200 8N1，多字节字段 little-endian，CRC-16/CCITT-FALSE。HELLO payload 为 14 字节：8 字节设备 ID、3 字节固件版本、2 字节能力位、1 字节 MCU 复位原因。
