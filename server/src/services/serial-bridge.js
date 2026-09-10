import { EventEmitter } from 'node:events';
import { SerialPort } from 'serialport';
import { FrameParser, MessageType, decodeHello, decodeSensorReport, createConfigFrame, encodeFrame, Flags } from '../protocol/frame.js';

export class SerialBridge extends EventEmitter {
  constructor({ stationId, onSnapshot, logger }) {
    super();
    this.stationId = stationId;
    this.onSnapshot = onSnapshot;
    this.logger = logger;
    this.port = null;
    this.parser = null;
    this.portPath = null;
    this.hello = null;
    this.lastFrameAt = null;
    this.lastSequence = null;
    this.sequence = 1;
    this.manualClose = false;
    this.baudRate = 115200;
    this.reconnectAttempt = 0;
    this.reconnectTimer = null;
    this.stats = { validFrames: 0, crcErrors: 0, droppedSequences: 0, lastValidFrameAt: null };
  }

  async listPorts() {
    return SerialPort.list();
  }

  async connect(portPath, baudRate = 115200) {
    await this.disconnect();
    this.manualClose = false;
    this.portPath = portPath;
    this.baudRate = baudRate;
    this.lastFrameAt = null;
    this.hello = null;
    try {
      return await this.openPort();
    } catch (error) {
      this.scheduleReconnect();
      throw error;
    }
  }

  async openPort() {
    this.parser = new FrameParser();
    const port = new SerialPort({ path: this.portPath, baudRate: this.baudRate, autoOpen: false });
    this.port = port;
    await new Promise((resolve, reject) => this.port.open(error => error ? reject(error) : resolve()));
    port.pipe(this.parser);
    this.parser.on('data', frame => this.handleFrame(frame));
    port.on('error', error => this.logger.error({ errorCode: 'SERIAL_ERROR', message: error.message }, 'Serial error'));
    port.on('close', () => {
      this.emit('status', this.status());
      if (!this.manualClose) {
        this.logger.warn({ port: this.portPath }, 'Serial port disconnected');
        this.scheduleReconnect();
      }
    });
    this.reconnectAttempt = 0;
    setTimeout(() => {
      if (this.port?.isOpen && !this.hello) {
        this.port.write(encodeFrame({ type: MessageType.PING, flags: Flags.ACK_REQUIRED, sequence: this.sequence++ }));
      }
    }, 3000).unref?.();
    return this.status();
  }

  async disconnect() {
    this.manualClose = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    if (this.port?.isOpen) await new Promise(resolve => this.port.close(() => resolve()));
    this.port = null;
    this.parser = null;
    this.hello = null;
    this.portPath = null;
  }

  scheduleReconnect() {
    if (this.manualClose || !this.portPath || this.reconnectTimer) return;
    const delays = [1000, 2000, 5000, 10000];
    const delay = delays[Math.min(this.reconnectAttempt, delays.length - 1)];
    this.reconnectAttempt += 1;
    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;
      try {
        await this.openPort();
        this.logger.info({ port: this.portPath }, 'Serial port reconnected');
      } catch (error) {
        this.logger.warn({ port: this.portPath, errorCode: 'SERIAL_RECONNECT_FAILED', message: error.message }, 'Serial reconnect failed');
        this.scheduleReconnect();
      }
    }, delay);
    this.reconnectTimer.unref?.();
  }

  handleFrame(frame) {
    this.stats.validFrames += 1;
    this.stats.crcErrors = this.parser.stats.crcErrors;
    this.lastFrameAt = Date.now();
    this.stats.lastValidFrameAt = new Date(this.lastFrameAt).toISOString();
    if (this.lastSequence != null && frame.sequence !== ((this.lastSequence + 1) & 0xffff) && frame.type === MessageType.SENSOR_REPORT) {
      this.stats.droppedSequences += (frame.sequence - this.lastSequence - 1) & 0xffff;
    }
    if (frame.type === MessageType.SENSOR_REPORT) this.lastSequence = frame.sequence;

    try {
      if (frame.type === MessageType.HELLO) {
        this.hello = decodeHello(frame.payload);
        this.port.write(createConfigFrame(this.sequence++));
      } else if (frame.type === MessageType.SENSOR_REPORT) {
        const decoded = decodeSensorReport(frame.payload);
        const now = new Date().toISOString();
        this.onSnapshot({
          stationId: this.stationId,
          deviceId: this.hello?.deviceId ?? 'UNO-UNKNOWN',
          capturedAt: now,
          receivedAt: now,
          ...decoded,
          source: 'live'
        });
      }
    } catch (error) {
      this.logger.warn({ errorCode: 'SERIAL_PAYLOAD_INVALID', message: error.message }, 'Ignored invalid serial payload');
    }
    this.emit('status', this.status());
  }

  status() {
    const age = this.lastFrameAt ? Date.now() - this.lastFrameAt : null;
    return {
      connected: Boolean(this.port?.isOpen),
      online: Boolean(this.port?.isOpen && age != null && age <= 15000),
      port: this.portPath,
      dataState: age == null || age > 15000 ? 'offline' : age > 6000 ? 'stale' : 'live',
      hello: this.hello,
      stats: { ...this.stats, crcErrors: this.parser?.stats.crcErrors ?? this.stats.crcErrors }
    };
  }
}
