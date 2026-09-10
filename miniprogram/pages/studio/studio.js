const api = require('../../utils/api');

Page({
  data: {
    id: '', observation: null, analysis: null, illustrationUrl: '', includeIllustration: false,
    illustrationLoading: false, artifactLoading: false, progressText: '', postcard: null, detail: null, publishing: false
  },
  onLoad(options) {
    this.setData({ id: options.id || getApp().globalData.currentObservationId });
    this.load();
  },
  async load() {
    try {
      const observation = await api.request(`/observations/${this.data.id}`);
      this.setData({ observation, analysis: observation.analysis, illustrationUrl: api.absolute(observation.illustrationUrl) });
    } catch (error) { wx.showToast({ title: api.messageOf(error), icon: 'none' }); }
  },
  toggleIllustration(event) { this.setData({ includeIllustration: event.detail.value }); },
  async createIllustration() {
    this.setData({ illustrationLoading: true });
    try {
      const job = await api.request(`/observations/${this.data.id}/illustrations`, { method: 'POST', data: {} });
      const result = await api.waitForJob(job.id, { timeout: 150000 });
      this.setData({ illustrationUrl: api.absolute(result.illustrationUrl), includeIllustration: true });
      wx.showToast({ title: result.label, icon: 'none' });
    } catch (error) { wx.showToast({ title: api.messageOf(error), icon: 'none', duration: 3000 }); }
    finally { this.setData({ illustrationLoading: false }); }
  },
  async createArtifacts() {
    this.setData({ artifactLoading: true, progressText: '编排中文与环境数据…' });
    const payload = { includeAiIllustration: this.data.includeIllustration };
    try {
      const [postcard, detail] = await Promise.all([
        api.request(`/observations/${this.data.id}/artifacts`, { method: 'POST', data: { ...payload, type: 'postcard', templateId: 'museum-postcard-v1' }, timeout: 10000 }),
        api.request(`/observations/${this.data.id}/artifacts`, { method: 'POST', data: { ...payload, type: 'detail', templateId: 'museum-detail-v1' }, timeout: 10000 })
      ]);
      this.setData({ postcard: { ...postcard, previewUrl: api.absolute(postcard.fileUrl) }, detail: { ...detail, previewUrl: api.absolute(detail.fileUrl) } });
    } catch (error) { wx.showToast({ title: api.messageOf(error), icon: 'none', duration: 3000 }); }
    finally { this.setData({ artifactLoading: false, progressText: '' }); }
  },
  preview(event) {
    const url = event.currentTarget.dataset.url;
    wx.previewImage({ current: url, urls: [url] });
  },
  save(event) {
    const url = event.currentTarget.dataset.url;
    wx.downloadFile({ url, success: result => {
      if (result.statusCode !== 200) return wx.showToast({ title: '下载失败', icon: 'none' });
      wx.saveImageToPhotosAlbum({ filePath: result.tempFilePath,
        success: () => wx.showToast({ title: '已保存图片' }),
        fail: () => wx.showToast({ title: '模拟器可用预览；文件也已保存在服务端 data/artifacts', icon: 'none', duration: 3500 })
      });
    }});
  },
  async publish() {
    if (!this.data.postcard) return;
    this.setData({ publishing: true });
    try {
      const post = await api.request('/posts', { method: 'POST', data: {
        artifactId: this.data.postcard.id,
        message: `来自${this.data.observation.locationLabel}的自然来信`,
        moderationStatus: 'approved'
      }});
      wx.showModal({ title: '自然来信已发布', content: `${post.schoolAlias}的作品已经通过本机教师审核，进入“自然中国”广场。`, showCancel: false,
        success: () => wx.switchTab({ url: '/pages/feed/feed' })
      });
    } catch (error) { wx.showToast({ title: api.messageOf(error), icon: 'none' }); }
    finally { this.setData({ publishing: false }); }
  }
});
