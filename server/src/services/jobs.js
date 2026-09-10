import crypto from 'node:crypto';

export class JobService {
  constructor(db, logger) {
    this.db = db;
    this.logger = logger;
  }

  create(type, runner) {
    const id = `job_${crypto.randomUUID()}`;
    const now = new Date().toISOString();
    this.db.prepare('INSERT INTO jobs (id, type, status, progress, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(id, type, 'queued', 0, now, now);
    setImmediate(async () => {
      this.update(id, { status: 'running', progress: 10 });
      try {
        const result = await runner(progress => this.update(id, { progress }));
        this.update(id, { status: 'succeeded', progress: 100, result });
      } catch (error) {
        this.logger.error({ jobId: id, errorCode: error.code ?? 'JOB_FAILED', message: error.message }, 'Background job failed');
        this.update(id, {
          status: 'failed',
          progress: 100,
          error: { code: error.code ?? 'JOB_FAILED', message: error.publicMessage ?? error.message, retryable: Boolean(error.retryable) }
        });
      }
    });
    return this.get(id);
  }

  update(id, { status, progress, result, error }) {
    const current = this.db.prepare('SELECT * FROM jobs WHERE id = ?').get(id);
    if (!current) return;
    this.db.prepare(`UPDATE jobs SET status = ?, progress = ?, result_json = ?, error_json = ?, updated_at = ? WHERE id = ?`).run(
      status ?? current.status,
      progress ?? current.progress,
      result === undefined ? current.result_json : JSON.stringify(result),
      error === undefined ? current.error_json : JSON.stringify(error),
      new Date().toISOString(),
      id
    );
  }

  get(id) {
    const row = this.db.prepare('SELECT * FROM jobs WHERE id = ?').get(id);
    if (!row) return null;
    return {
      id: row.id,
      type: row.type,
      status: row.status,
      progress: row.progress,
      result: row.result_json ? JSON.parse(row.result_json) : null,
      error: row.error_json ? JSON.parse(row.error_json) : null,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }
}
