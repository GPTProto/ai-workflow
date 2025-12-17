'use client';

import { Navbar } from '@/components/layout';
import { PreviewModal } from '@/components/workflow';
import { ApiKeyDialog } from '@/components/workflow/ApiKeyDialog';
import { ImageGrid, HistoryPanel } from '@/components/image-gen';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { useApiKey } from '@/hooks/useApiKey';
import { useImageWorkflow } from '@/hooks/useImageWorkflow';
import type { ImageSizeId } from '@/types/workflow';
import {
  Archive,
  FileSpreadsheet,
  Image,
  ImagePlus,
  Loader2,
  Maximize,
  Play,
  RotateCcw,
  Square,
  Type,
} from 'lucide-react';
import { useRef, useState } from 'react';

const ASPECT_RATIOS = [
  { value: '1:1', label: '1:1' },
  { value: '16:9', label: '16:9' },
  { value: '9:16', label: '9:16' },
  { value: '4:3', label: '4:3' },
  { value: '3:4', label: '3:4' },
];

const IMAGE_SIZE_OPTIONS: { value: ImageSizeId; label: string }[] = [
  { value: '1K', label: '1K (1024px)' },
  { value: '2K', label: '2K (2048px)' },
  { value: '4K', label: '4K (4096px)' },
];

export default function ImageGenPage() {
  const {
    mode,
    switchMode,
    tasks,
    isRunning,
    previewContent,
    closePreview,
    openPreview,
    prompt,
    setPrompt,
    aspectRatio,
    setAspectRatio,
    imageSize,
    setImageSize,
    uploadedImages,
    handleFilesUpload,
    handleZipUpload,
    clearUploadedImages,
    startGeneration,
    stopGeneration,
    reset,
    retryTask,
    downloadImage,
    batchDownload,
    historyRefreshTrigger,
  } = useImageWorkflow();

  const { apiKey, setApiKey, hasApiKey, isLoaded } = useApiKey();
  const [showApiKeyDialog, setShowApiKeyDialog] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [isBatchDownloading, setIsBatchDownloading] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const zipInputRef = useRef<HTMLInputElement>(null);
  const excelInputRef = useRef<HTMLInputElement>(null);

  const handleStartGeneration = () => {
    if (!hasApiKey) {
      setShowApiKeyDialog(true);
      return;
    }
    startGeneration(excelPrompts.length > 0 ? excelPrompts : undefined);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    try {
      await handleFilesUpload(Array.from(files));
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleZipChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      await handleZipUpload(file);
    } finally {
      setUploading(false);
      if (zipInputRef.current) {
        zipInputRef.current.value = '';
      }
    }
  };

  const [excelPrompts, setExcelPrompts] = useState<string[]>([]);

  const handleExcelChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/parse-excel', {
        method: 'POST',
        body: formData,
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Parse failed');
      }

      setExcelPrompts(result.prompts);
    } catch (error) {
      console.error('Excel parse error:', error);
      alert('Failed to parse Excel file');
    } finally {
      setUploading(false);
      if (excelInputRef.current) {
        excelInputRef.current.value = '';
      }
    }
  };

  const clearExcelPrompts = () => {
    setExcelPrompts([]);
  };

  const handleBatchDownload = async () => {
    setIsBatchDownloading(true);
    try {
      await batchDownload();
    } finally {
      setIsBatchDownloading(false);
    }
  };

  const imageCardTasks = tasks.map((t) => ({
    id: t.id,
    index: t.index,
    prompt: t.prompt,
    status: t.status,
    imageUrl: t.generatedUrl,
    error: t.error,
  }));

  if (!isLoaded) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="text-zinc-500 text-sm">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950">
      <Navbar hasApiKey={hasApiKey} onApiKeyClick={() => setShowApiKeyDialog(true)} />

      <main className="px-6 py-4 flex gap-4 h-[calc(100vh-57px)]">
        {/* Left Sidebar - Control Panel */}
        <div className="w-72 shrink-0">
          <div className="h-full rounded-lg border border-zinc-800 bg-zinc-900/50 overflow-hidden flex flex-col">
            <div className="p-4 flex-1 overflow-y-auto space-y-4">
              {/* Mode selection */}
              <div>
                <label className="text-xs text-zinc-500 font-medium block mb-2">Mode</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => switchMode('text-to-image')}
                    disabled={isRunning}
                    className={cn(
                      'flex flex-col items-center gap-1 px-2 py-2 rounded text-xs font-medium transition-all border',
                      mode === 'text-to-image'
                        ? 'bg-blue-500/10 text-blue-500 border-blue-500/30'
                        : 'bg-zinc-800 text-zinc-400 border-zinc-700 hover:text-zinc-200'
                    )}
                  >
                    <Type className="w-4 h-4" />
                    <span>Text to Image</span>
                  </button>
                  <button
                    onClick={() => switchMode('image-to-edit')}
                    disabled={isRunning}
                    className={cn(
                      'flex flex-col items-center gap-1 px-2 py-2 rounded text-xs font-medium transition-all border',
                      mode === 'image-to-edit'
                        ? 'bg-blue-500/10 text-blue-500 border-blue-500/30'
                        : 'bg-zinc-800 text-zinc-400 border-zinc-700 hover:text-zinc-200'
                    )}
                  >
                    <Image className="w-4 h-4" />
                    <span>Image Edit</span>
                  </button>
                </div>
              </div>

              {/* Image-to-Edit mode: Upload area */}
              {mode === 'image-to-edit' && (
                <div className="space-y-2">
                  <label className="text-xs text-zinc-500 font-medium block">Upload Images</label>

                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={handleFileChange}
                    className="hidden"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isRunning || uploading}
                    className="w-full h-8 text-xs border-zinc-700 text-zinc-400"
                  >
                    {uploading ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <ImagePlus className="w-3 h-3 mr-1" />}
                    Select Images
                  </Button>

                  <input
                    ref={zipInputRef}
                    type="file"
                    accept=".zip"
                    onChange={handleZipChange}
                    className="hidden"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => zipInputRef.current?.click()}
                    disabled={isRunning || uploading}
                    className="w-full h-8 text-xs border-zinc-700 text-zinc-400"
                  >
                    {uploading ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Archive className="w-3 h-3 mr-1" />}
                    Upload ZIP
                  </Button>

                  {uploadedImages.length > 0 && (
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-emerald-500">{uploadedImages.length} images</span>
                        <button
                          onClick={clearUploadedImages}
                          disabled={isRunning}
                          className="text-xs text-zinc-500 hover:text-red-400"
                        >
                          Clear
                        </button>
                      </div>
                      <div className="grid grid-cols-5 gap-1 max-h-[80px] overflow-y-auto">
                        {uploadedImages.map((img, idx) => (
                          <div key={idx} className="aspect-square rounded overflow-hidden border border-zinc-700">
                            <img src={img.url} alt={img.filename} className="w-full h-full object-cover" />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Prompt */}
              <div>
                <label className="text-xs text-zinc-500 font-medium block mb-2">
                  {mode === 'text-to-image' ? 'Prompt' : 'Edit Prompt'}
                </label>
                <Textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder={mode === 'text-to-image' ? 'Describe the image...' : 'Describe the edit...'}
                  className="text-xs bg-zinc-800 border-zinc-700 text-zinc-200 placeholder:text-zinc-600 resize-none min-h-[80px]"
                  disabled={isRunning || excelPrompts.length > 0}
                />
              </div>

              {/* Excel upload - only for text-to-image mode */}
              {mode === 'text-to-image' && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs text-zinc-500 font-medium">Batch (Excel)</label>
                    <a href="/example-prompts.xlsx" download className="text-xs text-blue-500 hover:text-blue-400">
                      Example
                    </a>
                  </div>
                  <input
                    ref={excelInputRef}
                    type="file"
                    accept=".xlsx,.xls"
                    onChange={handleExcelChange}
                    className="hidden"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => excelInputRef.current?.click()}
                    disabled={isRunning || uploading}
                    className="w-full h-8 text-xs border-zinc-700 text-zinc-400"
                  >
                    {uploading ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <FileSpreadsheet className="w-3 h-3 mr-1" />}
                    Upload Excel
                  </Button>

                  {excelPrompts.length > 0 && (
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-emerald-500">{excelPrompts.length} prompts</span>
                        <button onClick={clearExcelPrompts} disabled={isRunning} className="text-xs text-zinc-500 hover:text-red-400">
                          Clear
                        </button>
                      </div>
                      <div className="max-h-[60px] overflow-y-auto space-y-0.5">
                        {excelPrompts.slice(0, 3).map((p, idx) => (
                          <div key={idx} className="text-xs text-zinc-500 truncate bg-zinc-800 px-2 py-0.5 rounded">
                            {idx + 1}. {p}
                          </div>
                        ))}
                        {excelPrompts.length > 3 && (
                          <div className="text-xs text-zinc-600 px-2">+{excelPrompts.length - 3} more</div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Aspect Ratio */}
              <div>
                <label className="text-xs text-zinc-500 font-medium block mb-2">Aspect Ratio</label>
                <div className="grid grid-cols-5 gap-1">
                  {ASPECT_RATIOS.map((ratio) => (
                    <button
                      key={ratio.value}
                      onClick={() => setAspectRatio(ratio.value)}
                      disabled={isRunning}
                      className={cn(
                        'px-1.5 py-1 rounded text-xs font-medium transition-all border',
                        aspectRatio === ratio.value
                          ? 'bg-blue-500/10 text-blue-500 border-blue-500/30'
                          : 'bg-zinc-800 text-zinc-500 border-zinc-700 hover:text-zinc-300'
                      )}
                    >
                      {ratio.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Image Size */}
              <div>
                <label className="text-xs text-zinc-500 font-medium block mb-2">Size</label>
                <div className="relative">
                  <select
                    value={imageSize}
                    onChange={(e) => setImageSize(e.target.value as ImageSizeId)}
                    disabled={isRunning}
                    className="w-full h-8 px-2 pr-7 rounded border appearance-none cursor-pointer bg-zinc-800 border-zinc-700 text-zinc-300 text-xs focus:outline-none focus:border-zinc-600 disabled:opacity-50"
                  >
                    {IMAGE_SIZE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                  <Maximize className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-zinc-500 pointer-events-none" />
                </div>
              </div>
            </div>

            {/* Bottom action buttons */}
            <div className="p-3 border-t border-zinc-800 space-y-2">
              {isRunning && (
                <div className="px-2 py-1.5 rounded bg-blue-500/10 text-xs text-blue-500 flex items-center gap-2">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  <span>Generating... ({tasks.filter(t => t.status === 'done').length}/{tasks.length})</span>
                </div>
              )}

              <div className="flex gap-2">
                {!isRunning ? (
                  <Button
                    size="sm"
                    onClick={handleStartGeneration}
                    disabled={
                      (mode === 'text-to-image' && !prompt.trim() && excelPrompts.length === 0) ||
                      uploading ||
                      (mode === 'image-to-edit' && uploadedImages.length === 0)
                    }
                    className="flex-1 h-8 bg-blue-600 hover:bg-blue-500 text-xs"
                  >
                    <Play className="w-3 h-3 mr-1" />
                    Start ({mode === 'text-to-image' ? (excelPrompts.length > 0 ? excelPrompts.length : 1) : uploadedImages.length})
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    onClick={stopGeneration}
                    className="flex-1 h-8 bg-red-600 hover:bg-red-500 text-xs"
                  >
                    <Square className="w-3 h-3 mr-1" />
                    Stop
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={reset}
                  disabled={isRunning}
                  className="h-8 px-3 border-zinc-700 text-zinc-400"
                >
                  <RotateCcw className="w-3 h-3" />
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Right Content - Image Grid */}
        <div className="flex-1 flex flex-col gap-4 min-w-0">
          <div className="flex-1 min-h-0 rounded-lg border border-zinc-800 bg-zinc-900/50 overflow-hidden">
            <ImageGrid
              tasks={imageCardTasks}
              isRunning={isRunning}
              onRetry={retryTask}
              onDownload={downloadImage}
              onPreview={openPreview}
              onBatchDownload={handleBatchDownload}
              isBatchDownloading={isBatchDownloading}
            />
          </div>

          <HistoryPanel refreshTrigger={historyRefreshTrigger} />
        </div>
      </main>

      <PreviewModal content={previewContent} onClose={closePreview} />

      <ApiKeyDialog
        isOpen={showApiKeyDialog}
        onClose={() => setShowApiKeyDialog(false)}
        apiKey={apiKey}
        onSave={setApiKey}
      />
    </div>
  );
}
