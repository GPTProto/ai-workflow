'use client';

import { memo, useState, useRef, useEffect } from 'react';
import { Handle, Position, NodeProps, useReactFlow } from 'reactflow';
import { User, Loader2, AlertCircle, ZoomIn, RefreshCw, X, Check, Upload } from 'lucide-react';
import { cn } from '@/lib/utils';
import { IMAGE_TEXT_TO_IMAGE_MODELS, getDefaultImageModel, getDefaultAspectRatio, getDefaultImageSize } from '@/config/api';
import type { CharacterNodeData, NodeStatus, ImageTextToImageModelId } from '@/types/workflow';

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
    border: 'border-[#8b5cf6]/70',
    bg: 'bg-[#2d1f4e]',
    glow: 'glow-violet animate-pulse-glow',
    text: 'text-[#a78bfa]',
    handleColor: '#8b5cf6',
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

function CharacterNode({ data, id }: NodeProps<CharacterNodeData>) {
  const { label, status, imageUrl, prompt, characterName, error, onPreview, onRegenerate, onEditPrompt, onUpload, onRegenerateWithModel } = data;
  const config = statusConfig[status];
  const [isHovering, setIsHovering] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isRegenerateMode, setIsRegenerateMode] = useState(false);
  const [editedPrompt, setEditedPrompt] = useState(prompt || '');
  // Initialize from user's default settings in localStorage
  const [selectedModel, setSelectedModel] = useState<ImageTextToImageModelId>(() => getDefaultImageModel());
  // Initialize size based on the selected model's default
  const [selectedSize, setSelectedSize] = useState<string>(() => {
    const defaultModel = getDefaultImageModel();
    return IMAGE_TEXT_TO_IMAGE_MODELS[defaultModel].defaultSize;
  });
  const [selectedAspectRatio, setSelectedAspectRatio] = useState<string>(() => {
    const defaultModel = getDefaultImageModel();
    if (defaultModel === 'gemini') {
      return getDefaultAspectRatio();
    }
    return '';
  });
  const [showImagePreview, setShowImagePreview] = useState(false);
  const [previewPosition, setPreviewPosition] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const imageRef = useRef<HTMLImageElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { setNodes } = useReactFlow();

  // 当进入 regenerate 或 edit 模式时，将节点置顶
  useEffect(() => {
    if (isRegenerateMode || isEditing) {
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
  }, [isRegenerateMode, isEditing, id, setNodes]);

  // Update default size and aspectRatio when selected model changes
  useEffect(() => {
    const model = IMAGE_TEXT_TO_IMAGE_MODELS[selectedModel];
    setSelectedSize(model.defaultSize);
    setSelectedAspectRatio(model.defaultAspectRatio || '');
  }, [selectedModel]);

  // 当状态变为 running 时，自动退出 regenerate 模式
  useEffect(() => {
    if (status === 'running' && isRegenerateMode) {
      setIsRegenerateMode(false);
    }
  }, [status, isRegenerateMode]);

  const handleClick = () => {
    if (isEditing || isRegenerateMode) return;
    if (imageUrl && onPreview) {
      onPreview({
        type: 'image',
        url: imageUrl,
        title: characterName || label,
        prompt,
      });
    }
  };

  const handleRegenerateClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    // Show combined edit + model selection UI
    if (onRegenerateWithModel) {
      setEditedPrompt(prompt || '');
      // Re-read global config when entering regenerate mode
      const defaultModel = getDefaultImageModel();
      setSelectedModel(defaultModel);
      // Use global default size, or fall back to model's default size
      const globalSize = getDefaultImageSize();
      const modelSizes = IMAGE_TEXT_TO_IMAGE_MODELS[defaultModel].sizeOptions.map(s => s.value);
      if (modelSizes.includes(globalSize)) {
        setSelectedSize(globalSize);
      } else {
        setSelectedSize(IMAGE_TEXT_TO_IMAGE_MODELS[defaultModel].defaultSize);
      }
      // Set aspect ratio for Gemini
      if (defaultModel === 'gemini') {
        setSelectedAspectRatio(getDefaultAspectRatio());
      } else {
        setSelectedAspectRatio('');
      }
      setIsRegenerateMode(true);
    } else if (onRegenerate) {
      onRegenerate();
    }
  };

  const handleEditClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    // Also show the combined UI when clicking edit
    setEditedPrompt(prompt || '');
    // Re-read global config when entering regenerate mode
    const defaultModel = getDefaultImageModel();
    setSelectedModel(defaultModel);
    // Use global default size, or fall back to model's default size
    const globalSize = getDefaultImageSize();
    const modelSizes = IMAGE_TEXT_TO_IMAGE_MODELS[defaultModel].sizeOptions.map(s => s.value);
    if (modelSizes.includes(globalSize)) {
      setSelectedSize(globalSize);
    } else {
      setSelectedSize(IMAGE_TEXT_TO_IMAGE_MODELS[defaultModel].defaultSize);
    }
    // Set aspect ratio for Gemini
    if (defaultModel === 'gemini') {
      setSelectedAspectRatio(getDefaultAspectRatio());
    } else {
      setSelectedAspectRatio('');
    }
    setIsRegenerateMode(true);
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
    if (!isEditing && !isRegenerateMode) {
      setIsHovering(true);
    }
  };

  const handleMouseLeave = () => {
    setIsHovering(false);
    setShowImagePreview(false);
  };

  const handleImageMouseEnter = (e: React.MouseEvent<HTMLImageElement>) => {
    if (imageUrl && status === 'success' && !isEditing && !isRegenerateMode) {
      const rect = e.currentTarget.getBoundingClientRect();
      // 预览框显示在图片右侧
      setPreviewPosition({
        x: rect.right + 10,
        y: rect.top,
      });
      setShowImagePreview(true);
    }
  };

  const handleImageMouseLeave = () => {
    setShowImagePreview(false);
  };

  const handleUploadClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && onUpload) {
      if (!file.type.startsWith('image/')) {
        alert('Please select an image file');
        return;
      }
      onUpload(file);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleConfirmRegenerate = (e: React.MouseEvent) => {
    e.stopPropagation();
    const currentModel = IMAGE_TEXT_TO_IMAGE_MODELS[selectedModel];
    const hasAspectRatio = currentModel.aspectRatioOptions && currentModel.aspectRatioOptions.length > 0;

    // For Gemini models, pass both size and aspectRatio; for others, pass size only
    const sizeToPass = selectedSize;
    const aspectRatioToPass = hasAspectRatio ? selectedAspectRatio : undefined;

    // Determine if prompt has changed
    const promptChanged = editedPrompt.trim() && editedPrompt.trim() !== prompt;
    const newPrompt = promptChanged ? editedPrompt.trim() : undefined;

    console.log('[CharacterNode] handleConfirmRegenerate called', {
      selectedModel,
      sizeToPass,
      aspectRatioToPass,
      editedPrompt,
      promptChanged,
      newPrompt,
      hasOnRegenerateWithModel: !!onRegenerateWithModel,
    });

    // Call onRegenerateWithModel with the new prompt if changed
    // This single call handles both prompt update and regeneration
    if (onRegenerateWithModel) {
      console.log('[CharacterNode] Calling onRegenerateWithModel with newPrompt:', newPrompt);
      onRegenerateWithModel(selectedModel, sizeToPass, aspectRatioToPass, newPrompt);
    } else {
      console.warn('[CharacterNode] onRegenerateWithModel is undefined!');
      setIsRegenerateMode(false);
    }
  };

  const handleCancelRegenerate = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsRegenerateMode(false);
  };

  // Regenerate mode UI (combined model and size selection)
  if (isRegenerateMode) {
    const currentModel = IMAGE_TEXT_TO_IMAGE_MODELS[selectedModel];
    const hasAspectRatio = currentModel.aspectRatioOptions && currentModel.aspectRatioOptions.length > 0;

    // Icon mapping for models
    const modelIconMap: Record<string, string> = {
      'gemini': '/gemini.png',
      'seedream': '/seedance.png',
      'wan-t2i': '/wan.png',
    };

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
            <User className="w-3.5 h-3.5 text-violet-400" />
            Regenerate Character - {characterName || label}
          </div>

          {/* Prompt editing */}
          <div className="mb-3">
            <div className="text-[10px] text-zinc-500 mb-1.5">Prompt</div>
            <textarea
              value={editedPrompt}
              onChange={(e) => setEditedPrompt(e.target.value)}
              className="w-full h-20 px-2 py-1.5 text-xs bg-zinc-800/80 border border-zinc-700/50 rounded-lg text-zinc-200 resize-none focus:outline-none focus:border-violet-500/50 placeholder-zinc-500"
              placeholder="Enter character image generation prompt..."
            />
          </div>

          {/* Model selection - horizontal layout */}
          <div className="mb-3">
            <div className="text-[10px] text-zinc-500 mb-1.5">Model</div>
            <div className="flex flex-wrap gap-1.5">
              {Object.values(IMAGE_TEXT_TO_IMAGE_MODELS).map((model) => (
                <button
                  key={model.id}
                  onClick={() => setSelectedModel(model.id)}
                  className={cn(
                    'flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-[11px] font-medium transition-all',
                    'border',
                    selectedModel === model.id
                      ? 'bg-violet-500/20 border-violet-500/50 text-violet-200'
                      : 'bg-zinc-800/80 border-zinc-700/50 text-zinc-400 hover:bg-zinc-700/80 hover:text-zinc-300'
                  )}
                >
                  <img src={modelIconMap[model.id]} alt={model.name} className="w-4 h-4 object-contain rounded" />
                  <span>{model.name}</span>
                  {selectedModel === model.id && (
                    <Check className="w-3 h-3 text-violet-400" />
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Size selection - shown for all models */}
          <div className="mb-3">
            <div className="text-[10px] text-zinc-500 mb-1.5">Size</div>
            <div className="flex flex-wrap gap-1">
              {currentModel.sizeOptions.map((size) => (
                <button
                  key={size.value}
                  onClick={() => setSelectedSize(size.value)}
                  className={cn(
                    'px-2 py-1.5 rounded-lg text-[11px] font-medium transition-all text-center whitespace-nowrap',
                    'border',
                    selectedSize === size.value
                      ? 'bg-violet-500/20 border-violet-500/50 text-violet-200'
                      : 'bg-zinc-800/80 border-zinc-700/50 text-zinc-400 hover:bg-zinc-700/80 hover:text-zinc-300'
                  )}
                >
                  {size.label}
                </button>
              ))}
            </div>
          </div>

          {/* Aspect Ratio selection - only shown for Gemini model */}
          {hasAspectRatio && (
            <div className="mb-3">
              <div className="text-[10px] text-zinc-500 mb-1.5">Ratio</div>
              <div className="flex gap-1">
                {currentModel.aspectRatioOptions!.slice(0, 5).map((ratio) => (
                  <button
                    key={ratio.value}
                    onClick={() => setSelectedAspectRatio(ratio.value)}
                    className={cn(
                      'flex-1 px-1 py-1.5 rounded-lg text-[11px] font-medium transition-all text-center',
                      'border',
                      selectedAspectRatio === ratio.value
                        ? 'bg-violet-500/20 border-violet-500/50 text-violet-200'
                        : 'bg-zinc-800/80 border-zinc-700/50 text-zinc-400 hover:bg-zinc-700/80 hover:text-zinc-300'
                    )}
                  >
                    {ratio.value}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={handleCancelRegenerate}
              className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-[11px] font-medium flex items-center gap-1 border border-zinc-700/50"
            >
              <X className="w-3 h-3" />
              Cancel
            </button>
            <button
              type="button"
              onClick={(e) => {
                console.log('[CharacterNode] Generate button clicked');
                handleConfirmRegenerate(e);
              }}
              className="px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-[11px] font-medium flex items-center gap-1"
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
        'rounded-2xl border-2 overflow-hidden w-[150px]',
        'transition-all duration-300 node-hover-effect backdrop-blur-sm',
        config.border,
        config.bg,
        config.glow
      )}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="w-2.5! h-2.5! bg-[#2a2a2a]! border-2! hover:scale-125! transition-all"
        style={{ borderColor: config.handleColor }}
      />

      {/* Image preview area - 1:1 ratio */}
      <div className="relative w-full h-[125px] bg-[#1a1a1a] flex items-center justify-center overflow-hidden group">
        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileChange}
          className="hidden"
        />
        {status === 'success' && imageUrl ? (
          <>
            <img
              ref={imageRef}
              src={imageUrl}
              alt={characterName || label}
              className="w-full h-full object-cover cursor-pointer"
              onClick={handleClick}
              onMouseEnter={handleImageMouseEnter}
              onMouseLeave={handleImageMouseLeave}
            />
            {/* Image hover preview popup */}
            {showImagePreview && (
              <div
                className="fixed z-[9999] pointer-events-none"
                style={{
                  left: previewPosition.x,
                  top: previewPosition.y,
                }}
              >
                <div className="bg-slate-900/95 border border-slate-600/50 rounded-xl p-2 shadow-2xl backdrop-blur-sm">
                  <img
                    src={imageUrl}
                    alt={characterName || label}
                    className="max-w-[280px] max-h-[280px] object-contain rounded-lg"
                  />
                  <div className="mt-1.5 text-xs text-slate-400 text-center truncate max-w-[280px]">
                    {characterName || label}
                  </div>
                </div>
              </div>
            )}
            {/* Hover action layer */}
            <div className={cn(
              'absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent flex flex-col justify-end transition-opacity',
              isHovering ? 'opacity-100' : 'opacity-0'
            )}>
              {/* Bottom action buttons */}
              <div className="flex items-center justify-center gap-1.5 p-2">
                <button
                  onClick={handleClick}
                  className="w-6 h-6 rounded-lg bg-white/20 backdrop-blur-sm flex items-center justify-center hover:bg-white/40 transition-colors"
                  title="View image"
                >
                  <ZoomIn className="w-3 h-3 text-white" />
                </button>
                {onUpload && (
                  <button
                    onClick={handleUploadClick}
                    className="w-6 h-6 rounded-lg bg-[#34d399]/60 backdrop-blur-sm flex items-center justify-center hover:bg-[#34d399]/80 transition-colors"
                    title="Upload replacement"
                  >
                    <Upload className="w-3 h-3 text-white" />
                  </button>
                )}
                {(onRegenerateWithModel || onRegenerate) && (
                  <button
                    onClick={handleRegenerateClick}
                    className="w-6 h-6 rounded-lg bg-[#8b5cf6]/60 backdrop-blur-sm flex items-center justify-center hover:bg-[#8b5cf6]/80 transition-colors"
                    title="Edit & Regenerate"
                  >
                    <RefreshCw className="w-3 h-3 text-white" />
                  </button>
                )}
              </div>
            </div>
          </>
        ) : status === 'running' ? (
          <div className="flex flex-col items-center gap-2">
            <div className="relative">
              <div className="w-10 h-10 rounded-full border-2 border-[#8b5cf6]/30 border-t-[#8b5cf6] animate-spin" />
              <Loader2 className="w-5 h-5 text-[#a78bfa] absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
            </div>
            <span className="text-xs text-[#a78bfa] font-medium">Generating...</span>
          </div>
        ) : status === 'error' ? (
          <div className="flex flex-col items-center gap-1 px-2">
            <div className="w-6 h-6 rounded-full bg-[#ef4444]/20 flex items-center justify-center">
              <AlertCircle className="w-4 h-4 text-[#ef4444]" />
            </div>
            <span className="text-[10px] text-[#ef4444] text-center line-clamp-1">{error || 'Failed'}</span>
            {/* Action buttons in error state - compact layout */}
            <div className="flex gap-1 justify-center">
              {onUpload && (
                <button
                  onClick={handleUploadClick}
                  className="px-1.5 py-0.5 rounded bg-[#34d399]/80 hover:bg-[#34d399] text-white text-[10px] transition-all flex items-center gap-0.5"
                >
                  <Upload className="w-2.5 h-2.5" />
                  Upload
                </button>
              )}
              {(onRegenerateWithModel || onRegenerate) && (
                <button
                  onClick={handleRegenerateClick}
                  className="px-1.5 py-0.5 rounded bg-[#8b5cf6]/80 hover:bg-[#8b5cf6] text-white text-[10px] transition-all flex items-center gap-0.5"
                >
                  <RefreshCw className="w-2.5 h-2.5" />
                  Retry
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <div className="w-10 h-10 rounded-full bg-[#2a2a2a] border border-[#4A90E2]/30 flex items-center justify-center">
              <User className="w-5 h-5 text-[#888888]" />
            </div>
            <span className="text-xs text-[#888888]">Waiting</span>
          </div>
        )}
      </div>

      {/* Character name */}
      <div className="px-2 py-2 bg-[#1a1a1a] border-t border-[#4A90E2]/20">
        <div className="text-xs font-medium text-[#e0e0e0] truncate text-center">
          {characterName || label}
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

// Custom comparison function for memo - compare data fields that affect rendering
function arePropsEqual(prevProps: NodeProps<CharacterNodeData>, nextProps: NodeProps<CharacterNodeData>) {
  return (
    prevProps.data.status === nextProps.data.status &&
    prevProps.data.imageUrl === nextProps.data.imageUrl &&
    prevProps.data.error === nextProps.data.error &&
    prevProps.data.label === nextProps.data.label &&
    prevProps.data.prompt === nextProps.data.prompt &&
    prevProps.data.characterName === nextProps.data.characterName &&
    prevProps.data.description === nextProps.data.description
  );
}

export default memo(CharacterNode, arePropsEqual);
