import { Transform } from 'node:stream';
import { crc16Ccitt } from './crc16.js';

export const MessageType = Object.freeze({
  HELLO: 0x01,
  SENSOR_REPORT: 0x02,
  EVENT_REPORT: 0x03,
  CONFIG_SET: 0x10,
  CONFIG_ACK: 0x11,
  PING: 0x12,
  PONG: 0x13,
  ERROR: 0x7f
});

export const Flags = Object.freeze({ ACK_REQUIRED: 0x01, IS_ACK: 0x02, IS_ERROR: 0x04 });

export function encodeFrame({ type, flags = 0, sequence = 0, payload = Buffer.alloc(0) }) {
  if (payload.length > 128) throw new RangeError('Payload exceeds 128 bytes');
  const output = Buffer.alloc(12 + payload.length);
  output[0] = 0xaa;
  output[1] = 0x55;
  output[2] = 0x01;
  output[3] = type;
  output[4] = flags;
  output[5] = 0;
  output.writeUInt16LE(sequence & 0xffff, 6);
  output.writeUInt16LE(payload.length, 8);
  payload.copy(output, 10);
  output.writeUInt16LE(crc16Ccitt(output.subarray(2, 10 + payload.length)), 10 + payload.length);
  return output;
}

export class FrameParser extends Transform {
  constructor(options = {}) {
    super({ ...options, readableObjectMode: true });
    this.buffer = Buffer.alloc(0);
    this.stats = { validFrames: 0, crcErrors: 0, invalidLengths: 0, unsupportedVersions: 0 };
  }

  _transform(chunk, _encoding, callback) {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    while (this.buffer.length >= 2) {
      const preamble = this.buffer.indexOf(Buffer.from([0xaa, 0x55]));
      if (preamble < 0) {
        this.buffer = this.buffer.subarray(Math.max(0, this.buffer.length - 1));
        break;
      }
      if (preamble > 0) this.buffer = this.buffer.subarray(preamble);
      if (this.buffer.length < 10) break;
      const payloadLength = this.buffer.readUInt16LE(8);
      if (payloadLength > 128) {
        this.stats.invalidLengths += 1;
        this.buffer = this.buffer.subarray(1);
        continue;
      }
      const totalLength = 12 + payloadLength;
      if (this.buffer.length < totalLength) break;
      const packet = this.buffer.subarray(0, totalLength);
      this.buffer = this.buffer.subarray(totalLength);
      const expectedCrc = packet.readUInt16LE(10 + payloadLength);
      const actualCrc = crc16Ccitt(packet.subarray(2, 10 + payloadLength));
      if (expectedCrc !== actualCrc) {
        this.stats.crcErrors += 1;
        continue;
      }
      if (packet[2] !== 0x01) {
        this.stats.unsupportedVersions += 1;
        continue;
      }
      this.stats.validFrames += 1;
      this.push({
        version: packet[2],
        type: packet[3],
        flags: packet[4],
        reserved: packet[5],
        sequence: packet.readUInt16LE(6),
        payload: Buffer.from(packet.subarray(10, 10 + payloadLength))
      });
    }
    callback();
  }
}

export function decodeHello(payload) {
  if (payload.length < 14) throw new RangeError('HELLO payload must be 14 bytes');
  return {
    deviceId: payload.subarray(0, 8).toString('ascii').replace(/\0+$/, ''),
    firmwareVersion: `${payload[8]}.${payload[9]}.${payload[10]}`,
    capabilities: payload.readUInt16LE(11),
    resetCause: payload[13]
  };
}

export function decodeSensorReport(payload) {
  if (payload.length !== 16) throw new RangeError('SENSOR_REPORT payload must be 16 bytes');
  const statusFlags = payload.readUInt16LE(11);
  const temperatureRaw = payload.readInt16LE(4);
  const humidityRaw = payload.readUInt16LE(6);
  const lightRaw = payload.readUInt16LE(8);
  return {
    uptimeMs: payload.readUInt32LE(0),
    temperatureC: statusFlags & 1 && temperatureRaw !== -32768 ? temperatureRaw / 10 : null,
    humidityPct: statusFlags & 1 && humidityRaw !== 0xffff ? humidityRaw / 10 : null,
    lightRaw: statusFlags & 2 && lightRaw !== 0xffff ? lightRaw : null,
    lightRelativePct: statusFlags & 2 && lightRaw !== 0xffff ? Number((lightRaw / 10.23).toFixed(1)) : null,
    humanPresence: statusFlags & 4 && payload[10] !== 0xff ? Boolean(payload[10]) : null,
    statusFlags,
    deviceState: ['initializing', 'running', 'degraded', 'fault'][payload[13]] ?? 'fault',
    sampleCounter: payload.readUInt16LE(14)
  };
}

export function createConfigFrame(sequence, { sampleIntervalMs = 2000, reportIntervalMs = 2000, pirEnabled = true } = {}) {
  const payload = Buffer.alloc(6);
  payload.writeUInt16LE(sampleIntervalMs, 0);
  payload.writeUInt16LE(reportIntervalMs, 2);
  payload[4] = pirEnabled ? 1 : 0;
  return encodeFrame({ type: MessageType.CONFIG_SET, flags: Flags.ACK_REQUIRED, sequence, payload });
}
