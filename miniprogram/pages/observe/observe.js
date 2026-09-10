const api = require('../../utils/api');

Page({
  data: {
    imagePath: '',
    description: '',
    schoolAlias: '王平中学自然观察组',
    locationLabel: '九龙山脚下自然课堂',
    regionCode: '110109',
    habitats: [
      { value: 'mountain_forest_edge', label: '山地林缘' }, { value: 'wetland', label: '湿地' },
      { value: 'farmland', label: '农田' }, { value: 'campus', label: '校园' }, { value: 'garden', label: '花园' }
    ],
    habitatIndex: 0,
    submitting: false,
    progressText: '',
    recording: false,
    audioPath: ''
  },
  onLoad() {
    this.recorder = wx.getRecorderManager();
    this.recorder.onStop(result => this.setData({ recording: false, audioPath: result.tempFilePath }));
    this.recorder.onError(() => {
      this.setData({ recording: false });
      wx.showToast({ title: '录音失败，可继续填写文字', icon: 'none' });
    });
  },
  async chooseImage() {
    try {
      const result = await wx.chooseMedia({ count: 1, mediaType: ['image'], sourceType: ['album', 'camera'], sizeType: ['compressed'] });
      this.setData({ imagePath: result.tempFiles[0].tempFilePath });
    } catch (error) {
      if (!String(error.errMsg).includes('cancel')) wx.showToast({ title: '无法选择图片', icon: 'none' });
    }
  },
  startRecord() {
    if (this.data.recording) return this.recorder.stop();
    this.recorder.start({ duration: 60000, format: 'mp3', sampleRate: 16000, numberOfChannels: 1 });
    this.setData({ recording: true });
  },
  playRecord() {
    if (!this.data.audioPath) return;
    if (!this.audio) this.audio = wx.createInnerAudioContext();
    this.audio.src = this.data.audioPath;
    this.audio.play();
  },
  onUnload() { this.audio?.destroy(); },
  bindInput(event) { this.setData({ [event.currentTarget.dataset.field]: event.detail.value }); },
  habitatChange(event) { this.setData({ habitatIndex: Number(event.detail.value) }); },
  metadata() {
    return {
      stationId: 'BJ-MTG-SJMZ-01', schoolAlias: this.data.schoolAlias, regionCode: this.data.regionCode,
      locationLabel: this.data.locationLabel, habitat: this.data.habitats[this.data.habitatIndex].value,
      userDescription: this.data.description
    };
  },
  async submit() {
    if (!this.data.imagePath) return wx.showToast({ title: '请先选择一张昆虫照片', icon: 'none' });
    this.setData({ submitting: true, progressText: '保存照片与环境快照…' });
    try {
      const observation = await api.uploadObservation(this.data.imagePath, this.metadata());
      await this.analyzeAndOpen(observation);
    } catch (error) {
      wx.showToast({ title: api.messageOf(error), icon: 'none', duration: 3000 });
    } finally { this.setData({ submitting: false, progressText: '' }); }
  },
  async useDemo() {
    this.setData({ submitting: true, progressText: '载入演示观察…' });
    try {
      const observation = await api.request('/demo/observations', { method: 'POST', data: this.metadata() });
      await this.analyzeAndOpen(observation);
    } catch (error) {
      wx.showToast({ title: api.messageOf(error), icon: 'none', duration: 3000 });
    } finally { this.setData({ submitting: false, progressText: '' }); }
  },
  async analyzeAndOpen(observation) {
    getApp().globalData.currentObservationId = observation.id;
    if (this.data.audioPath) {
      this.setData({ progressText: '保存本机口述录音…' });
      try { await api.uploadAudio(observation.id, this.data.audioPath); }
      catch (error) { wx.showToast({ title: '录音未上传，文字和照片已经保存', icon: 'none' }); }
    }
    this.setData({ progressText: 'AI 博物导师正在整理证据…' });
    const job = await api.request(`/observations/${observation.id}/analyze`, { method: 'POST', timeout: 50000 });
    await api.waitForJob(job.id, { timeout: 60000, onProgress: value => this.setData({ progressText: `分析证据 ${value}%` }) });
    wx.navigateTo({ url: `/pages/mentor/mentor?id=${observation.id}` });
  }
});
