import { LowSync } from 'lowdb';
import { JSONFileSync } from 'lowdb/node';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

const configDir = path.join(os.homedir(), '.paystack');
const dbPath = path.join(configDir, 'db.json');
const legacyPath = path.resolve(process.cwd(), 'db.json');

// Ensure ~/.paystack directory exists with user-only permissions (0700)
if (!fs.existsSync(configDir)) {
  try {
    fs.mkdirSync(configDir, { recursive: true, mode: 0o700 });
  } catch (err) {
    console.error('Failed to create config directory:', err.message);
  }
}

// Backward compatibility: migrate legacy ./db.json to ~/.paystack/db.json
function shouldMigrateLegacy() {
  if (!fs.existsSync(legacyPath) || legacyPath === dbPath) {
    return false;
  }
  if (!fs.existsSync(dbPath)) {
    return true;
  }
  try {
    const current = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
    if (!current || !current.token) {
      const legacy = JSON.parse(fs.readFileSync(legacyPath, 'utf8'));
      if (legacy && legacy.token) {
        return true;
      }
    }
  } catch (_) {}
  return false;
}

if (shouldMigrateLegacy()) {
  try {
    fs.copyFileSync(legacyPath, dbPath);
    try {
      fs.chmodSync(dbPath, 0o600);
    } catch (_) {
      // Ignore on filesystems without POSIX permissions (e.g. Windows)
    }
    try {
      fs.renameSync(legacyPath, `${legacyPath}.bak`);
    } catch (_) {
      // If rename is not permitted, proceed with copied dbPath
    }
  } catch (err) {
    console.error('Failed to migrate legacy db.json:', err.message);
  }
}

const defaultData = {
  token: '',
  user: {},
  selected_integration: {},
};

const adapter = new JSONFileSync(dbPath);
const db = new LowSync(adapter, defaultData);

try {
  db.read();
} catch (err) {
  console.error('Error reading configuration database:', err.message);
}

if (!db.data) {
  db.data = defaultData;
  try {
    db.write();
    try {
      fs.chmodSync(dbPath, 0o600);
    } catch (_) {}
  } catch (err) {
    console.error('Error initializing configuration database:', err.message);
  }
}

export function write(key, value) {
  if (!db.data) {
    db.data = { ...defaultData };
  }
  db.data[key] = value;
  db.write();
}

export function read(key) {
  return db.data ? db.data[key] : undefined;
}

export function addToList(key, value) {
  const list = read(key);
  if (Array.isArray(list)) {
    list.push(value);
    write(key, list);
  } else {
    console.error(`db.${key} is not a list.`);
  }
}

export function query(key, query) {
  const list = read(key);
  if (Array.isArray(list)) {
    return list.find(query);
  } else {
    console.error(`db.${key} can't be queried.`);
  }
}

export function getStoragePath() {
  return dbPath;
}
