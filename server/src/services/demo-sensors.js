export class DemoSensors {
  constructor({ stationId, onSnapshot }) {
    this.stationId = stationId;
    this.onSnapshot = onSnapshot;
    this.startedAt = Date.now();
    this.counter = 0;
    this.timer = null;
  }

  snapshot() {
    const elapsed = (Date.now() - this.startedAt) / 1000;
    const now = new Date().toISOString();
    const lightRaw = Math.round(470 + Math.sin(elapsed / 6) * 85 + Math.sin(elapsed / 2.3) * 16);
    return {
      stationId: this.stationId,
      deviceId: 'DEMO0001',
      capturedAt: now,
      receivedAt: now,
      uptimeMs: Date.now() - this.startedAt,
      temperatureC: Number((24.8 + Math.sin(elapsed / 18) * 1.4).toFixed(1)),
      humidityPct: Number((62.1 + Math.cos(elapsed / 14) * 4.2).toFixed(1)),
      lightRaw,
      lightRelativePct: Number((lightRaw / 10.23).toFixed(1)),
      humanPresence: this.counter % 12 < 3,
      statusFlags: 15,
      deviceState: 'running',
      source: 'demo'
    };
  }

  start() {
    if (this.timer) return;
    this.onSnapshot(this.snapshot());
    this.timer = setInterval(() => {
      this.counter += 1;
      this.onSnapshot(this.snapshot());
    }, 2000);
    this.timer.unref?.();
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}
