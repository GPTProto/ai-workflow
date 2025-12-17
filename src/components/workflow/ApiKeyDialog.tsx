'use client';

import { useState, useEffect } from 'react';
import { Key, X, Check, Eye, EyeOff, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ApiKeyDialogProps {
  isOpen: boolean;
  onClose: () => void;
  apiKey: string;
  onSave: (key: string) => void;
}

export function ApiKeyDialog({ isOpen, onClose, apiKey, onSave }: ApiKeyDialogProps) {
  const [inputKey, setInputKey] = useState(apiKey);
  const [showKey, setShowKey] = useState(false);

  useEffect(() => {
    setInputKey(apiKey);
  }, [apiKey, isOpen]);

  const handleSave = () => {
    if (inputKey.trim()) {
      onSave(inputKey.trim());
      onClose();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSave();
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Background overlay */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Dialog content */}
      <div className={cn(
        'relative w-full max-w-md mx-4 p-6 rounded-2xl',
        'bg-slate-900/95 border border-slate-700/50',
        'shadow-2xl shadow-black/50'
      )}>
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Title */}
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500 to-violet-500 flex items-center justify-center">
            <Key className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-slate-100">API Key Settings</h2>
            <p className="text-xs text-slate-400">Configure your API key to use the service</p>
          </div>
        </div>

        {/* Get API Key guide */}
        <div className="mb-4 p-3 rounded-xl bg-blue-500/10 border border-blue-500/20">
          <p className="text-sm text-blue-300 mb-2">
            Don&apos;t have an API Key? Get one from:
          </p>
          <a
            href="https://gptproto.com"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-sm font-medium text-blue-400 hover:text-blue-300 transition-colors"
          >
            <ExternalLink className="w-4 h-4" />
            https://gptproto.com
          </a>
        </div>

        {/* Input field */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-slate-300 mb-2">
            API Key
          </label>
          <div className="relative">
            <input
              type={showKey ? 'text' : 'password'}
              value={inputKey}
              onChange={(e) => setInputKey(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="sk-xxxxxxxxxxxxxxxxxxxxxxxx"
              className={cn(
                'w-full px-4 py-3 pr-12 rounded-xl',
                'bg-slate-800/50 border border-slate-600/50',
                'text-slate-200 placeholder-slate-500',
                'focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20',
                'transition-all'
              )}
              autoFocus
            />
            <button
              type="button"
              onClick={() => setShowKey(!showKey)}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-700/50 transition-colors"
            >
              {showKey ? (
                <EyeOff className="w-4 h-4" />
              ) : (
                <Eye className="w-4 h-4" />
              )}
            </button>
          </div>
          <p className="mt-2 text-xs text-slate-500">
            API Key will be saved locally in your browser, not uploaded to server
          </p>
        </div>

        {/* Buttons */}
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className={cn(
              'flex-1 px-4 py-2.5 rounded-xl',
              'bg-slate-800/50 border border-slate-600/50',
              'text-slate-300 font-medium',
              'hover:bg-slate-700/50 hover:border-slate-500/50',
              'transition-all'
            )}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!inputKey.trim()}
            className={cn(
              'flex-1 px-4 py-2.5 rounded-xl',
              'bg-gradient-to-r from-blue-600 to-violet-600',
              'text-white font-medium',
              'hover:from-blue-500 hover:to-violet-500',
              'disabled:opacity-50 disabled:cursor-not-allowed',
              'transition-all flex items-center justify-center gap-2'
            )}
          >
            <Check className="w-4 h-4" />
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
