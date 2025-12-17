'use client';

import {
  deleteWorkflowHistory,
  getAllWorkflowHistory,
  type WorkflowHistory,
} from '@/hooks/useHistoryDB';
import { cn } from '@/lib/utils';
import {
  AlertCircle,
  ArrowLeft,
  Calendar,
  CheckCircle,
  Clock,
  Download,
  Edit,
  Eye,
  FileText,
  Image,
  ImageIcon,
  Loader2,
  Trash2,
  Type,
  Users,
  Video,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

const statusConfig = {
  pending: {
    label: 'Pending',
    icon: Clock,
    color: 'text-zinc-500',
    bg: 'bg-zinc-800',
  },
  running: {
    label: 'Running',
    icon: Loader2,
    color: 'text-blue-500',
    bg: 'bg-blue-500/10',
  },
  completed: {
    label: 'Completed',
    icon: CheckCircle,
    color: 'text-emerald-500',
    bg: 'bg-emerald-500/10',
  },
  partial: {
    label: 'Partial',
    icon: Clock,
    color: 'text-amber-500',
    bg: 'bg-amber-500/10',
  },
  'in-progress': {
    label: 'In Progress',
    icon: Loader2,
    color: 'text-blue-500',
    bg: 'bg-blue-500/10',
  },
  interrupted: {
    label: 'Interrupted',
    icon: AlertCircle,
    color: 'text-orange-500',
    bg: 'bg-orange-500/10',
  },
  stopped: {
    label: 'Stopped',
    icon: AlertCircle,
    color: 'text-orange-500',
    bg: 'bg-orange-500/10',
  },
  failed: {
    label: 'Failed',
    icon: AlertCircle,
    color: 'text-red-500',
    bg: 'bg-red-500/10',
  },
};

const typeConfig = {
  workflow: {
    label: 'Workflow',
    icon: Video,
    color: 'text-blue-500',
    bg: 'bg-blue-500/10',
  },
  'image-gen': {
    label: 'Image Gen',
    icon: ImageIcon,
    color: 'text-violet-500',
    bg: 'bg-violet-500/10',
  },
};

export default function HistoryPage() {
  const router = useRouter();
  const [histories, setHistories] = useState<WorkflowHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedHistory, setSelectedHistory] = useState<WorkflowHistory | null>(null);
  const [deleting, setDeleting] = useState<number | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [filterType, setFilterType] = useState<'all' | 'workflow' | 'image-gen'>('all');

  const fetchHistories = async () => {
    try {
      const data = await getAllWorkflowHistory();
      setHistories(data);
      // Update selected history if it exists
      if (selectedHistory) {
        const updated = data.find((h) => h.id === selectedHistory.id);
        if (updated) {
          setSelectedHistory(updated);
        }
      }
    } catch (error) {
      console.error('Failed to fetch history:', error);
    } finally {
      setLoading(false);
    }
  };

  // On initial load, fetch histories
  useEffect(() => {
    fetchHistories();
  }, []);

  // Auto-refresh when there are in-progress tasks
  useEffect(() => {
    const hasInProgressTasks = histories.some((h) =>
      h.type === 'image-gen' &&
      (h.status === 'running' || h.status === 'partial') &&
      (!h.imageGenImages || parseJsonSafe(h.imageGenImages).length < (h.imageGenTotalCount || 0))
    );

    if (hasInProgressTasks) {
      const interval = setInterval(() => {
        fetchHistories();
      }, 2000); // Refresh every 2 seconds

      return () => clearInterval(interval);
    }
  }, [histories]);

  // Select the most recent in-progress task on initial load
  useEffect(() => {
    if (!loading && !selectedHistory && histories.length > 0) {
      // Find the most recent in-progress task
      const inProgressTask = histories.find((h) =>
        h.type === 'image-gen' &&
        (h.status === 'running' || h.status === 'partial') &&
        (!h.imageGenImages || parseJsonSafe(h.imageGenImages).length < (h.imageGenTotalCount || 0))
      );
      if (inProgressTask) {
        setSelectedHistory(inProgressTask);
      }
    }
  }, [loading, histories]);

  const handleDelete = async (id: number) => {
    if (!confirm('Are you sure you want to delete this record?')) return;

    setDeleting(id);
    try {
      await deleteWorkflowHistory(id);
      setHistories((prev) => prev.filter((h) => h.id !== id));
      if (selectedHistory?.id === id) {
        setSelectedHistory(null);
      }
    } catch (error) {
      console.error('Delete failed:', error);
    } finally {
      setDeleting(null);
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleString('en-US', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const parseJsonSafe = (data: string | unknown[] | null | undefined): unknown[] => {
    if (!data) return [];
    // If already an array, return directly
    if (Array.isArray(data)) return data;
    // If string, try to parse as JSON
    if (typeof data === 'string') {
      try {
        return JSON.parse(data);
      } catch {
        return [];
      }
    }
    return [];
  };

  // Filter histories by type
  const filteredHistories = histories.filter((h) => {
    if (filterType === 'all') return true;
    return (h.type || 'workflow') === filterType;
  });

  // Download images as ZIP
  const handleBatchDownload = async (history: WorkflowHistory) => {
    if (!history.imageGenImages) return;

    const images = parseJsonSafe(history.imageGenImages);
    if (images.length === 0) return;

    setDownloading(true);
    try {
      const response = await fetch('/api/batch-download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          images: (images as Array<{ imageUrl: string; prompt: string }>).map((img, idx) => ({
            url: img.imageUrl,
            filename: `image-${idx + 1}`,
          })),
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to create ZIP');
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `images-${history.id}-${Date.now()}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Download failed:', error);
      alert('Download failed');
    } finally {
      setDownloading(false);
    }
  };

  // Re-edit: Navigate to home page with history data
  const handleEdit = (history: WorkflowHistory) => {
    // Store history data in sessionStorage
    const historyData = {
      videoUrl: history.videoUrl,
      scriptResult: history.scriptResult,
      characters: parseJsonSafe(history.characters),
      scenes: parseJsonSafe(history.scenes),
      videos: parseJsonSafe(history.videos),
      mergedVideoUrl: history.mergedVideoUrl,
    };
    sessionStorage.setItem('loadHistoryData', JSON.stringify(historyData));
    router.push('/');
  };

  return (
    <div className="min-h-screen bg-zinc-950">
      {/* Top navigation bar */}
      <header className="border-b border-zinc-800 bg-zinc-950/80">
        <div className="mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.back()}
              className="flex items-center gap-2 text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Back
            </button>
            <div className="w-px h-5 bg-zinc-800" />
            <h1 className="text-sm font-medium text-zinc-200">History</h1>
          </div>
          <span className="px-2 py-0.5 text-xs text-zinc-500 bg-zinc-800 rounded">
            {filteredHistories.length} records
          </span>
        </div>
      </header>

      {/* Main content */}
      <main className="px-6 py-4 flex gap-4 h-[calc(100vh-49px)]">
        {/* Left list */}
        <div className="w-80 flex-shrink-0 overflow-hidden flex flex-col">
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 flex-1 overflow-hidden flex flex-col">
            <div className="p-3 border-b border-zinc-800 space-y-2">
              <h2 className="text-xs font-medium text-zinc-400">History List</h2>
              {/* Type filter */}
              <div className="flex gap-1.5">
                {(['all', 'workflow', 'image-gen'] as const).map((type) => (
                  <button
                    key={type}
                    onClick={() => setFilterType(type)}
                    className={cn(
                      'px-2 py-1 text-xs rounded transition-colors',
                      filterType === type
                        ? 'bg-zinc-800 text-zinc-200'
                        : 'text-zinc-500 hover:text-zinc-300'
                    )}
                  >
                    {type === 'all' ? 'All' : type === 'workflow' ? 'Workflow' : 'Image Gen'}
                  </button>
                ))}
              </div>
            </div>

            {loading ? (
              <div className="flex-1 flex items-center justify-center">
                <div className="text-zinc-500 text-sm">Loading...</div>
              </div>
            ) : filteredHistories.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center gap-2 text-zinc-500">
                <FileText className="w-10 h-10 text-zinc-700" />
                <span className="text-sm">No history records</span>
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto">
                {filteredHistories.map((history) => {
                  const isInProgress = history.type === 'image-gen'
                    && (history.status === 'running' || history.status === 'partial')
                    && (!history.imageGenImages || parseJsonSafe(history.imageGenImages).length < (history.imageGenTotalCount || 0));
                  const displayStatus = isInProgress ? 'running' : history.status;
                  const config = statusConfig[displayStatus as keyof typeof statusConfig] || statusConfig.pending;
                  const StatusIcon = config.icon;
                  const historyType = history.type || 'workflow';
                  const tConfig = typeConfig[historyType as keyof typeof typeConfig];
                  const TypeIcon = tConfig.icon;

                  return (
                    <div
                      key={history.id}
                      className={cn(
                        'p-3 border-b border-zinc-800/50 cursor-pointer transition-colors',
                        selectedHistory?.id === history.id
                          ? 'bg-zinc-800/50'
                          : 'hover:bg-zinc-800/30'
                      )}
                      onClick={() => setSelectedHistory(history)}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <h3 className="text-sm font-medium text-zinc-200 truncate">
                            {history.title}
                          </h3>
                          <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                            <span
                              className={cn(
                                'inline-flex items-center gap-1 px-1.5 py-0.5 text-xs rounded',
                                tConfig.bg,
                                tConfig.color
                              )}
                            >
                              <TypeIcon className="w-3 h-3" />
                              {tConfig.label}
                            </span>
                            <span
                              className={cn(
                                'inline-flex items-center gap-1 px-1.5 py-0.5 text-xs rounded',
                                config.bg,
                                config.color
                              )}
                            >
                              <StatusIcon className={cn('w-3 h-3', isInProgress && 'animate-spin')} />
                              {config.label}
                            </span>
                          </div>
                          <div className="flex items-center gap-1 mt-1.5 text-xs text-zinc-600">
                            <Calendar className="w-3 h-3" />
                            {formatDate(history.createdAt)}
                          </div>
                        </div>
                        <div className="flex items-center gap-0.5">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedHistory(history);
                            }}
                            className="p-1.5 rounded text-zinc-500 hover:text-zinc-300 hover:bg-zinc-700/50 transition-colors"
                            title="View details"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDelete(history.id);
                            }}
                            disabled={deleting === history.id}
                            className="p-1.5 rounded text-zinc-500 hover:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50"
                            title="Delete"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right details */}
        <div className="flex-1 min-w-0 overflow-hidden">
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 h-full overflow-hidden flex flex-col">
            {selectedHistory ? (
              <>
                <div className="p-3 border-b border-zinc-800 flex items-start justify-between">
                  <div>
                    <h2 className="text-sm font-medium text-zinc-200">{selectedHistory.title}</h2>
                    <p className="text-xs text-zinc-600 mt-0.5">
                      Created at {formatDate(selectedHistory.createdAt)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {(selectedHistory.type === 'image-gen' && selectedHistory.imageGenImages) && (
                      <button
                        onClick={() => handleBatchDownload(selectedHistory)}
                        disabled={downloading}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-medium bg-emerald-600 hover:bg-emerald-500 text-white transition-colors disabled:opacity-50"
                      >
                        {downloading ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Download className="w-3.5 h-3.5" />
                        )}
                        Download ZIP
                      </button>
                    )}
                    {(selectedHistory.type === 'workflow' || !selectedHistory.type) && (
                      <button
                        onClick={() => handleEdit(selectedHistory)}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-medium bg-blue-600 hover:bg-blue-500 text-white transition-colors"
                      >
                        <Edit className="w-3.5 h-3.5" />
                        Re-edit
                      </button>
                    )}
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto p-3 space-y-4">
                  {/* Video URL */}
                  {selectedHistory.videoUrl && (
                    <div className="space-y-1.5">
                      <h3 className="text-xs font-medium text-zinc-400 flex items-center gap-1.5">
                        <Video className="w-3.5 h-3.5 text-blue-500" />
                        Original Video
                      </h3>
                      <a
                        href={selectedHistory.videoUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block text-xs text-blue-500 hover:text-blue-400 truncate"
                      >
                        {selectedHistory.videoUrl}
                      </a>
                    </div>
                  )}

                  {/* Script result */}
                  {selectedHistory.scriptResult && (
                    <div className="space-y-1.5">
                      <h3 className="text-xs font-medium text-zinc-400 flex items-center gap-1.5">
                        <FileText className="w-3.5 h-3.5 text-cyan-500" />
                        Script Analysis Result
                      </h3>
                      <pre className="p-2.5 rounded bg-zinc-800 border border-zinc-700 text-xs text-zinc-300 overflow-x-auto max-h-48 overflow-y-auto whitespace-pre-wrap">
                        {selectedHistory.scriptResult}
                      </pre>
                    </div>
                  )}

                  {/* Characters */}
                  {selectedHistory.characters && (
                    <div className="space-y-1.5">
                      <h3 className="text-xs font-medium text-zinc-400 flex items-center gap-1.5">
                        <Users className="w-3.5 h-3.5 text-violet-500" />
                        Character References ({parseJsonSafe(selectedHistory.characters).length})
                      </h3>
                      <div className="grid grid-cols-4 gap-2">
                        {(parseJsonSafe(selectedHistory.characters) as Array<{ name: string; ossUrl?: string; imageUrl?: string }>).map((char, idx) => (
                          <div
                            key={idx}
                            className="rounded border border-zinc-800 overflow-hidden bg-zinc-800/30"
                          >
                            {(char.ossUrl || char.imageUrl) ? (
                              <img
                                src={char.ossUrl || char.imageUrl}
                                alt={char.name}
                                className="w-full aspect-square object-cover"
                              />
                            ) : (
                              <div className="w-full aspect-square bg-zinc-800 flex items-center justify-center">
                                <Users className="w-5 h-5 text-zinc-600" />
                              </div>
                            )}
                            <div className="p-1.5 text-xs text-zinc-400 truncate text-center">
                              {char.name}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Scenes */}
                  {selectedHistory.scenes && (
                    <div className="space-y-1.5">
                      <h3 className="text-xs font-medium text-zinc-400 flex items-center gap-1.5">
                        <Image className="w-3.5 h-3.5 text-amber-500" />
                        Storyboard Images ({parseJsonSafe(selectedHistory.scenes).length})
                      </h3>
                      <div className="grid grid-cols-3 gap-2">
                        {(parseJsonSafe(selectedHistory.scenes) as Array<{ title?: string; ossUrl?: string; imageUrl?: string }>).map((scene, idx) => (
                          <div
                            key={idx}
                            className="rounded border border-zinc-800 overflow-hidden bg-zinc-800/30"
                          >
                            {(scene.ossUrl || scene.imageUrl) ? (
                              <img
                                src={scene.ossUrl || scene.imageUrl}
                                alt={scene.title || `Storyboard ${idx + 1}`}
                                className="w-full aspect-video object-cover"
                              />
                            ) : (
                              <div className="w-full aspect-video bg-zinc-800 flex items-center justify-center">
                                <Image className="w-5 h-5 text-zinc-600" />
                              </div>
                            )}
                            <div className="p-1.5 text-xs text-zinc-400 truncate">
                              {scene.title || `Storyboard ${idx + 1}`}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Video clips */}
                  {selectedHistory.videos && parseJsonSafe(selectedHistory.videos).length > 0 && (
                    <div className="space-y-1.5">
                      <h3 className="text-xs font-medium text-zinc-400 flex items-center gap-1.5">
                        <Video className="w-3.5 h-3.5 text-pink-500" />
                        Video Clips ({parseJsonSafe(selectedHistory.videos).length})
                      </h3>
                      <div className="grid grid-cols-2 gap-2">
                        {(parseJsonSafe(selectedHistory.videos) as Array<{ title?: string; videoUrl?: string }>).map((video, idx) => (
                          <div
                            key={idx}
                            className="rounded border border-zinc-800 overflow-hidden bg-zinc-800/30"
                          >
                            {video.videoUrl ? (
                              <video
                                src={video.videoUrl}
                                className="w-full aspect-video object-cover"
                                controls
                              />
                            ) : (
                              <div className="w-full aspect-video bg-zinc-800 flex items-center justify-center">
                                <Video className="w-5 h-5 text-zinc-600" />
                              </div>
                            )}
                            <div className="p-1.5 text-xs text-zinc-400 truncate">
                              {video.title || `Video ${idx + 1}`}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Merged video */}
                  {selectedHistory.mergedVideoUrl && (
                    <div className="space-y-1.5">
                      <h3 className="text-xs font-medium text-zinc-400 flex items-center gap-1.5">
                        <Video className="w-3.5 h-3.5 text-emerald-500" />
                        Merged Video
                      </h3>
                      <video
                        src={selectedHistory.mergedVideoUrl}
                        className="w-full max-w-2xl rounded border border-zinc-800"
                        controls
                      />
                    </div>
                  )}

                  {/* Image Generation Results */}
                  {selectedHistory.type === 'image-gen' && (
                    <div className="space-y-3">
                      {(() => {
                        const completedCount = parseJsonSafe(selectedHistory.imageGenImages).length;
                        const totalCount = selectedHistory.imageGenTotalCount || 0;
                        const isStillRunning = (selectedHistory.status === 'running' || selectedHistory.status === 'partial') && completedCount < totalCount;
                        const isInterrupted = selectedHistory.status === 'interrupted';
                        const isStopped = selectedHistory.status === 'stopped';

                        if (isStillRunning) {
                          return (
                            <div className="p-3 rounded bg-blue-500/10 border border-blue-500/20">
                              <div className="flex items-center gap-3">
                                <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />
                                <div className="flex-1">
                                  <p className="text-sm text-zinc-200">Generating Images...</p>
                                  <p className="text-xs text-zinc-500 mt-0.5">
                                    Progress: {completedCount} / {totalCount} completed
                                  </p>
                                </div>
                                <div className="text-right">
                                  <span className="text-xl font-semibold text-blue-500">
                                    {Math.round((completedCount / totalCount) * 100)}%
                                  </span>
                                </div>
                              </div>
                              <div className="mt-2 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-blue-500 transition-all duration-300"
                                  style={{ width: `${(completedCount / totalCount) * 100}%` }}
                                />
                              </div>
                            </div>
                          );
                        }

                        if (isInterrupted || isStopped) {
                          return (
                            <div className="p-3 rounded bg-orange-500/10 border border-orange-500/20">
                              <div className="flex items-center gap-3">
                                <AlertCircle className="w-5 h-5 text-orange-500" />
                                <div className="flex-1">
                                  <p className="text-sm text-zinc-200">
                                    {isStopped ? 'Task Stopped' : 'Task Interrupted'}
                                  </p>
                                  <p className="text-xs text-zinc-500 mt-0.5">
                                    {isStopped
                                      ? `Task was stopped by user. Completed ${completedCount} / ${totalCount} images.`
                                      : `Page was refreshed. Completed ${completedCount} / ${totalCount} images before interruption.`
                                    }
                                  </p>
                                </div>
                              </div>
                              <div className="mt-2 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-orange-500"
                                  style={{ width: `${(completedCount / totalCount) * 100}%` }}
                                />
                              </div>
                            </div>
                          );
                        }

                        return null;
                      })()}

                      {/* Stats */}
                      {selectedHistory.imageGenImages && parseJsonSafe(selectedHistory.imageGenImages).length > 0 && (
                        <>
                          <div className="flex items-center gap-3 p-2.5 rounded bg-zinc-800/50 border border-zinc-800">
                            <div className="flex items-center gap-2">
                              <span className={cn(
                                'inline-flex items-center gap-1 px-1.5 py-0.5 text-xs rounded',
                                selectedHistory.imageGenMode === 'text-to-image'
                                  ? 'bg-violet-500/10 text-violet-400'
                                  : 'bg-pink-500/10 text-pink-400'
                              )}>
                                {selectedHistory.imageGenMode === 'text-to-image' ? (
                                  <Type className="w-3 h-3" />
                                ) : (
                                  <Image className="w-3 h-3" />
                                )}
                                {selectedHistory.imageGenMode === 'text-to-image' ? 'Text to Image' : 'Image to Edit'}
                              </span>
                            </div>
                            <div className="text-xs text-zinc-500">
                              Total: <span className="text-zinc-300">{selectedHistory.imageGenTotalCount}</span>
                            </div>
                            <div className="text-xs text-emerald-500">
                              Success: <span className="font-medium">{selectedHistory.imageGenSuccessCount}</span>
                            </div>
                            {(selectedHistory.imageGenErrorCount ?? 0) > 0 && (
                              <div className="text-xs text-red-500">
                                Failed: <span className="font-medium">{selectedHistory.imageGenErrorCount}</span>
                              </div>
                            )}
                          </div>

                          {/* Images Grid */}
                          <div className="space-y-1.5">
                            <h3 className="text-xs font-medium text-zinc-400 flex items-center gap-1.5">
                              <ImageIcon className="w-3.5 h-3.5 text-violet-500" />
                              Generated Images ({parseJsonSafe(selectedHistory.imageGenImages).length})
                            </h3>
                            <div className="grid grid-cols-3 gap-2">
                              {(parseJsonSafe(selectedHistory.imageGenImages) as Array<{ id: string; prompt: string; imageUrl: string; aspectRatio?: string; imageSize?: string }>).map((img, idx) => (
                                <div
                                  key={img.id || idx}
                                  className="rounded border border-zinc-800 overflow-hidden bg-zinc-800/30 group"
                                >
                                  <div className="relative aspect-square">
                                    <img
                                      src={img.imageUrl}
                                      alt={`Generated ${idx + 1}`}
                                      className="w-full h-full object-cover"
                                    />
                                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                      <a
                                        href={img.imageUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="p-1.5 rounded bg-white/20 hover:bg-white/30 text-white transition-colors"
                                      >
                                        <Eye className="w-3.5 h-3.5" />
                                      </a>
                                    </div>
                                  </div>
                                  <div className="p-1.5 space-y-0.5">
                                    <p className="text-xs text-zinc-400 line-clamp-2" title={img.prompt}>
                                      {img.prompt}
                                    </p>
                                    <div className="flex items-center gap-1.5 text-xs text-zinc-600">
                                      <span>{img.aspectRatio}</span>
                                      <span>·</span>
                                      <span>{img.imageSize}</span>
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center gap-2 text-zinc-500">
                <Eye className="w-10 h-10 text-zinc-700" />
                <span className="text-sm">Select a record to view details</span>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
