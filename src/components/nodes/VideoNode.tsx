'use client';

import { memo, useRef, useState, useEffect } from 'react';
import { Handle, Position, NodeProps, useReactFlow } from 'reactflow';
import { Video, Loader2, AlertCircle, Play, RefreshCw, X, Check, Maximize2, Download, Film, ImageIcon, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { VIDEO_MODELS, getDefaultVideoModel } from '@/config/api';
import type { VideoNodeData, NodeStatus, VideoModelId, VideoGenerationMode } from '@/types/workflow';

const statusConfig: Record<NodeStatus, {
  border: string;
  bg: string;
  glow: string;
  text: string;
  handleColor: string;
}> = {
  pending: {
    border: 'border-[#4A90E2]/30',
    bg: 'bg-[#222222]',
    glow: 'glow-subtle',
    text: 'text-[#888888]',
    handleColor: '#4A90E2',
  },
  running: {
    border: 'border-[#4A90E2]/70',
    bg: 'bg-[#1e3a5f]',
    glow: 'glow-blue animate-pulse-glow',
    text: 'text-[#60a5fa]',
    handleColor: '#4A90E2',
  },
  success: {
    border: 'border-[#34d399]/70',
    bg: 'bg-[#1a4d2e]',
    glow: 'glow-green',
    text: 'text-[#34d399]',
    handleColor: '#34d399',
  },
  error: {
    border: 'border-[#ef4444]/70',
    bg: 'bg-[#4d1a1a]',
    glow: 'glow-red',
    text: 'text-[#ef4444]',
    handleColor: '#ef4444',
  },
};

// Icon mapping for video models
const modelIconMap: Record<string, string> = {
  'seedance': '/seedance.png',
  'hailuo': '/hailuo.png',
  'wan': '/wan.png',
  'sora-2-pro': '/sora.png',
};

function VideoNode({ data, id }: NodeProps<VideoNodeData>) {
  const { label, status, videoUrl, thumbnailUrl, prompt, error, currentModel, currentMode, currentDuration, isMergedVideo, isInputVideo, onPreview, onRegenerate, onEditPrompt, onRegenerateWithModel, onDownload } = data;
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isHovering, setIsHovering] = useState(false);
  const [isRegenerateMode, setIsRegenerateMode] = useState(false);
  const [editedPrompt, setEditedPrompt] = useState(prompt || '');
  const [selectedModel, setSelectedModel] = useState<VideoModelId>(currentModel || 'seedance');
  const [selectedMode, setSelectedMode] = useState<VideoGenerationMode>(currentMode || 'first-last-frame');
  const [selectedDuration, setSelectedDuration] = useState<number>(currentDuration || VIDEO_MODELS['sora-2-pro'].defaultDuration || 4);
  const config = statusConfig[status];
  const { setNodes } = useReactFlow();

  // Get current model's duration options
  const currentModelConfig = VIDEO_MODELS[selectedModel];
  const hasDurationOptions = currentModelConfig.durationOptions && currentModelConfig.durationOptions.length > 0;

  // 当进入 regenerate 模式时，将节点置顶
  useEffect(() => {
    if (isRegenerateMode) {
      setNodes((nodes) =>
        nodes.map((node) => ({
          ...node,
          zIndex: node.id === id ? 1000 : node.zIndex || 0,
        }))
      );
    } else {
      // 恢复正常 z-index
      setNodes((nodes) =>
        nodes.map((node) => ({
          ...node,
          zIndex: node.id === id ? 0 : node.zIndex,
        }))
      );
    }
  }, [isRegenerateMode, id, setNodes]);

  // 当状态变为 running 时，自动退出 regenerate 模式
  useEffect(() => {
    if (status === 'running' && isRegenerateMode) {
      setIsRegenerateMode(false);
    }
  }, [status, isRegenerateMode]);

  // Update duration when model changes
  useEffect(() => {
    const modelConfig = VIDEO_MODELS[selectedModel];
    if (modelConfig.durationOptions && modelConfig.defaultDuration) {
      setSelectedDuration(modelConfig.defaultDuration);
    }
  }, [selectedModel]);

  const handleClick = () => {
    if (isRegenerateMode) return;
    if (videoUrl && onPreview) {
      onPreview({
        type: 'video',
        url: videoUrl,
        title: label,
        prompt,
      });
    }
  };

  const handleRegenerateClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    // Re-read global config when entering regenerate mode
    const defaultModel = getDefaultVideoModel();
    setSelectedModel(defaultModel);
    setSelectedMode(currentMode || 'first-last-frame');
    setEditedPrompt(prompt || '');
    // Set default duration for the selected model
    const modelConfig = VIDEO_MODELS[defaultModel];
    if (modelConfig.durationOptions && modelConfig.defaultDuration) {
      setSelectedDuration(modelConfig.defaultDuration);
    }
    setIsRegenerateMode(true);
  };

  const handleMouseEnter = () => {
    if (!isRegenerateMode) {
      setIsHovering(true);
      if (videoRef.current && videoUrl) {
        videoRef.current.play().catch(() => {});
      }
    }
  };

  const handleMouseLeave = () => {
    setIsHovering(false);
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.currentTime = 0;
    }
  };

  const handleConfirmRegenerate = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onRegenerateWithModel) {
      // Pass duration only for models that support it
      const durationToPass = hasDurationOptions ? selectedDuration : undefined;
      // Determine if prompt has changed
      const promptChanged = editedPrompt.trim() && editedPrompt.trim() !== prompt;
      const newPrompt = promptChanged ? editedPrompt.trim() : undefined;
      onRegenerateWithModel(selectedModel, selectedMode, durationToPass, newPrompt);
    } else {
      setIsRegenerateMode(false);
    }
  };

  const handleCancelRegenerate = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsRegenerateMode(false);
  };

  const handleDownload = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onDownload) {
      onDownload();
    } else if (videoUrl) {
      const link = document.createElement('a');
      link.href = videoUrl;
      link.download = `${label}.mp4`;
      link.target = '_blank';
      link.click();
    }
  };

  // Regenerate mode UI (combined prompt editing, model and mode selection)
  if (isRegenerateMode) {
    return (
      <div
        className={cn(
          'rounded-xl border overflow-hidden w-[360px]',
          'transition-all duration-300',
          'border-zinc-700/80 bg-zinc-900/95 shadow-xl',
          'nodrag'
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <Handle
          type="target"
          position={Position.Left}
          className="w-2! h-2! bg-slate-600! border! border-slate-400!"
        />

        <div className="p-3">
          {/* Header */}
          <div className="text-xs font-medium text-zinc-300 mb-3 flex items-center gap-1.5">
            <Video className="w-3.5 h-3.5 text-blue-400" />
            Regenerate Video - {label}
          </div>

          {/* Prompt editing */}
          <div className="mb-3">
            <div className="text-[10px] text-zinc-500 mb-1.5">Prompt</div>
            <textarea
              value={editedPrompt}
              onChange={(e) => setEditedPrompt(e.target.value)}
              className="w-full h-20 px-2 py-1.5 text-xs bg-zinc-800/80 border border-zinc-700/50 rounded-lg text-zinc-200 resize-none focus:outline-none focus:border-blue-500/50 placeholder-zinc-500"
              placeholder="Enter video generation prompt..."
            />
          </div>

          {/* Model selection - horizontal layout */}
          <div className="mb-3">
            <div className="text-[10px] text-zinc-500 mb-1.5">Model</div>
            <div className="flex flex-wrap gap-1.5">
              {Object.values(VIDEO_MODELS).map((model) => (
                <button
                  key={model.id}
                  onClick={() => setSelectedModel(model.id)}
                  className={cn(
                    'flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-[11px] font-medium transition-all',
                    'border',
                    selectedModel === model.id
                      ? 'bg-blue-500/20 border-blue-500/50 text-blue-200'
                      : 'bg-zinc-800/80 border-zinc-700/50 text-zinc-400 hover:bg-zinc-700/80 hover:text-zinc-300'
                  )}
                >
                  <img src={modelIconMap[model.id]} alt={model.name} className="w-4 h-4 object-contain rounded" />
                  <span>{model.name}</span>
                  {selectedModel === model.id && (
                    <Check className="w-3 h-3 text-blue-400" />
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Generation mode selection */}
          <div className="mb-3">
            <div className="text-[10px] text-zinc-500 mb-1.5">Generation Mode</div>
            <div className="flex gap-1.5">
              <button
                onClick={() => setSelectedMode('first-last-frame')}
                className={cn(
                  'flex-1 px-2 py-1.5 rounded-lg text-[11px] font-medium transition-all flex items-center justify-center gap-1.5',
                  'border',
                  selectedMode === 'first-last-frame'
                    ? 'bg-cyan-500/20 border-cyan-500/50 text-cyan-200'
                    : 'bg-zinc-800/80 border-zinc-700/50 text-zinc-400 hover:bg-zinc-700/80 hover:text-zinc-300'
                )}
              >
                <Film className="w-3.5 h-3.5" />
                <span>First-Last Frame</span>
              </button>
              <button
                onClick={() => setSelectedMode('single-image')}
                className={cn(
                  'flex-1 px-2 py-1.5 rounded-lg text-[11px] font-medium transition-all flex items-center justify-center gap-1.5',
                  'border',
                  selectedMode === 'single-image'
                    ? 'bg-violet-500/20 border-violet-500/50 text-violet-200'
                    : 'bg-zinc-800/80 border-zinc-700/50 text-zinc-400 hover:bg-zinc-700/80 hover:text-zinc-300'
                )}
              >
                <ImageIcon className="w-3.5 h-3.5" />
                <span>Single Image</span>
              </button>
            </div>
          </div>

          {/* Duration selection - only for models that support it */}
          {hasDurationOptions && currentModelConfig.durationOptions && (
            <div className="mb-3">
              <div className="text-[10px] text-zinc-500 mb-1.5 flex items-center gap-1">
                <Clock className="w-3 h-3" />
                Duration
              </div>
              <div className="flex flex-wrap gap-1">
                {currentModelConfig.durationOptions.map((duration) => (
                  <button
                    key={duration.value}
                    onClick={() => setSelectedDuration(duration.value)}
                    className={cn(
                      'px-2 py-1.5 rounded-lg text-[11px] font-medium transition-all',
                      'border',
                      selectedDuration === duration.value
                        ? 'bg-amber-500/20 border-amber-500/50 text-amber-200'
                        : 'bg-zinc-800/80 border-zinc-700/50 text-zinc-400 hover:bg-zinc-700/80 hover:text-zinc-300'
                    )}
                  >
                    {duration.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex justify-end gap-2 pt-1">
            <button
              onClick={handleCancelRegenerate}
              className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-[11px] font-medium flex items-center gap-1 border border-zinc-700/50"
            >
              <X className="w-3 h-3" />
              Cancel
            </button>
            <button
              onClick={handleConfirmRegenerate}
              className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-[11px] font-medium flex items-center gap-1"
            >
              <RefreshCw className="w-3 h-3" />
              Generate
            </button>
          </div>
        </div>

        <Handle
          type="source"
          position={Position.Right}
          className="w-2! h-2! bg-slate-600! border! border-slate-400!"
        />
      </div>
    );
  }

  return (
    <div
      className={cn(
        'rounded-2xl border-2 overflow-hidden cursor-pointer w-[150px]',
        'transition-all duration-300 node-hover-effect backdrop-blur-sm',
        config.border,
        config.bg,
        config.glow
      )}
      onClick={handleClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="w-2.5! h-2.5! bg-[#2a2a2a]! border-2! hover:scale-125! transition-all"
        style={{ borderColor: config.handleColor }}
      />

      {/* Video preview area */}
      <div className="relative w-full h-[85px] bg-[#1a1a1a] flex items-center justify-center overflow-hidden group">
        {status === 'success' && videoUrl ? (
          <>
            <video
              ref={videoRef}
              src={videoUrl}
              className="w-full h-full object-cover"
              muted
              loop
              playsInline
              poster={thumbnailUrl}
            />
            {/* Hover action layer */}
            <div className={cn(
              'absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent flex flex-col justify-end transition-opacity',
              isHovering ? 'opacity-100' : 'opacity-0'
            )}>
              {/* Bottom action buttons */}
              <div className="flex items-center justify-center gap-1.5 p-2">
                <button
                  onClick={handleClick}
                  className="w-6 h-6 rounded bg-white/20 backdrop-blur-sm flex items-center justify-center hover:bg-white/40 transition-colors"
                  title="Play video"
                >
                  <Maximize2 className="w-3 h-3 text-white" />
                </button>
                {/* Download button - shown for merged video */}
                {isMergedVideo && (
                  <button
                    onClick={handleDownload}
                    className="w-6 h-6 rounded bg-emerald-500/60 backdrop-blur-sm flex items-center justify-center hover:bg-emerald-500/80 transition-colors"
                    title="Download video"
                  >
                    <Download className="w-3 h-3 text-white" />
                  </button>
                )}
                {/* Input video doesn't show regenerate button */}
                {!isInputVideo && onRegenerateWithModel && (
                  <button
                    onClick={handleRegenerateClick}
                    className="w-6 h-6 rounded bg-violet-500/60 backdrop-blur-sm flex items-center justify-center hover:bg-violet-500/80 transition-colors"
                    title="Edit & Regenerate"
                  >
                    <RefreshCw className="w-3 h-3 text-white" />
                  </button>
                )}
                {/* Re-merge button - shown after merge success */}
                {isMergedVideo && onRegenerate && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onRegenerate();
                    }}
                    className="w-6 h-6 rounded bg-cyan-500/60 backdrop-blur-sm flex items-center justify-center hover:bg-cyan-500/80 transition-colors"
                    title="Re-merge"
                  >
                    <RefreshCw className="w-3 h-3 text-white" />
                  </button>
                )}
              </div>
            </div>
            {/* Play icon - shown when not hovering */}
            {!isHovering && (
              <div className="absolute inset-0 bg-black/50 flex items-center justify-center backdrop-blur-[2px]">
                <div className="w-10 h-10 rounded-full bg-white/20 border border-white/30 flex items-center justify-center">
                  <Play className="w-5 h-5 text-white ml-0.5" fill="currentColor" />
                </div>
              </div>
            )}
          </>
        ) : status === 'running' ? (
          <div className="flex flex-col items-center gap-2">
            <div className="relative">
              <div className="w-10 h-10 rounded-full border-2 border-[#4A90E2]/30 border-t-[#4A90E2] animate-spin" />
              <Loader2 className="w-5 h-5 text-[#4A90E2] absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
            </div>
            <span className="text-xs text-[#60a5fa] font-medium">Generating...</span>
          </div>
        ) : status === 'error' ? (
          <div className="flex flex-col items-center gap-1 px-2">
            <div className="w-6 h-6 rounded-full bg-[#ef4444]/20 flex items-center justify-center">
              <AlertCircle className="w-4 h-4 text-[#ef4444]" />
            </div>
            <span className="text-[10px] text-[#ef4444] text-center line-clamp-1">{error || 'Failed'}</span>
            {/* Action buttons in error state - compact layout */}
            <div className="flex gap-1 justify-center">
              {onRegenerateWithModel && (
                <button
                  onClick={handleRegenerateClick}
                  className="px-1.5 py-0.5 rounded bg-[#7c3aed]/80 hover:bg-[#7c3aed] text-white text-[10px] transition-all flex items-center gap-0.5"
                >
                  <RefreshCw className="w-2.5 h-2.5" />
                  Retry
                </button>
              )}
              {/* Merge retry button - shown only when onRegenerate exists but no onRegenerateWithModel */}
              {onRegenerate && !onRegenerateWithModel && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onRegenerate();
                  }}
                  className="px-1.5 py-0.5 rounded bg-[#34d399]/80 hover:bg-[#34d399] text-white text-[10px] transition-all flex items-center gap-0.5"
                >
                  <RefreshCw className="w-2.5 h-2.5" />
                  Re-merge
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <div className="w-10 h-10 rounded-xl bg-[#2a2a2a] border border-[#4A90E2]/30 flex items-center justify-center">
              <Video className="w-5 h-5 text-[#888888]" />
            </div>
            <span className="text-xs text-[#888888]">Waiting</span>
          </div>
        )}
      </div>

      {/* Label */}
      <div className="px-3 py-2 bg-[#1a1a1a] border-t border-[#4A90E2]/20">
        <div className="text-xs font-medium text-[#e0e0e0] truncate text-center">
          {label}
        </div>
      </div>

      <Handle
        type="source"
        position={Position.Right}
        className="w-2.5! h-2.5! bg-[#2a2a2a]! border-2! hover:scale-125! transition-all"
        style={{ borderColor: config.handleColor }}
      />
    </div>
  );
}

export default memo(VideoNode);
