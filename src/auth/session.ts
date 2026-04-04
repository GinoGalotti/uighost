import * as fs from 'node:fs/promises';
import * as path from 'node:path';

const AUTH_DIR = '.uighost/auth';

export function authFilePath(url: string): string {
  const domain = new URL(url).hostname.replace(/[^a-z0-9.-]/gi, '_');
  return path.join(AUTH_DIR, `${domain}.json`);
}

export async function saveSession(url: string, storageState: unknown): Promise<string> {
  await fs.mkdir(AUTH_DIR, { recursive: true });
  const filePath = authFilePath(url);
  await fs.writeFile(filePath, JSON.stringify(storageState, null, 2));
  return filePath;
}

export async function loadSession(url: string): Promise<string | undefined> {
  const filePath = authFilePath(url);
  try {
    await fs.access(filePath);
    return filePath;
  } catch {
    return undefined;
  }
}
