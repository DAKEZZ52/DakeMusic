import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
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
  const directory = await mkdtemp(join(tmpdir(), 'lyrise-storage-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
};

const legacyName = LEGACY_DATABASE_FILENAMES[0];

test('fresh install keeps the new database filename', async (t) => {
  const directory = await createDir(t);
  assert.equal(resolveDatabasePath(directory), join(directory, DATABASE_FILENAME));
});

test('legacy database is copied to the new name and the old file is removed', async (t) => {
  const directory = await createDir(t);
  const legacy = join(directory, legacyName);
  await writeFile(legacy, 'legacy-db');

  const resolved = resolveDatabasePath(directory);

  assert.equal(resolved, join(directory, DATABASE_FILENAME));
  assert.equal(existsSync(join(directory, DATABASE_FILENAME)), true);
  assert.equal(existsSync(legacy), false, '旧品牌文件不留在磁盘上');
});

test('WAL and SHM travel with the database and are cleaned up', async (t) => {
  const directory = await createDir(t);
  const legacy = join(directory, legacyName);
  await writeFile(legacy, 'db');
  await writeFile(`${legacy}-wal`, 'wal-content');
  await writeFile(`${legacy}-shm`, 'shm-content');

  resolveDatabasePath(directory);

  assert.equal(existsSync(join(directory, `${DATABASE_FILENAME}-wal`)), true);
  assert.equal(existsSync(join(directory, `${DATABASE_FILENAME}-shm`)), true);
  assert.equal(existsSync(`${legacy}-wal`), false);
  assert.equal(existsSync(`${legacy}-shm`), false);
});

test('an empty new database is replaced by the legacy one that has real data', async (t) => {
  const directory = await createDir(t);
  // 模拟：新版本先启动过一次，创建了空库，随后旧库才被发现
  await writeFile(join(directory, DATABASE_FILENAME), 'empty');
  await writeFile(join(directory, legacyName), 'legacy-db-with-real-content');

  const resolved = resolveDatabasePath(directory);

  assert.equal(resolved, join(directory, DATABASE_FILENAME));
  assert.equal(await readFile(resolved, 'utf8'), 'legacy-db-with-real-content');
  assert.equal(existsSync(join(directory, legacyName)), false);
});

test('a new database with real data is never overwritten by the legacy one', async (t) => {
  const directory = await createDir(t);
  const realContent = 'n'.repeat(200 * 1024);
  await writeFile(join(directory, DATABASE_FILENAME), realContent);
  await writeFile(join(directory, legacyName), 'legacy-db');

  const resolved = resolveDatabasePath(directory);

  assert.equal(resolved, join(directory, DATABASE_FILENAME));
  assert.equal(await readFile(resolved, 'utf8'), realContent);
});

test('two legacy generations pick the larger database as the source', async (t) => {
  const directory = await createDir(t);
  await writeFile(join(directory, LEGACY_DATABASE_FILENAMES[0]), 'short');
  await writeFile(join(directory, LEGACY_DATABASE_FILENAMES[1]), 'much-longer-legacy-db');

  resolveDatabasePath(directory);

  assert.equal(await readFile(join(directory, DATABASE_FILENAME), 'utf8'), 'much-longer-legacy-db');
  for (const name of LEGACY_DATABASE_FILENAMES) {
    assert.equal(existsSync(join(directory, name)), false);
  }
});
