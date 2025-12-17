// Workflow stage
export type WorkflowStage = 'idle' | 'script' | 'characters' | 'images' | 'videos' | 'merging' | 'completed' | 'error';

// Node status
export type NodeStatus = 'pending' | 'running' | 'success' | 'error';

// Script parsing result
export interface ScriptResult {
  characters: CharacterItem[];
  scenes: SceneItem[];
}

// Character item
export interface CharacterItem {
  id: string;
  name: string;
  description: string;
  imagePrompt: string;
  imageUrl?: string;
  ossUrl?: string;
  status: 'pending' | 'generating' | 'uploading' | 'done' | 'error';
  error?: string;
}

// Scene item
export interface SceneItem {
  id: number;
  imagePrompt: string;
  videoPrompt: string;
  imageUrl?: string;
  ossUrl?: string;
  imageStatus: 'pending' | 'generating' | 'uploading' | 'done' | 'error';
  videoUrl?: string;
  videoTaskId?: string;
  videoStatus: 'pending' | 'submitting' | 'polling' | 'done' | 'error';
  error?: string;
}

// Image item (kept for compatibility)
export interface ImageItem {
  id: string;
  index: number;
  prompt: string;
  imageUrl?: string;
  ossUrl?: string;
  status: 'pending' | 'generating' | 'uploading' | 'done' | 'error';
  error?: string;
}

// Video model ID type
export type VideoModelId = 'seedance' | 'hailuo' | 'wan' | 'sora-2-pro';

// Image generation model ID type (Text to Image)
export type ImageTextToImageModelId = 'gemini' | 'seedream' | 'wan-t2i';

// Image edit model ID type (Image to Edit)
export type ImageEditModelId = 'gemini-edit' | 'seedream-edit' | 'wan-edit';

// Video generation mode
export type VideoGenerationMode = 'first-last-frame' | 'single-image';

// Image size type
export type ImageSizeId = '1K' | '2K' | '4K';

// Video item
export interface VideoItem {
  id: string;
  index: number;
  prompt: string;
  firstFrame: string;
  lastFrame?: string;  // Last frame is optional, last video may not have a last frame
  videoUrl?: string;
  taskId?: string;
  status: 'pending' | 'submitting' | 'polling' | 'done' | 'error';
  error?: string;
  model?: VideoModelId;  // Video model used
}

// Workflow log
export interface WorkflowLog {
  time: string;
  type: 'info' | 'success' | 'error' | 'warning';
  message: string;
}

// Preview content
export interface PreviewContent {
  type: 'image' | 'video' | 'text';
  url?: string;
  text?: string;
  title: string;
  prompt?: string;
  editable?: boolean;  // Whether editable (script analysis result)
  onSaveText?: (text: string) => void;  // Save edited text
}

// React Flow node data - base
export interface WorkflowNodeData {
  label: string;
  icon?: React.ReactNode;
  description?: string;
  status: NodeStatus;
  nodeType: 'main' | 'small';
  onPreview?: (content: PreviewContent) => void;
  previewData?: {
    type: 'text';
    text: string;
    title: string;
    editable?: boolean;
    onSaveText?: (text: string) => void;
  };
  onBatchRegenerate?: () => void;  // Batch regenerate callback
  onAddScene?: () => void;  // Add scene callback (for scenes node)
}

// Image node data
export interface ImageNodeData {
  label: string;
  status: NodeStatus;
  imageUrl?: string;
  prompt?: string;
  error?: string;
  canRegenerate?: boolean;
  onPreview?: (content: PreviewContent) => void;
  onRegenerate?: () => void;
  onEditPrompt?: (prompt: string) => void;
  onUpload?: (file: File) => void;
  onRegenerateWithModel?: (modelId: ImageEditModelId, size?: string, aspectRatio?: string) => void;
}

// Character node data
export interface CharacterNodeData {
  label: string;
  status: NodeStatus;
  imageUrl?: string;
  prompt?: string;
  characterName?: string;
  description?: string;
  error?: string;
  onPreview?: (content: PreviewContent) => void;
  onRegenerate?: () => void;
  onEditPrompt?: (prompt: string) => void;
  onUpload?: (file: File) => void;  // Upload local image to replace
  onRegenerateWithModel?: (modelId: ImageTextToImageModelId, size?: string, aspectRatio?: string, newPrompt?: string) => void;
}

// Video node data
export interface VideoNodeData {
  label: string;
  status: NodeStatus;
  videoUrl?: string;
  thumbnailUrl?: string;
  prompt?: string;
  error?: string;
  currentModel?: VideoModelId;
  currentMode?: VideoGenerationMode;  // Current video generation mode
  currentDuration?: number;  // Current video duration (for sora-2-pro)
  isMergedVideo?: boolean;  // Whether it's a merged video (for showing download button)
  isInputVideo?: boolean;   // Whether it's an input video (only show preview, no regenerate etc.)
  onPreview?: (content: PreviewContent) => void;
  onRegenerate?: () => void;
  onEditPrompt?: (prompt: string) => void;
  onRegenerateWithModel?: (modelId: VideoModelId, mode?: VideoGenerationMode, duration?: number, newPrompt?: string) => void;
  onDownload?: () => void;
}

// Merge node data
export interface MergeNodeData {
  label: string;
  status: NodeStatus;
  videoUrl?: string;
  error?: string;
  onPreview?: (content: PreviewContent) => void;
}
