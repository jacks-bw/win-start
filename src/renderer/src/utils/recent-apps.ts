export const RECENT_APP_WINDOW_MS = 7 * 24 * 60 * 60 * 1000

export function isRecentlyDiscovered(timestamp: number | null | undefined, now: number): boolean {
  return typeof timestamp === 'number' && Number.isFinite(timestamp) && timestamp > 0
    && timestamp <= now && now - timestamp < RECENT_APP_WINDOW_MS
}

export function selectRecentApps<T extends { id: string; firstSeenAt?: number | null; folderId?: string }>(apps: T[], now: number): T[] {
  return apps.filter(app => !app.folderId && isRecentlyDiscovered(app.firstSeenAt, now))
    .sort((a, b) => (b.firstSeenAt! - a.firstSeenAt!) || a.id.localeCompare(b.id))
    .slice(0, 5)
}
