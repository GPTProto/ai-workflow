'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import {
  Download,
  Edit3,
  RefreshCw,
  Loader2,
  AlertCircle,
  X,
  Check,
  ImageIcon,
  Maximize2,
} from 'lucide-react';

export interface ImageCardData {
  id: string;
  index: number;
  prompt: string;
  status: 'pending' | 'processing' | 'done' | 'error';
  imageUrl?: string;
  error?: string;
}

interface ImageCardProps {
  data: ImageCardData;
  onRetry: (id: string, newPrompt?: string) => void;
  onDownload: (id: string, imageUrl: string) => void;
  onPreview: (imageUrl: string, prompt: string) => void;
}

export function ImageCard({ data, onRetry, onDownload, onPreview }: ImageCardProps) {
  const { id, index, prompt, status, imageUrl, error } = data;
  const [isEditing, setIsEditing] = useState(false);
  const [editedPrompt, setEditedPrompt] = useState(prompt);

  const handleSaveAndRetry = () => {
    onRetry(id, editedPrompt);
    setIsEditing(false);
  };

  const handleCancelEdit = () => {
    setEditedPrompt(prompt);
    setIsEditing(false);
  };

  const handleDownload = () => {
    if (imageUrl) {
      onDownload(id, imageUrl);
    }
  };

  // Edit mode
  if (isEditing) {
    return (
      <div className="rounded-xl border border-amber-500/50 bg-slate-900/80 backdrop-blur-sm overflow-hidden">
        <div className="p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-amber-400">Edit Prompt</span>
            <span className="text-xs text-slate-500">#{index + 1}</span>
          </div>
          <textarea
            value={editedPrompt}
            onChange={(e) => setEditedPrompt(e.target.value)}
            className={cn(
              'w-full h-24 px-3 py-2 text-xs rounded-lg resize-none',
              'bg-slate-800/50 border border-slate-600/50 text-slate-300',
              'focus:outline-none focus:border-amber-500/50',
              'placeholder:text-slate-600'
            )}
            placeholder="Enter image generation prompt..."
            autoFocus
          />
          <div className="flex justify-end gap-2 mt-3">
            <button
              onClick={handleCancelEdit}
              className="px-3 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 text-xs flex items-center gap-1 transition-colors"
            >
              <X className="w-3 h-3" />
              Cancel
            </button>
            <button
              onClick={handleSaveAndRetry}
              className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-xs flex items-center gap-1 transition-colors"
            >
              <Check className="w-3 h-3" />
              Save & Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'rounded-xl border overflow-hidden transition-all duration-300',
        'bg-slate-900/80 backdrop-blur-sm group',
        status === 'done' && 'border-emerald-500/30 hover:border-emerald-500/50',
        status === 'error' && 'border-red-500/50',
        status === 'processing' && 'border-violet-500/50',
        status === 'pending' && 'border-slate-700/50'
      )}
    >
      {/* Image Area */}
      <div className="relative aspect-square bg-slate-800/50 flex items-center justify-center overflow-hidden">
        {status === 'done' && imageUrl ? (
          <>
            <img
              src={imageUrl}
              alt={`Generated ${index + 1}`}
              className="w-full h-full object-cover"
            />
            {/* Hover overlay with actions */}
            <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
              <button
                onClick={() => onPreview(imageUrl, prompt)}
                className="p-2 rounded-lg bg-white/20 hover:bg-white/30 text-white transition-colors"
                title="Preview"
              >
                <Maximize2 className="w-4 h-4" />
              </button>
              <button
                onClick={handleDownload}
                className="p-2 rounded-lg bg-emerald-500/80 hover:bg-emerald-500 text-white transition-colors"
                title="Download"
              >
                <Download className="w-4 h-4" />
              </button>
              <button
                onClick={() => setIsEditing(true)}
                className="p-2 rounded-lg bg-amber-500/80 hover:bg-amber-500 text-white transition-colors"
                title="Edit & Retry"
              >
                <Edit3 className="w-4 h-4" />
              </button>
              <button
                onClick={() => onRetry(id)}
                className="p-2 rounded-lg bg-violet-500/80 hover:bg-violet-500 text-white transition-colors"
                title="Retry"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            </div>
          </>
        ) : status === 'processing' ? (
          <div className="flex flex-col items-center gap-3">
            <div className="relative">
              <div className="w-12 h-12 rounded-full border-2 border-violet-500/30 border-t-violet-500 animate-spin" />
              <Loader2 className="w-5 h-5 text-violet-400 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
            </div>
            <span className="text-xs text-violet-400">Generating...</span>
          </div>
        ) : status === 'error' ? (
          <div className="flex flex-col items-center gap-3 px-4 text-center">
            <div className="w-10 h-10 rounded-full bg-red-500/20 flex items-center justify-center">
              <AlertCircle className="w-5 h-5 text-red-400" />
            </div>
            <span className="text-xs text-red-400 line-clamp-2">{error || 'Generation failed'}</span>
            <div className="flex gap-2">
              <button
                onClick={() => setIsEditing(true)}
                className="px-2 py-1 rounded-lg bg-amber-500/80 hover:bg-amber-500 text-white text-xs transition-colors flex items-center gap-1"
              >
                <Edit3 className="w-3 h-3" />
                Edit
              </button>
              <button
                onClick={() => onRetry(id)}
                className="px-2 py-1 rounded-lg bg-violet-500/80 hover:bg-violet-500 text-white text-xs transition-colors flex items-center gap-1"
              >
                <RefreshCw className="w-3 h-3" />
                Retry
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <div className="w-10 h-10 rounded-xl bg-slate-700/50 border border-slate-600/50 flex items-center justify-center">
              <ImageIcon className="w-5 h-5 text-slate-500" />
            </div>
            <span className="text-xs text-slate-500">Waiting</span>
          </div>
        )}
      </div>

      {/* Card Footer */}
      <div className="px-3 py-2 border-t border-slate-700/50">
        <div className="flex items-center justify-between">
          <span className="text-xs text-slate-400 font-medium">#{index + 1}</span>
          <span
            className={cn(
              'text-xs',
              status === 'done' && 'text-emerald-400',
              status === 'error' && 'text-red-400',
              status === 'processing' && 'text-violet-400',
              status === 'pending' && 'text-slate-500'
            )}
          >
            {status === 'done' && 'Done'}
            {status === 'error' && 'Failed'}
            {status === 'processing' && 'Processing'}
            {status === 'pending' && 'Pending'}
          </span>
        </div>
        <p className="text-xs text-slate-500 truncate mt-1" title={prompt}>
          {prompt}
        </p>
      </div>
    </div>
  );
}
