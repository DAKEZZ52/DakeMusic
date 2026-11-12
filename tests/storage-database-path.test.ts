import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  DATABASE_FILENAME,
  LEGACY_DATABASE_FILENAMES,
  resolveDatabasePath,
} from '../src/main/storage/databasePath.ts';

const createDir = async (t: { after: (fn: () => Promise<void>) => void }) => {
  const directory = await mkdtemp(join(tmpdir(), 'dake-storage-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
};

test('fresh install keeps the new database filename', async (t) => {
  const directory = await createDir(t);
  assert.equal(resolveDatabasePath(directory), join(directory, DATABASE_FILENAME));
});

test('legacy database is copied to the new name and the old file is removed', async (t) => {
  const directory = await createDir(t);
  const legacy = join(directory, LEGACY_DATABASE_FILENAMES[0]);
  await writeFile(legacy, 'legacy-db');

  const resolved = resolveDatabasePath(directory);

  assert.equal(resolved, join(directory, DATABASE_FILENAME));
  assert.equal(existsSync(join(directory, DATABASE_FILENAME)), true);
  assert.equal(existsSync(legacy), false, '旧品牌文件不留在磁盘上');
});

test('WAL and SHM travel with the database and are cleaned up', async (t) => {
  const directory = await createDir(t);
  const legacy = join(directory, LEGACY_DATABASE_FILENAMES[0]);
  await writeFile(legacy, 'db');
  await writeFile(`${legacy}-wal`, 'wal-content');
  await writeFile(`${legacy}-shm`, 'shm-content');

  resolveDatabasePath(directory);

  assert.equal(existsSync(join(directory, `${DATABASE_FILENAME}-wal`)), true);
  assert.equal(existsSync(join(directory, `${DATABASE_FILENAME}-shm`)), true);
  assert.equal(existsSync(`${legacy}-wal`), false);
  assert.equal(existsSync(`${legacy}-shm`), false);
});

test('existing new database is never overwritten by the legacy one', async (t) => {
  const directory = await createDir(t);
  await writeFile(join(directory, DATABASE_FILENAME), 'new-db');
  await writeFile(join(directory, LEGACY_DATABASE_FILENAMES[0]), 'legacy-db');

  const resolved = resolveDatabasePath(directory);

  assert.equal(resolved, join(directory, DATABASE_FILENAME));
  const { readFile } = await import('node:fs/promises');
  assert.equal(await readFile(resolved, 'utf8'), 'new-db');
});
