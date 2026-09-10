Component({
  properties: {
    source: { type: String, value: 'offline' },
    age: { type: Number, value: 0 }
  },
  data: { label: '等待数据' },
  observers: {
    'source, age'(source, age) {
      const labels = { live: '实时数据', stale: `数据已陈旧 · ${Math.ceil(age / 1000)}秒`, demo: '演示数据', offline: '设备离线' };
      this.setData({ label: labels[source] || '状态未知' });
    }
  }
});
