/**
 * syncLock.ts
 *
 * Anti-loop mutex and echo suppression manager.
 * Prevents recursive ping-pong events between OS disk file watcher (fs.watch)
 * and Obsidian vault event dispatcher (vault.on('modify')).
 */

export class SyncLockManager {
    private activeLocks = new Set<string>();

    /**
     * Checks if a file path (vault-relative or absolute disk path) is actively locked.
     */
    public isLocked(filePath: string): boolean {
        if (!filePath) return false;
        return this.activeLocks.has(this.normalizeKey(filePath));
    }

    /**
     * Executes an async action within a temporary mutex lock.
     * The lock is retained for an additional debounced period (default 350ms)
     * to safely outlive OS file event queues and async flush cycles.
     */
    public async withLock<T>(filePath: string, action: () => Promise<T>, debounceMs = 350): Promise<T> {
        const key = this.normalizeKey(filePath);
        this.activeLocks.add(key);
        try {
            return await action();
        } finally {
            setTimeout(() => {
                this.activeLocks.delete(key);
            }, debounceMs);
        }
    }

    /**
     * Acquires an explicit lock on a path.
     */
    public acquire(filePath: string): void {
        if (!filePath) return;
        this.activeLocks.add(this.normalizeKey(filePath));
    }

    /**
     * Releases an explicit lock after a debounce delay.
     */
    public release(filePath: string, debounceMs = 350): void {
        if (!filePath) return;
        const key = this.normalizeKey(filePath);
        setTimeout(() => {
            this.activeLocks.delete(key);
        }, debounceMs);
    }

    private normalizeKey(filePath: string): string {
        return filePath.replace(/\\/g, '/').toLowerCase().trim();
    }
}
