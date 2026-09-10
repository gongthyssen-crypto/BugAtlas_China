function base() {
  return getApp().globalData.apiBase.replace(/\/$/, '');
}

function absolute(url) {
  if (!url) return '';
  if (/^https?:\/\//.test(url)) return url;
  return `${base()}${url.replace(/^\/api\/v1/, '')}`;
}

function request(path, options = {}) {
  return new Promise((resolve, reject) => {
    wx.request({
      url: absolute(path),
      method: options.method || 'GET',
      data: options.data,
      timeout: options.timeout || 10000,
      header: { 'content-type': 'application/json', ...(options.header || {}) },
      success(response) {
        if (response.statusCode >= 200 && response.statusCode < 300 && response.data?.success) resolve(response.data.data);
        else reject(response.data?.error || { code: 'HTTP_ERROR', message: `本地服务返回 ${response.statusCode}` });
      },
      fail(error) { reject({ code: 'NETWORK_ERROR', message: '无法连接本地服务，请确认服务已启动', detail: error.errMsg }); }
    });
  });
}

function uploadObservation(filePath, metadata) {
  return new Promise((resolve, reject) => {
    wx.uploadFile({
      url: absolute('/observations'),
      filePath,
      name: 'image',
      timeout: 30000,
      formData: { metadata: JSON.stringify(metadata) },
      success(response) {
        let body;
        try { body = JSON.parse(response.data); } catch { return reject({ code: 'RESPONSE_INVALID', message: '本地服务响应无法解析' }); }
        if (response.statusCode >= 200 && response.statusCode < 300 && body.success) resolve(body.data);
        else reject(body.error || { code: 'UPLOAD_FAILED', message: '图片上传失败' });
      },
      fail(error) { reject({ code: 'NETWORK_ERROR', message: '图片上传失败，请检查本地服务', detail: error.errMsg }); }
    });
  });
}

function uploadAudio(observationId, filePath) {
  return new Promise((resolve, reject) => {
    wx.uploadFile({
      url: absolute(`/observations/${observationId}/audio`), filePath, name: 'audio', timeout: 30000,
      success(response) {
        let body;
        try { body = JSON.parse(response.data); } catch { return reject({ code: 'RESPONSE_INVALID', message: '录音上传响应无法解析' }); }
        if (response.statusCode >= 200 && response.statusCode < 300 && body.success) resolve(body.data);
        else reject(body.error || { code: 'AUDIO_UPLOAD_FAILED', message: '录音上传失败' });
      },
      fail() { reject({ code: 'NETWORK_ERROR', message: '录音上传失败，文字观察已保留' }); }
    });
  });
}

async function waitForJob(jobId, options = {}) {
  const deadline = Date.now() + (options.timeout || 180000);
  while (Date.now() < deadline) {
    const job = await request(`/jobs/${jobId}`, { timeout: 10000 });
    options.onProgress?.(job.progress, job.status);
    if (job.status === 'succeeded') return job.result;
    if (job.status === 'failed') throw job.error || { code: 'JOB_FAILED', message: '任务执行失败' };
    await new Promise(resolve => setTimeout(resolve, options.interval || 700));
  }
  throw { code: 'JOB_TIMEOUT', message: '任务仍在后台进行，可稍后再查看' };
}

function messageOf(error) { return error?.message || '操作未完成，请稍后重试'; }

module.exports = { absolute, request, uploadObservation, uploadAudio, waitForJob, messageOf };
