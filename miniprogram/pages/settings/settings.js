const api = require('../../utils/api');

Page({
  data: { health: null, ports: [], portIndex: 0, loading: true, connecting: false, apiBase: '' },
  onShow() { this.setData({ apiBase: getApp().globalData.apiBase }); this.refresh(); },
  async refresh() {
    this.setData({ loading: true });
    try {
      const [health, ports] = await Promise.all([api.request('/health'), api.request('/serial/ports')]);
      this.setData({ health, ports, loading: false });
    } catch (error) { this.setData({ health: null, loading: false }); wx.showToast({ title: api.messageOf(error), icon: 'none', duration: 2800 }); }
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
    } catch (error) { wx.showToast({ title: api.messageOf(error), icon: 'none', duration: 3000 }); }
    finally { this.setData({ connecting: false }); }
  },
  saveBase(event) {
    const value = event.detail.value.replace(/\/$/, '');
    getApp().globalData.apiBase = value;
    wx.setStorageSync('apiBase', value);
    this.setData({ apiBase: value });
  }
});
