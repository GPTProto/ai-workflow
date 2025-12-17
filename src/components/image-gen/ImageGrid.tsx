'use client';

import { ImageCard, type ImageCardData } from './ImageCard';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Download, Package, Loader2, ImageIcon } from 'lucide-react';

interface ImageGridProps {
  tasks: ImageCardData[];
  isRunning: boolean;
  onRetry: (id: string, newPrompt?: string) => void;
  onDownload: (id: string, imageUrl: string) => void;
  onPreview: (imageUrl: string, prompt: string) => void;
  onBatchDownload: () => void;
  isBatchDownloading?: boolean;
}

export function ImageGrid({
  tasks,
  isRunning,
  onRetry,
  onDownload,
  onPreview,
  onBatchDownload,
  isBatchDownloading = false,
}: ImageGridProps) {
  const completedCount = tasks.filter((t) => t.status === 'done').length;
  const hasCompletedTasks = completedCount > 0;
  const allCompleted = !isRunning && tasks.length > 0 && tasks.every((t) => t.status === 'done' || t.status === 'error');

  if (tasks.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-slate-500">
        <div className="w-16 h-16 rounded-2xl bg-slate-800/50 border border-slate-700/50 flex items-center justify-center mb-4">
          <ImageIcon className="w-8 h-8" />
        </div>
        <p className="text-sm">No images generated yet</p>
        <p className="text-xs text-slate-600 mt-1">Start generation to see results here</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header with batch actions */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700/50 bg-slate-900/30">
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-slate-300">
            Results
          </span>
          <span className="text-xs text-slate-500">
            {completedCount}/{tasks.length} completed
          </span>
        </div>

        {/* Batch download button */}
        {allCompleted && hasCompletedTasks && (
          <Button
            onClick={onBatchDownload}
            disabled={isBatchDownloading}
            className={cn(
              'h-8 px-3 text-xs',
              'bg-emerald-600 hover:bg-emerald-500 text-white',
              'disabled:opacity-50'
            )}
          >
            {isBatchDownloading ? (
              <>
                <Loader2 className="w-3 h-3 animate-spin mr-1" />
                Packing...
              </>
            ) : (
              <>
                <Package className="w-3 h-3 mr-1" />
                Download All ({completedCount})
              </>
            )}
          </Button>
        )}
      </div>

      {/* Image Grid */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
          {tasks.map((task) => (
            <ImageCard
              key={task.id}
              data={task}
              onRetry={onRetry}
              onDownload={onDownload}
              onPreview={onPreview}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
