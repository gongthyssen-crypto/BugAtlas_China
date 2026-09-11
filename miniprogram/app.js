const { DEFAULT_API_BASE, LEGACY_API_BASE, normalizeApiBase } = require('./utils/config');

App({
  globalData: {
    apiBase: DEFAULT_API_BASE,
    currentObservationId: null
  },
  onLaunch() {
    const savedBase = wx.getStorageSync('apiBase');
    const normalized = normalizeApiBase(savedBase || DEFAULT_API_BASE);
    this.globalData.apiBase = normalized === LEGACY_API_BASE ? DEFAULT_API_BASE : normalized;
    wx.setStorageSync('apiBase', this.globalData.apiBase);
  }
});
