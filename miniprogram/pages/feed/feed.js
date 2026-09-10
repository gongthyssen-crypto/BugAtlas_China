const api = require('../../utils/api');

Page({
  data: {
    loading: true, posts: [], stations: [],
    filters: [{ value: '', label: '全部' }, { value: 'mountain_forest_edge', label: '山地' }, { value: 'wetland', label: '湿地' }, { value: 'farmland', label: '农田' }, { value: 'campus', label: '校园' }],
    activeHabitat: ''
  },
  onShow() { this.load(); },
  onPullDownRefresh() { this.load().finally(() => wx.stopPullDownRefresh()); },
  async load() {
    this.setData({ loading: true });
    try {
      const suffix = this.data.activeHabitat ? `?habitat=${encodeURIComponent(this.data.activeHabitat)}` : '';
      const [feed, stations] = await Promise.all([api.request(`/posts${suffix}`), api.request('/stations')]);
      this.setData({ posts: feed.items.map(post => ({ ...post, artifactUrl: api.absolute(post.artifactUrl), dateLabel: post.publishedAt.slice(0, 10) })), stations, loading: false });
    } catch (error) { this.setData({ loading: false }); wx.showToast({ title: api.messageOf(error), icon: 'none' }); }
  },
  selectFilter(event) { this.setData({ activeHabitat: event.currentTarget.dataset.value }, () => this.load()); },
  preview(event) { wx.previewImage({ current: event.currentTarget.dataset.url, urls: [event.currentTarget.dataset.url] }); },
  createObservation() { wx.switchTab({ url: '/pages/observe/observe' }); }
});
