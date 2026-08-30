// Evidence storage abstraction. Swappable for object storage later.
// Stores files under config.storageDir/<disputeId>/<uuid>_<safe-original-name>.
// - Never exposes server filesystem paths to clients (we return a logical id).
// - safeName generation prevents path traversal (strips path separators).
import { promises as fs } from 'node:fs';
import { createReadStream, existsSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join, basename } from 'node:path';
import { config } from '../config.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

function root() {
  // Resolved lazily so config.storageDir (settable per environment/test) is honored.
  // storage.js lives in src/services/, so backend root is two levels up.
  return join(__dirname, '..', '..', config.storageDir);
}

function safeSegment(s) {
  // Keep only the basename and strip any path separators / control chars.
  return basename(String(s)).replace(/[\\/]/g, '_').replace(/[^\w.\- ]/g, '_').slice(0, 120) || 'file';
}

export const storage = {
  /** Save a buffer for a dispute. Returns { safeName, storageLocation, fullPath }. */
  async save(disputeId, originalName, buffer) {
    const safeDispute = safeSegment(disputeId); // L1: never trust disputeId as a raw path segment
    const safeName = `${randomUUID()}_${safeSegment(originalName)}`;
    const storageLocation = `${safeDispute}/${safeName}`;
    const fullPath = join(root(), storageLocation);
    await fs.mkdir(join(root(), safeDispute), { recursive: true });
    await fs.writeFile(fullPath, buffer);
    // storageLocation is a logical reference, never an absolute fs path.
    return { safeName, storageLocation, fullPath };
  },
  async read(storageLocation) {
    const fullPath = join(root(), storageLocation);
    if (!existsSync(fullPath)) return null;
    return createReadStream(fullPath);
  },
  async readBuffer(storageLocation) {
    const fullPath = join(root(), storageLocation);
    if (!existsSync(fullPath)) return null;
    return fs.readFile(fullPath);
  },
  async delete(storageLocation) {
    const fullPath = join(root(), storageLocation);
    if (existsSync(fullPath)) await fs.unlink(fullPath);
  },
  async exists(storageLocation) {
    return existsSync(join(root(), storageLocation));
  },
};
