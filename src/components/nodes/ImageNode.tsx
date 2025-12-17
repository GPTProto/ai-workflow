'use client';

import { memo, useState } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { Image, Loader2, AlertCircle, ZoomIn, RefreshCw, Edit3, X, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ImageNodeData, NodeStatus } from '@/types/workflow';

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
    border: 'border-blue-500/70',
    bg: 'bg-blue-950/80',
    glow: 'glow-blue animate-pulse-glow',
    text: 'text-blue-400',
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

function ImageNode({ data }: NodeProps<ImageNodeData>) {
  const { label, status, imageUrl, prompt, error, onPreview, onRegenerate, onEditPrompt } = data;
  const [isHovering, setIsHovering] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editedPrompt, setEditedPrompt] = useState(prompt || '');
  const config = statusConfig[status];

  const handleClick = () => {
    if (isEditing) return;
    if (imageUrl && onPreview) {
      onPreview({
        type: 'image',
        url: imageUrl,
        title: label,
        prompt,
      });
    }
  };

  const handleRegenerate = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onRegenerate && status !== 'running') {
      onRegenerate();
    }
  };

  const handleEditClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEditedPrompt(prompt || '');
    setIsEditing(true);
  };

  const handleSavePrompt = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onEditPrompt && editedPrompt.trim()) {
      onEditPrompt(editedPrompt.trim());
    }
    setIsEditing(false);
  };

  const handleCancelEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsEditing(false);
    setEditedPrompt(prompt || '');
  };

  const handleMouseEnter = () => {
    if (!isEditing) {
      setIsHovering(true);
    }
  };

  const handleMouseLeave = () => {
    setIsHovering(false);
  };

  // Edit mode UI
  if (isEditing) {
    return (
      <div
        className={cn(
          'rounded-xl border-2 overflow-hidden w-[280px]',
          'transition-all duration-300 backdrop-blur-sm',
          'border-amber-500/70 bg-amber-950/80'
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <Handle
          type="target"
          position={Position.Left}
          className="w-2.5! h-2.5! bg-slate-600! border! border-slate-400!"
        />

        <div className="p-3">
          <div className="text-xs font-medium text-amber-400 mb-2">Edit Image Prompt</div>
          <textarea
            value={editedPrompt}
            onChange={(e) => setEditedPrompt(e.target.value)}
            className="w-full h-24 px-2 py-1.5 text-xs bg-slate-800/80 border border-slate-600/50 rounded-lg text-slate-200 resize-none focus:outline-none focus:border-amber-500/50"
            placeholder="Enter image generation prompt..."
            autoFocus
          />
          <div className="flex justify-end gap-2 mt-2">
            <button
              onClick={handleCancelEdit}
              className="px-2 py-1 rounded bg-slate-700 hover:bg-slate-600 text-slate-300 text-xs flex items-center gap-1"
            >
              <X className="w-3 h-3" />
              Cancel
            </button>
            <button
              onClick={handleSavePrompt}
              className="px-2 py-1 rounded bg-amber-600 hover:bg-amber-500 text-white text-xs flex items-center gap-1"
            >
              <Check className="w-3 h-3" />
              Save & Regenerate
            </button>
          </div>
        </div>

        <Handle
          type="source"
          position={Position.Right}
          className="w-2.5! h-2.5! bg-slate-600! border! border-slate-400!"
        />
      </div>
    );
  }

  return (
    <div
      className={cn(
        'rounded-xl border-2 overflow-hidden cursor-pointer w-[150px]',
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
        className="w-2.5! h-2.5! bg-slate-600! border! border-slate-400! hover:bg-blue-500! transition-colors"
      />

      {/* Image preview area */}
      <div className="relative w-full h-[85px] bg-slate-800/50 flex items-center justify-center overflow-hidden group">
        {status === 'success' && imageUrl ? (
          <>
            <img
              src={imageUrl}
              alt={label}
              className="w-full h-full object-cover"
            />
            {/* Hover zoom icon */}
            {!isHovering && (
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center backdrop-blur-[2px]">
                <div className="w-10 h-10 rounded-full bg-white/20 border border-white/30 flex items-center justify-center">
                  <ZoomIn className="w-5 h-5 text-white" />
                </div>
              </div>
            )}
            {/* Action buttons - shown on hover */}
            {isHovering && (onRegenerate || onEditPrompt) && (
              <div className="absolute top-1 right-1 flex gap-1">
                {onEditPrompt && (
                  <button
                    onClick={handleEditClick}
                    className="p-1.5 rounded-lg bg-blue-500/90 hover:bg-blue-400 text-white transition-all shadow-lg"
                    title="Edit prompt"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                  </button>
                )}
                {onRegenerate && (
                  <button
                    onClick={handleRegenerate}
                    className="p-1.5 rounded-lg bg-amber-500/90 hover:bg-amber-400 text-white transition-all shadow-lg"
                    title="Regenerate"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            )}
          </>
        ) : status === 'running' ? (
          <div className="flex flex-col items-center gap-2">
            <div className="relative">
              <div className="w-10 h-10 rounded-full border-2 border-blue-500/30 border-t-blue-500 animate-spin" />
              <Loader2 className="w-5 h-5 text-blue-400 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
            </div>
            <span className="text-xs text-blue-400 font-medium">Generating...</span>
          </div>
        ) : status === 'error' ? (
          <div className="flex flex-col items-center gap-2 px-2">
            <div className="w-8 h-8 rounded-full bg-red-500/20 flex items-center justify-center">
              <AlertCircle className="w-5 h-5 text-red-400" />
            </div>
            <span className="text-xs text-red-400 text-center line-clamp-2">{error || 'Generation failed'}</span>
            {/* Action buttons in error state */}
            <div className="flex gap-1">
              {onEditPrompt && (
                <button
                  onClick={handleEditClick}
                  className="px-2 py-1 rounded bg-blue-500/80 hover:bg-blue-400 text-white text-xs transition-all flex items-center gap-1"
                >
                  <Edit3 className="w-3 h-3" />
                  Edit
                </button>
              )}
              {onRegenerate && (
                <button
                  onClick={handleRegenerate}
                  className="px-2 py-1 rounded bg-amber-500/80 hover:bg-amber-400 text-white text-xs transition-all flex items-center gap-1"
                >
                  <RefreshCw className="w-3 h-3" />
                  Retry
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <div className="w-10 h-10 rounded-lg bg-slate-700/50 border border-slate-600/50 flex items-center justify-center">
              <Image className="w-5 h-5 text-slate-500" />
            </div>
            <span className="text-xs text-slate-500">Waiting</span>
          </div>
        )}
      </div>

      {/* Label */}
      <div className="px-3 py-2 bg-slate-800/80 border-t border-slate-700/50">
        <div className="text-xs font-medium text-slate-300 truncate text-center">
          {label}
        </div>
      </div>

      <Handle
        type="source"
        position={Position.Right}
        className="w-2.5! h-2.5! bg-slate-600! border! border-slate-400! hover:bg-blue-500! transition-colors"
      />
    </div>
  );
}

export default memo(ImageNode);
