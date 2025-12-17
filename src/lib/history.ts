/**
 * Image Generation History Storage
 */

export interface HistoryImage {
  id: string;
  prompt: string;
  imageUrl: string;
  aspectRatio: string;
  imageSize: string;
}

export interface HistoryRecord {
  id: string;
  timestamp: number;
  mode: 'text-to-image' | 'image-to-edit';
  totalCount: number;
  successCount: number;
  errorCount: number;
  images: HistoryImage[];
}

const HISTORY_STORAGE_KEY = 'image-gen-history';
const MAX_HISTORY_RECORDS = 50;

export function getHistory(): HistoryRecord[] {
  if (typeof window === 'undefined') return [];

  try {
    const data = localStorage.getItem(HISTORY_STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

export function saveToHistory(record: Omit<HistoryRecord, 'id' | 'timestamp'>): void {
  if (typeof window === 'undefined') return;

  const history = getHistory();

  const newRecord: HistoryRecord = {
    ...record,
    id: `history-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
    timestamp: Date.now(),
  };

  // Add new record to the beginning
  history.unshift(newRecord);

  // Keep only the latest MAX_HISTORY_RECORDS
  const trimmedHistory = history.slice(0, MAX_HISTORY_RECORDS);

  try {
    localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(trimmedHistory));
  } catch (error) {
    console.error('Failed to save history:', error);
  }
}

export function deleteHistoryRecord(recordId: string): void {
  if (typeof window === 'undefined') return;

  const history = getHistory();
  const filteredHistory = history.filter((r) => r.id !== recordId);

  try {
    localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(filteredHistory));
  } catch (error) {
    console.error('Failed to delete history record:', error);
  }
}

export function clearHistory(): void {
  if (typeof window === 'undefined') return;

  try {
    localStorage.removeItem(HISTORY_STORAGE_KEY);
  } catch (error) {
    console.error('Failed to clear history:', error);
  }
}

export function formatTimestamp(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
