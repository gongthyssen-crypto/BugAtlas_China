const api = require('../../utils/api');

Page({
  data: {
    id: '', observation: null, analysis: null, activeVersion: 'child', loading: true,
    ttsLoading: false, playing: false
  },
  onLoad(options) {
    const id = options.id || getApp().globalData.currentObservationId;
    this.setData({ id });
    this.load();
  },
  async load() {
    try {
      const observation = await api.request(`/observations/${this.data.id}`);
      this.setData({ observation, analysis: observation.analysis, loading: false });
    } catch (error) {
      this.setData({ loading: false });
      wx.showToast({ title: api.messageOf(error), icon: 'none' });
    }
  },
  setVersion(event) { this.setData({ activeVersion: event.currentTarget.dataset.version }); },
  async playTts() {
    if (this.data.playing && this.audio) { this.audio.pause(); this.setData({ playing: false }); return; }
    if (this.audio?.src) { this.audio.play(); this.setData({ playing: true }); return; }
    this.setData({ ttsLoading: true });
    try {
      const job = await api.request(`/observations/${this.data.id}/tts`, {
        method: 'POST', data: { provider: 'windows-sapi', voiceProfile: 'Microsoft Yaoyao', textSource: 'childExplanation', rate: 0 }
      });
      const result = await api.waitForJob(job.id, { timeout: 30000 });
      this.audio = wx.createInnerAudioContext();
      this.audio.src = api.absolute(result.audioUrl);
      this.audio.onPlay(() => this.setData({ playing: true }));
      this.audio.onPause(() => this.setData({ playing: false }));
      this.audio.onEnded(() => this.setData({ playing: false }));
      this.audio.onError(() => {
        this.setData({ playing: false });
        wx.showToast({ title: '语音播放失败，文字讲解仍可阅读', icon: 'none' });
      });
      this.audio.play();
    } catch (error) { wx.showToast({ title: api.messageOf(error), icon: 'none', duration: 2600 }); }
    finally { this.setData({ ttsLoading: false }); }
  },
  openStudio() { wx.navigateTo({ url: `/pages/studio/studio?id=${this.data.id}` }); },
  onUnload() { this.audio?.destroy(); }
});
