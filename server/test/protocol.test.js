import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { crc16Ccitt } from '../src/protocol/crc16.js';
import { decodeSensorReport, encodeFrame, FrameParser, MessageType } from '../src/protocol/frame.js';

test('CRC-16/CCITT-FALSE matches the canonical check value', () => {
  assert.equal(crc16Ccitt(Buffer.from('123456789')), 0x29b1);
});

test('frame parser handles noise, split packets and concatenated packets', async () => {
  const first = encodeFrame({ type: MessageType.PING, sequence: 9, payload: Buffer.from([1, 2, 3]) });
  const second = encodeFrame({ type: MessageType.PONG, sequence: 10 });
  const parser = new FrameParser();
  const frames = [];
  parser.on('data', frame => frames.push(frame));
  parser.write(Buffer.concat([Buffer.from([0, 7, 0xaa]), first.subarray(0, 5)]));
  parser.end(Buffer.concat([first.subarray(5), second]));
  await once(parser, 'end');
  assert.equal(frames.length, 2);
  assert.equal(frames[0].sequence, 9);
  assert.deepEqual(frames[0].payload, Buffer.from([1, 2, 3]));
  assert.equal(frames[1].type, MessageType.PONG);
});

test('frame parser rejects CRC errors and recovers for the next frame', async () => {
  const bad = encodeFrame({ type: MessageType.PING, sequence: 1 });
  bad[4] ^= 0x04;
  const good = encodeFrame({ type: MessageType.PONG, sequence: 2 });
  const parser = new FrameParser();
  const frames = [];
  parser.on('data', frame => frames.push(frame));
  parser.end(Buffer.concat([bad, good]));
  await once(parser, 'end');
  assert.equal(parser.stats.crcErrors, 1);
  assert.equal(frames.length, 1);
  assert.equal(frames[0].sequence, 2);
});

test('sensor payload respects validity flags and sentinel values', () => {
  const payload = Buffer.alloc(16);
  payload.writeUInt32LE(12345, 0);
  payload.writeInt16LE(-32768, 4);
  payload.writeUInt16LE(0xffff, 6);
  payload.writeUInt16LE(640, 8);
  payload[10] = 1;
  payload.writeUInt16LE(0b110, 11);
  payload[13] = 2;
  payload.writeUInt16LE(77, 14);
  const value = decodeSensorReport(payload);
  assert.equal(value.temperatureC, null);
  assert.equal(value.humidityPct, null);
  assert.equal(value.lightRaw, 640);
  assert.equal(value.humanPresence, true);
  assert.equal(value.deviceState, 'degraded');
});
