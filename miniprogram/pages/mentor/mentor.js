const api = require('../../utils/api');

Page({
  data: {
    id: '', observation: null, analysis: null, activeVersion: 'child', loading: true,
    candidateCount: 0, sourceLabel: '', errorMessage: '',
    ttsLoading: false, playing: false
  },
  onLoad(options) {
    this.resolveObservationId(options);
    return this.load();
  },
  onShow() {
    // The developer tool can restore a cached page without replaying onLoad.
    // Start the request here as a safety net so the page can never stay blank.
    if (!this.loadStarted && !this.data.analysis) {
      this.resolveObservationId();
      return this.load();
    }
  },
  resolveObservationId(options) {
    const app = getApp();
    const id = (options && options.id) || app.globalData.currentObservationId || this.data.id || '';
    if (id !== this.data.id) this.setData({ id });
    return id;
  },
  async load() {
    if (this.loadStarted) return;
    const id = this.resolveObservationId();
    if (!id) {
      this.setData({ loading: false, errorMessage: '没有找到本次观察记录，请返回“发现昆虫”重新进入。' });
      return;
    }
    this.loadStarted = true;
    this.setData({ loading: true, errorMessage: '' });
    try {
      const observation = await api.request(`/observations/${id}`);
      const analysis = normalizeAnalysis(observation && observation.analysis);
      if (!analysis) {
        this.setData({
          observation,
          analysis: null,
          candidateCount: 0,
          sourceLabel: sourceLabelOf(observation),
          loading: false,
          errorMessage: '照片已经保存，但分析结果尚未就绪。请稍后重试。'
        });
        return;
      }
      this.setData({
        observation,
        analysis,
        candidateCount: analysis.candidates.length,
        sourceLabel: sourceLabelOf(observation),
        loading: false,
        errorMessage: ''
      });
    } catch (error) {
      this.setData({ loading: false, errorMessage: api.diagnosticOf(error) });
      wx.showToast({ title: api.messageOf(error), icon: 'none' });
    } finally {
      this.loadStarted = false;
    }
  },
  retry() { return this.load(); },
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
  onUnload() { if (this.audio) this.audio.destroy(); }
});

function normalizeAnalysis(analysis) {
  if (!analysis || typeof analysis !== 'object') return null;
  const candidates = Array.isArray(analysis.candidates) ? analysis.candidates : [];
  return {
    ...analysis,
    candidates: candidates.map(candidate => ({
      ...(candidate || {}),
      commonName: candidate && candidate.commonName ? candidate.commonName : '待核验候选',
      scientificName: candidate && candidate.scientificName ? candidate.scientificName : '',
      evidence: candidate && Array.isArray(candidate.evidence) ? candidate.evidence : [],
      counterEvidence: candidate && Array.isArray(candidate.counterEvidence) ? candidate.counterEvidence : [],
      verifyNext: candidate && Array.isArray(candidate.verifyNext) ? candidate.verifyNext : []
    })),
    childExplanation: analysis.childExplanation || '暂时没有儿童版讲解，请继续补充观察证据。',
    teacherExplanation: analysis.teacherExplanation || '暂时没有教师版讲解。',
    safetyNotice: analysis.safetyNotice || '请保持距离，不要徒手触碰未知昆虫。',
    disclaimer: analysis.disclaimer || 'AI 辅助分析，仅供自然教育；请结合持续观察或专家资料核验。'
  };
}

function sourceLabelOf(observation) {
  return observation && observation.dataSource === 'demo' ? '演示分析' : '现场观察';
}
