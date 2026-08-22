import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { readSqliteCollections, preflightSqliteData } from './sqlitePostgresMigration.js';

export async function sha256(filename) {
  const hash = crypto.createHash('sha256');
  for await (const chunk of createReadStream(filename)) hash.update(chunk);
  return hash.digest('hex');
}

export async function createProductionSnapshot({ source, backupDirectory, freezeConfirmed } = {}) {
  if (freezeConfirmed !== 'YES') throw new Error('WRITE_FREEZE_NOT_CONFIRMED');
  if (!source || !backupDirectory) throw new Error('SNAPSHOT_PATHS_REQUIRED');
  const resolvedSource = path.resolve(source);
  const resolvedDirectory = path.resolve(backupDirectory);
  const sourceStat = await fs.stat(resolvedSource);
  if (!sourceStat.isFile() || sourceStat.size === 0) throw new Error('SOURCE_SQLITE_INVALID');
  await fs.mkdir(resolvedDirectory, { recursive: true });
  await fs.access(resolvedDirectory, fs.constants.W_OK);
  const collections = readSqliteCollections(resolvedSource);
  const preflightErrors = preflightSqliteData(collections);
  if (preflightErrors.length) throw new Error(`SQLITE_PREFLIGHT_FAILED:${preflightErrors.join(',')}`);
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const destination = path.join(resolvedDirectory, `plus58express-${timestamp}.sqlite`);
  const sourceArtifacts = [resolvedSource];
  for (const suffix of ['-wal', '-shm']) {
    try {
      if ((await fs.stat(`${resolvedSource}${suffix}`)).isFile()) sourceArtifacts.push(`${resolvedSource}${suffix}`);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  const artifacts = [];
  for (const artifactSource of sourceArtifacts) {
    const suffix = artifactSource.slice(resolvedSource.length);
    const artifactBackup = `${destination}${suffix}`;
    await fs.copyFile(artifactSource, artifactBackup, fs.constants.COPYFILE_EXCL);
    const [sourceArtifactStat, backupArtifactStat, sourceHash, backupHash] = await Promise.all([
      fs.stat(artifactSource), fs.stat(artifactBackup), sha256(artifactSource), sha256(artifactBackup)
    ]);
    if (sourceHash !== backupHash || sourceArtifactStat.size !== backupArtifactStat.size) throw new Error(`SNAPSHOT_BYTE_MISMATCH:${suffix || 'main'}`);
    artifacts.push({ source: artifactSource, backup: artifactBackup, bytes: backupArtifactStat.size, sha256: backupHash });
  }
  const copiedCollections = readSqliteCollections(destination);
  const copiedErrors = preflightSqliteData(copiedCollections);
  if (copiedErrors.length) throw new Error(`COPIED_SQLITE_PREFLIGHT_FAILED:${copiedErrors.join(',')}`);
  const backupStat = await fs.stat(destination);
  const report = {
    timestamp: new Date().toISOString(),
    source: resolvedSource,
    backup: destination,
    bytes: backupStat.size,
    sha256: artifacts[0].sha256,
    artifacts,
    rows: Object.fromEntries(Object.entries(copiedCollections).map(([table, rows]) => [table, rows.length])),
    preflightErrors: []
  };
  await fs.writeFile(`${destination}.json`, `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
  return report;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = await createProductionSnapshot({
    source: process.env.DATA_FILE,
    backupDirectory: process.env.CUTOVER_BACKUP_DIR,
    freezeConfirmed: process.env.WRITE_FREEZE_CONFIRMED
  });
  console.log(JSON.stringify(result, null, 2));
}
