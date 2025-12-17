'use client';

import { memo, useRef, useState } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { Film, Loader2, AlertCircle, Play, Download } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { MergeNodeData, NodeStatus } from '@/types/workflow';

const statusConfig: Record<NodeStatus, {
  border: string;
  bg: string;
  glow: string;
  text: string;
}> = {
  pending: {
    border: 'border-slate-600/50',
    bg: 'bg-slate-900/80',
    glow: '',
    text: 'text-slate-500',
  },
  running: {
    border: 'border-violet-500/70',
    bg: 'bg-violet-950/80',
    glow: 'glow-purple animate-pulse-glow',
    text: 'text-violet-400',
  },
  success: {
    border: 'border-emerald-500/70',
    bg: 'bg-emerald-950/80',
    glow: 'glow-green',
    text: 'text-emerald-400',
  },
  error: {
    border: 'border-red-500/70',
    bg: 'bg-red-950/80',
    glow: 'glow-red',
    text: 'text-red-400',
  },
};

function MergeNode({ data }: NodeProps<MergeNodeData>) {
  const { label, status, videoUrl, error, onPreview } = data;
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isHovering, setIsHovering] = useState(false);
  const config = statusConfig[status];

  const handleClick = () => {
    if (videoUrl && onPreview) {
      onPreview({
        type: 'video',
        url: videoUrl,
        title: label,
      });
    }
  };

  const handleDownload = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (videoUrl) {
      const link = document.createElement('a');
      link.href = videoUrl;
      link.download = 'merged-video.mp4';
      link.click();
    }
  };

  const handleMouseEnter = () => {
    setIsHovering(true);
    if (videoRef.current && videoUrl) {
      videoRef.current.play().catch(() => {});
    }
  };

  const handleMouseLeave = () => {
    setIsHovering(false);
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.currentTime = 0;
    }
  };

  return (
    <div
      className={cn(
        'rounded-xl border-2 overflow-hidden cursor-pointer w-[170px]',
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
        className="w-2.5! h-2.5! bg-slate-600! border! border-slate-400! hover:bg-violet-500! transition-colors"
      />

      {/* Video preview area */}
      <div className="relative w-full h-[95px] bg-slate-800/50 flex items-center justify-center overflow-hidden group">
        {status === 'success' && videoUrl ? (
          <>
            <video
              ref={videoRef}
              src={videoUrl}
              className="w-full h-full object-cover"
              muted
              loop
              playsInline
            />
            {/* Play icon */}
            {!isHovering && (
              <div className="absolute inset-0 bg-black/50 flex items-center justify-center backdrop-blur-[2px]">
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-violet-500/30 to-emerald-500/30 border border-white/30 flex items-center justify-center">
                  <Play className="w-6 h-6 text-white ml-0.5" fill="currentColor" />
                </div>
              </div>
            )}
            {/* Download button */}
            {isHovering && (
              <button
                onClick={handleDownload}
                className="absolute bottom-2 right-2 w-9 h-9 rounded-full bg-emerald-500/90 flex items-center justify-center hover:bg-emerald-400 transition-colors shadow-lg"
                title="Download video"
              >
                <Download className="w-4 h-4 text-white" />
              </button>
            )}
          </>
        ) : status === 'running' ? (
          <div className="flex flex-col items-center gap-2">
            <div className="relative">
              <div className="w-12 h-12 rounded-full border-2 border-violet-500/30 border-t-violet-500 animate-spin" />
              <Film className="w-5 h-5 text-violet-400 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
            </div>
            <span className="text-xs text-violet-400 font-medium">Merging...</span>
          </div>
        ) : status === 'error' ? (
          <div className="flex flex-col items-center gap-2 px-2">
            <div className="w-10 h-10 rounded-full bg-red-500/20 flex items-center justify-center">
              <AlertCircle className="w-6 h-6 text-red-400" />
            </div>
            <span className="text-xs text-red-400 text-center line-clamp-2">{error || 'Merge failed'}</span>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-slate-700/50 to-slate-800/50 border border-slate-600/50 flex items-center justify-center">
              <Film className="w-6 h-6 text-slate-500" />
            </div>
            <span className="text-xs text-slate-500">Waiting</span>
          </div>
        )}
      </div>

      {/* Label */}
      <div className="px-3 py-2.5 bg-slate-800/80 border-t border-slate-700/50">
        <div className="text-sm font-semibold text-slate-200 truncate text-center">
          {label}
        </div>
      </div>

      <Handle
        type="source"
        position={Position.Right}
        className="w-2.5! h-2.5! bg-slate-600! border! border-slate-400! hover:bg-emerald-500! transition-colors"
      />
    </div>
  );
}

export default memo(MergeNode);
