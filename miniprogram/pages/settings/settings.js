const api = require('../../utils/api');
const { DEFAULT_API_BASE, normalizeApiBase } = require('../../utils/config');

const offlineSerial = () => ({
  connected: false,
  online: false,
  port: null,
  dataState: 'offline',
  stats: { validFrames: 0, crcErrors: 0, droppedSequences: 0 }
});

Page({
  data: {
    health: null,
    serial: offlineSerial(),
    ports: [],
    portIndex: 0,
    loading: true,
    connecting: false,
    apiBase: DEFAULT_API_BASE,
    backendError: '',
    portsError: '',
    serialError: ''
  },
  onShow() { this.setData({ apiBase: getApp().globalData.apiBase }); this.refresh(); },
  async refresh() {
    this.setData({ loading: true, backendError: '', portsError: '', serialError: '' });
    let health;
    try {
      health = await api.request('/health', { timeout: 4000 });
      this.setData({ health, serial: health.serial || offlineSerial() });
    } catch (error) {
      this.setData({ health: null, serial: offlineSerial(), ports: [], loading: false, backendError: api.diagnosticOf(error) });
      return;
    }

    try {
      const ports = await api.request('/serial/ports', { timeout: 5000 });
      const selectedIndex = Math.min(this.data.portIndex, Math.max(ports.length - 1, 0));
      this.setData({ ports, portIndex: selectedIndex, loading: false });
    } catch (error) {
      this.setData({ ports: [], loading: false, portsError: api.diagnosticOf(error) });
    }
  },
  portChange(event) { this.setData({ portIndex: Number(event.detail.value) }); },
  async modeChange(event) {
    const mode = event.detail.value ? 'demo' : 'live';
    try { await api.request('/settings/mode', { method: 'POST', data: { mode } }); await this.refresh(); }
    catch (error) { wx.showToast({ title: api.messageOf(error), icon: 'none' }); this.refresh(); }
  },
  async connect() {
    const selected = this.data.ports[this.data.portIndex];
    if (!selected) return wx.showToast({ title: '没有可用串口', icon: 'none' });
    this.setData({ connecting: true });
    try {
      await api.request('/serial/connect', { method: 'POST', data: { port: selected.port, baudRate: 115200 }, timeout: 10000 });
      wx.showToast({ title: '串口已连接' });
      await this.refresh();
    } catch (error) {
      const message = api.diagnosticOf(error);
      this.setData({ serialError: message });
      wx.showToast({ title: api.messageOf(error), icon: 'none', duration: 3500 });
      await this.refresh();
      this.setData({ serialError: message });
    }
    finally { this.setData({ connecting: false }); }
  },
  saveBase(event) {
    const value = normalizeApiBase(event.detail.value);
    getApp().globalData.apiBase = value;
    wx.setStorageSync('apiBase', value);
    this.setData({ apiBase: value });
    this.refresh();
  },
  resetBase() {
    getApp().globalData.apiBase = DEFAULT_API_BASE;
    wx.setStorageSync('apiBase', DEFAULT_API_BASE);
    this.setData({ apiBase: DEFAULT_API_BASE });
    this.refresh();
  }
});
