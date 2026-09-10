const api = require('../../utils/api');

Page({
  data: {
    loading: true,
    snapshot: null,
    health: null,
    historyBars: [],
    greeting: '把一次偶遇，变成一页可验证的自然记录。'
  },
  onShow() {
    this.refresh();
    this.timer = setInterval(() => this.refresh(false), 2000);
  },
  onHide() { clearInterval(this.timer); },
  onUnload() { clearInterval(this.timer); },
  async refresh(showError = true) {
    try {
      const [snapshot, health, history] = await Promise.all([
        api.request('/sensors/latest'), api.request('/health'), api.request('/sensors/history?limit=14')
      ]);
      const values = history.map(item => item.lightRaw || 0);
      const max = Math.max(...values, 1);
      const displaySource = snapshot.source === 'demo' ? 'demo' : (health.serial.dataState === 'offline' ? 'offline' : snapshot.source);
      this.setData({
        loading: false,
        snapshot: { ...snapshot, displaySource },
        health,
        historyBars: values.map((value, index) => ({ id: index, height: Math.max(10, Math.round(value / max * 100)) }))
      });
    } catch (error) {
      this.setData({ loading: false, snapshot: null });
      if (showError) wx.showToast({ title: api.messageOf(error), icon: 'none', duration: 2600 });
    }
  },
  startObservation() { wx.switchTab({ url: '/pages/observe/observe' }); },
  openSettings() { wx.switchTab({ url: '/pages/settings/settings' }); }
});
