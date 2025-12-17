'use client';

import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import {
  getHistory,
  deleteHistoryRecord,
  clearHistory,
  formatTimestamp,
  type HistoryRecord,
} from '@/lib/history';
import {
  History,
  Trash2,
  ChevronRight,
  ChevronDown,
  ImageIcon,
  X,
  Download,
} from 'lucide-react';
import { Button } from '@/components/ui/button';

interface HistoryPanelProps {
  onLoadHistory?: (record: HistoryRecord) => void;
  refreshTrigger?: number;
}

export function HistoryPanel({ onLoadHistory, refreshTrigger }: HistoryPanelProps) {
  const [history, setHistory] = useState<HistoryRecord[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [isCollapsed, setIsCollapsed] = useState(true);

  useEffect(() => {
    setHistory(getHistory());
  }, [refreshTrigger]);

  const handleDelete = (e: React.MouseEvent, recordId: string) => {
    e.stopPropagation();
    deleteHistoryRecord(recordId);
    setHistory(getHistory());
  };

  const handleClearAll = () => {
    if (confirm('Clear all history records?')) {
      clearHistory();
      setHistory([]);
    }
  };

  const handleDownloadImage = async (e: React.MouseEvent, imageUrl: string, filename: string) => {
    e.stopPropagation();
    try {
      const response = await fetch(imageUrl);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${filename}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Download failed:', error);
    }
  };

  if (history.length === 0) {
    return null;
  }

  return (
    <div className="rounded-xl border border-slate-700/50 bg-slate-900/50 backdrop-blur-sm overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="w-full px-4 py-3 flex items-center justify-between hover:bg-slate-800/30 transition-colors"
      >
        <div className="flex items-center gap-2">
          <History className="w-4 h-4 text-slate-400" />
          <span className="text-sm font-medium text-slate-300">History</span>
          <span className="text-xs text-slate-500">({history.length})</span>
        </div>
        {isCollapsed ? (
          <ChevronRight className="w-4 h-4 text-slate-500" />
        ) : (
          <ChevronDown className="w-4 h-4 text-slate-500" />
        )}
      </button>

      {/* Content */}
      {!isCollapsed && (
        <div className="border-t border-slate-700/50">
          {/* Clear all button */}
          <div className="px-4 py-2 border-b border-slate-700/30 flex justify-end">
            <button
              onClick={handleClearAll}
              className="text-xs text-slate-500 hover:text-red-400 transition-colors"
            >
              Clear All
            </button>
          </div>

          {/* History list */}
          <div className="max-h-[300px] overflow-y-auto">
            {history.map((record) => (
              <div key={record.id} className="border-b border-slate-700/30 last:border-b-0">
                {/* Record header */}
                <button
                  onClick={() => setExpandedId(expandedId === record.id ? null : record.id)}
                  className="w-full px-4 py-3 flex items-center justify-between hover:bg-slate-800/30 transition-colors text-left"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-400">
                        {formatTimestamp(record.timestamp)}
                      </span>
                      <span
                        className={cn(
                          'text-xs px-1.5 py-0.5 rounded',
                          record.mode === 'text-to-image'
                            ? 'bg-violet-500/20 text-violet-400'
                            : 'bg-pink-500/20 text-pink-400'
                        )}
                      >
                        {record.mode === 'text-to-image' ? 'T2I' : 'Edit'}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs text-emerald-400">
                        {record.successCount} success
                      </span>
                      {record.errorCount > 0 && (
                        <span className="text-xs text-red-400">
                          {record.errorCount} failed
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={(e) => handleDelete(e, record.id)}
                      className="p-1 rounded hover:bg-red-500/20 text-slate-500 hover:text-red-400 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                    {expandedId === record.id ? (
                      <ChevronDown className="w-4 h-4 text-slate-500" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-slate-500" />
                    )}
                  </div>
                </button>

                {/* Expanded images */}
                {expandedId === record.id && record.images.length > 0 && (
                  <div className="px-4 pb-3">
                    <div className="grid grid-cols-4 gap-2">
                      {record.images.map((img) => (
                        <div
                          key={img.id}
                          className="relative aspect-square rounded-lg overflow-hidden border border-slate-600/50 group"
                        >
                          <img
                            src={img.imageUrl}
                            alt={img.prompt}
                            className="w-full h-full object-cover"
                          />
                          {/* Hover overlay */}
                          <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                            <button
                              onClick={(e) => handleDownloadImage(e, img.imageUrl, `image-${img.id}`)}
                              className="p-1.5 rounded-lg bg-emerald-500/80 hover:bg-emerald-500 text-white transition-colors"
                            >
                              <Download className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                    {record.images.length > 0 && (
                      <p
                        className="text-xs text-slate-500 mt-2 truncate"
                        title={record.images[0].prompt}
                      >
                        {record.images[0].prompt}
                      </p>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
