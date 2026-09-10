App({
  globalData: {
    apiBase: 'http://127.0.0.1:3050/api/v1',
    currentObservationId: null
  },
  onLaunch() {
    const savedBase = wx.getStorageSync('apiBase');
    if (savedBase) this.globalData.apiBase = savedBase.replace(/\/$/, '');
  }
});
