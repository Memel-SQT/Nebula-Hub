import fs from 'node:fs/promises';
import path from 'node:path';

let tempCounter = 0;

/**
 * Writes through a temp file + rename so a crash or power cut mid-write can never leave a
 * half-written file behind. On Windows the rename can briefly fail with EPERM/EBUSY while an
 * antivirus or a cloud client holds the target open, so it is retried before falling back to
 * a plain overwrite. Ported unchanged from Nebula Finterest v0.1.36 `src/electron/fsutil.ts`.
 */
export async function writeFileAtomic(filePath: string, data: string | Uint8Array): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.tmp-${process.pid}-${(tempCounter += 1)}`;
  await fs.writeFile(tempPath, data);

  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      await fs.rename(tempPath, filePath);
      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== 'EPERM' && code !== 'EBUSY' && code !== 'EACCES') {
        await fs.rm(tempPath, { force: true });
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 40 * (attempt + 1)));
    }
  }

  try {
    await fs.writeFile(filePath, data);
  } finally {
    await fs.rm(tempPath, { force: true });
  }
}
