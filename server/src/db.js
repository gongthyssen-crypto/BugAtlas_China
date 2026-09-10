import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

export function openDatabase(dataDir) {
  fs.mkdirSync(dataDir, { recursive: true });
  const db = new Database(path.join(dataDir, 'bug-atlas.sqlite'));
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(`
    CREATE TABLE IF NOT EXISTS sensor_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      station_id TEXT NOT NULL,
      device_id TEXT NOT NULL,
      captured_at TEXT NOT NULL,
      received_at TEXT NOT NULL,
      uptime_ms INTEGER NOT NULL,
      temperature_c REAL,
      humidity_pct REAL,
      light_raw INTEGER,
      light_relative_pct REAL,
      human_presence INTEGER,
      status_flags INTEGER NOT NULL,
      device_state TEXT NOT NULL,
      source TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_sensor_time ON sensor_snapshots(station_id, received_at DESC);

    CREATE TABLE IF NOT EXISTS observations (
      id TEXT PRIMARY KEY,
      station_id TEXT NOT NULL,
      school_alias TEXT NOT NULL,
      region_code TEXT NOT NULL,
      location_label TEXT NOT NULL,
      habitat TEXT NOT NULL,
      captured_at TEXT NOT NULL,
      image_path TEXT NOT NULL,
      audio_path TEXT,
      transcript TEXT,
      user_description TEXT NOT NULL DEFAULT '',
      sensor_snapshot_json TEXT NOT NULL,
      ai_status TEXT NOT NULL DEFAULT 'pending',
      verification_status TEXT NOT NULL DEFAULT 'unverified',
      visibility TEXT NOT NULL DEFAULT 'local',
      data_source TEXT NOT NULL DEFAULT 'demo',
      illustration_path TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS analyses (
      observation_id TEXT PRIMARY KEY REFERENCES observations(id) ON DELETE CASCADE,
      result_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS artifacts (
      id TEXT PRIMARY KEY,
      observation_id TEXT NOT NULL REFERENCES observations(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      template_version TEXT NOT NULL,
      format TEXT NOT NULL,
      width INTEGER NOT NULL,
      height INTEGER NOT NULL,
      file_path TEXT NOT NULL,
      sha256 TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS posts (
      id TEXT PRIMARY KEY,
      observation_id TEXT NOT NULL REFERENCES observations(id),
      artifact_id TEXT NOT NULL REFERENCES artifacts(id),
      school_alias TEXT NOT NULL,
      region_code TEXT NOT NULL,
      region_label TEXT NOT NULL,
      habitat TEXT NOT NULL,
      message TEXT NOT NULL,
      moderation_status TEXT NOT NULL DEFAULT 'pending',
      data_source TEXT NOT NULL,
      published_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_posts_feed ON posts(moderation_status, published_at DESC);
    CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      status TEXT NOT NULL,
      progress INTEGER NOT NULL DEFAULT 0,
      result_json TEXT,
      error_json TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS idempotency (
      key TEXT NOT NULL,
      scope TEXT NOT NULL,
      response_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (key, scope)
    );
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
  return db;
}

export function rowToSnapshot(row, now = Date.now()) {
  if (!row) return null;
  const age = Math.max(0, now - Date.parse(row.received_at));
  const source = row.source === 'demo' ? 'demo' : age > 6000 ? 'stale' : 'live';
  return {
    id: row.id,
    stationId: row.station_id,
    deviceId: row.device_id,
    capturedAt: row.captured_at,
    receivedAt: row.received_at,
    uptimeMs: row.uptime_ms,
    temperatureC: row.temperature_c,
    humidityPct: row.humidity_pct,
    lightRaw: row.light_raw,
    lightRelativePct: row.light_relative_pct,
    humanPresence: row.human_presence == null ? null : Boolean(row.human_presence),
    statusFlags: row.status_flags,
    deviceState: row.device_state,
    source,
    dataAgeMs: age
  };
}

export function rowToObservation(row) {
  if (!row) return null;
  return {
    id: row.id,
    stationId: row.station_id,
    schoolAlias: row.school_alias,
    regionCode: row.region_code,
    locationLabel: row.location_label,
    habitat: row.habitat,
    capturedAt: row.captured_at,
    imageUrl: `/api/v1/observations/${row.id}/image`,
    hasAudio: Boolean(row.audio_path),
    transcript: row.transcript,
    userDescription: row.user_description,
    sensorSnapshot: JSON.parse(row.sensor_snapshot_json),
    aiStatus: row.ai_status,
    verificationStatus: row.verification_status,
    visibility: row.visibility,
    dataSource: row.data_source,
    illustrationUrl: row.illustration_path ? `/api/v1/observations/${row.id}/illustration` : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export function rowToArtifact(row) {
  if (!row) return null;
  return {
    id: row.id,
    observationId: row.observation_id,
    type: row.type,
    templateVersion: row.template_version,
    format: row.format,
    width: row.width,
    height: row.height,
    fileUrl: `/api/v1/artifacts/${row.id}/file`,
    sha256: row.sha256,
    createdAt: row.created_at
  };
}

export function rowToPost(row) {
  return {
    id: row.id,
    observationId: row.observation_id,
    artifactId: row.artifact_id,
    artifactUrl: `/api/v1/artifacts/${row.artifact_id}/file`,
    schoolAlias: row.school_alias,
    regionCode: row.region_code,
    regionLabel: row.region_label,
    habitat: row.habitat,
    message: row.message,
    moderationStatus: row.moderation_status,
    dataSource: row.data_source,
    publishedAt: row.published_at
  };
}
