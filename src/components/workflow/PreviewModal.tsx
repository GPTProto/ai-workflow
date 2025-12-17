'use client';

import { cn } from '@/lib/utils';
import type { PreviewContent } from '@/types/workflow';
import Editor from '@monaco-editor/react';
import { Check, Copy, Download, Edit3, Maximize2, Save, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

interface PreviewModalProps {
  content: PreviewContent | null;
  onClose: () => void;
}

const CopyButton = ({ text }: { text: string }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      onClick={handleCopy}
      className={cn(
        'p-2 rounded-lg transition-all',
        'bg-slate-700/50 hover:bg-slate-600/50',
        'border border-slate-600/50 hover:border-slate-500/50'
      )}
      title="Copy"
    >
      {copied ? (
        <Check className="w-4 h-4 text-emerald-400" />
      ) : (
        <Copy className="w-4 h-4 text-slate-300" />
      )}
    </button>
  );
};

export function PreviewModal({ content, onClose }: PreviewModalProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editedText, setEditedText] = useState('');

  // Initialize edit text
  useEffect(() => {
    if (content?.text) {
      setEditedText(content.text);
    }
  }, [content?.text]);

  // Reset editing state when content changes
  useEffect(() => {
    setIsEditing(false);
  }, [content]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // Don't close with ESC in editing mode
      if (e.key === 'Escape' && !isEditing) {
        onClose();
      }
    },
    [onClose, isEditing]
  );

  const handleDownload = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (content) {
      const textToDownload = isEditing ? editedText : content.text;
      if (content.type === 'text' && textToDownload) {
        // Text type download
        const blob = new Blob([textToDownload], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${content.title}.txt`;
        link.click();
        URL.revokeObjectURL(url);
      } else if (content.url) {
        // Media type download
        const link = document.createElement('a');
        link.href = content.url;
        link.download = `${content.title}.${content.type === 'image' ? 'png' : 'mp4'}`;
        link.click();
      }
    }
  };

  const handleEditToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isEditing) {
      // Save edit
      if (content?.onSaveText && editedText !== content.text) {
        content.onSaveText(editedText);
      }
    }
    setIsEditing(!isEditing);
  };

  const handleCancelEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEditedText(content?.text || '');
    setIsEditing(false);
  };

  useEffect(() => {
    if (content) {
      document.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [content, handleKeyDown]);

  if (!content) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 backdrop-blur-sm"
      onClick={isEditing ? undefined : onClose}
    >
      {/* Background decoration */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-violet-500/10 rounded-full blur-3xl" />
      </div>

      {/* Top toolbar */}
      <div className="absolute top-0 left-0 right-0 p-4 flex items-center justify-between z-10">
        <div className="flex items-center gap-3">
          <div className="px-3 py-1.5 bg-slate-800/80 rounded-lg border border-slate-700/50">
            <span className="text-sm font-medium text-slate-200">{content.title}</span>
          </div>
          <span className="text-xs text-slate-500 uppercase">
            {content.type}
          </span>
          {isEditing && (
            <span className="px-2 py-0.5 text-xs font-medium bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded">
              Edit Mode
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Edit button - shown for text type (when editable is true or onSaveText callback provided) */}
          {content.type === 'text' && (content.editable || content.onSaveText) && (
            <>
              {isEditing && (
                <button
                  onClick={handleCancelEdit}
                  className={cn(
                    'p-2 rounded-lg transition-all',
                    'bg-slate-800/80 hover:bg-slate-700/80',
                    'border border-slate-700/50 hover:border-slate-600/50'
                  )}
                  title="Cancel edit"
                >
                  <X className="w-5 h-5 text-slate-300" />
                </button>
              )}
              <button
                onClick={handleEditToggle}
                className={cn(
                  'p-2 rounded-lg transition-all',
                  isEditing
                    ? 'bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/50 hover:border-emerald-400/50'
                    : 'bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700/50 hover:border-slate-600/50'
                )}
                title={isEditing ? 'Save edit' : 'Edit script'}
              >
                {isEditing ? (
                  <Save className="w-5 h-5 text-emerald-400" />
                ) : (
                  <Edit3 className="w-5 h-5 text-slate-300" />
                )}
              </button>
            </>
          )}
          <button
            onClick={handleDownload}
            className={cn(
              'p-2 rounded-lg transition-all',
              'bg-slate-800/80 hover:bg-slate-700/80',
              'border border-slate-700/50 hover:border-slate-600/50'
            )}
            title="Download"
          >
            <Download className="w-5 h-5 text-slate-300" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
            className={cn(
              'p-2 rounded-lg transition-all',
              'bg-slate-800/80 hover:bg-red-500/20',
              'border border-slate-700/50 hover:border-red-500/50'
            )}
            title="Close (ESC)"
          >
            <X className="w-5 h-5 text-slate-300 hover:text-red-400" />
          </button>
        </div>
      </div>

      {/* Content area */}
      <div
        className="relative max-w-[90vw] max-h-[85vh] flex flex-col items-center"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Media/text content */}
        <div className="relative rounded-xl overflow-hidden border border-slate-700/50 bg-slate-900/50 shadow-2xl">
          {content.type === 'image' && content.url ? (
            <img
              src={content.url}
              alt={content.title}
              className="max-w-full max-h-[70vh] object-contain"
            />
          ) : content.type === 'video' && content.url ? (
            <video
              ref={videoRef}
              src={content.url}
              controls
              autoPlay
              className="max-w-full max-h-[70vh]"
            />
          ) : content.type === 'text' && (content.text || editedText) ? (
            <div className="w-[800px] max-w-[90vw] max-h-[70vh] overflow-auto p-6">
              
              {isEditing ? (
                <div className="w-full h-[70vh] rounded-lg border border-slate-600/50">
                  <Editor
                    height="100%"
                    defaultLanguage="json"
                    value={editedText}
                    onChange={(value) => setEditedText(value || '')}
                    theme="vs-dark"
                    options={{
                      minimap: { enabled: false },
                      fontSize: 13, 
                      lineNumbers: 'on',
                      scrollBeyondLastLine: false,
                      wordWrap: 'on',
                      automaticLayout: true,
                      padding: { top: 12, bottom: 12 },
                      tabSize: 2,
                      formatOnPaste: true,
                      formatOnType: true,
                    }}
                  />
                </div>
              ) : (
                <pre className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap font-mono">
                  {content.text}
                </pre>
              )}
            </div>
          ) : null}

          {/* Fullscreen hint - media types only */}
          {content.type !== 'text' && (
            <div className="absolute bottom-3 right-3 opacity-0 hover:opacity-100 transition-opacity">
              <div className="px-2 py-1 bg-black/60 rounded text-xs text-slate-300 flex items-center gap-1">
                <Maximize2 className="w-3 h-3" />
                <span>Double-click for fullscreen</span>
              </div>
            </div>
          )}
        </div>

        {/* Prompt display */}
        {content.prompt && (
          <div className="mt-4 w-full max-w-[800px]">
            <div className={cn(
              'px-4 py-3 rounded-xl',
              'bg-slate-800/50 border border-slate-700/50',
              'backdrop-blur-sm'
            )}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Prompt
                </span>
                <CopyButton text={content.prompt} />
              </div>
              <p className="text-sm text-slate-300 leading-relaxed font-mono">
                {content.prompt}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Bottom hint */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-xs text-slate-600">
        {isEditing ? 'ESC does not close in edit mode' : 'Press ESC or click background to close'}
      </div>
    </div>
  );
}
