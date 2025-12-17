'use client';

import type { PreviewContent } from '@/types/workflow';
import { ScriptChatBox, type ChatMessage } from './ScriptChatBox';

interface ScriptJson {
  characters: Array<{
    name: string;
    description?: string;
    imagePrompt?: string;
    RoleimagePrompt?: string;
  }>;
  scenes: Array<{
    id: number;
    imagePrompt: string;
    videoPrompt: string;
  }>;
}

export interface AgentAction {
  type: 'update_character_prompt' | 'update_scene_prompt' | 'regenerate_character' | 'regenerate_scene' | 'add_character' | 'add_scene' | 'reorder_character' | 'reorder_scene' | 'delete_character' | 'delete_scene';
  index: number;
  prompt?: string;
  videoPrompt?: string;
  name?: string;
  toIndex?: number;
}

interface ControlPanelProps {
  videoUrl: string;
  onVideoUrlChange: (url: string) => void;
  isRunning: boolean;
  isWaiting?: boolean;
  onStop: () => void;
  onReset: () => void;
  onGenerateVideos?: () => void;
  onMergeVideos?: () => void;
  onUpload: (file: File) => Promise<string>;
  backgroundStatus?: string;
  currentStage?: string;
  onApplyScript: (script: ScriptJson | null) => void;
  workflowVideos?: Array<{
    id: string;
    index: number;
    status: string;
    error?: string;
  }>;
  chatMessages: ChatMessage[];
  onChatMessagesChange: (messages: ChatMessage[]) => void;
  onAgentAction?: (action: AgentAction) => void;
  characters?: Array<{
    name: string;
    imagePrompt?: string;
    imageUrl?: string;
  }>;
  scenes?: Array<{
    id: number;
    imagePrompt: string;
    imageUrl?: string;
  }>;
  onPreview?: (content: PreviewContent) => void;
  onGenerateCharacters?: () => void;
  onGenerateScenes?: () => void;
  onBatchRegenerateCharacters?: () => void;
  onBatchRegenerateScenes?: () => void;
}

export function ControlPanel({
  videoUrl,
  onVideoUrlChange,
  isRunning,
  isWaiting,
  onStop,
  onReset,
  onGenerateVideos,
  onMergeVideos,
  onUpload,
  backgroundStatus,
  currentStage,
  onApplyScript,
  workflowVideos,
  chatMessages,
  onChatMessagesChange,
  onAgentAction,
  characters,
  scenes,
  onPreview,
  onGenerateCharacters,
  onGenerateScenes,
  onBatchRegenerateCharacters,
  onBatchRegenerateScenes,
}: ControlPanelProps) {
  return (
    <div className="h-full rounded-lg border border-zinc-800 bg-zinc-900/50 overflow-hidden flex flex-col">
      <ScriptChatBox
        currentScript=""
        videoUrl={videoUrl}
        onVideoUrlChange={onVideoUrlChange}
        onUpload={onUpload}
        onApplyScript={(script) => {
          onApplyScript(script);
        }}
        disabled={false}
        messages={chatMessages}
        onMessagesChange={onChatMessagesChange}
        onAgentAction={onAgentAction}
        characters={characters}
        scenes={scenes}
        isRunning={isRunning}
        isWaiting={isWaiting}
        currentStage={currentStage}
        backgroundStatus={backgroundStatus}
        onGenerateVideos={onGenerateVideos}
        onMergeVideos={onMergeVideos}
        onStop={onStop}
        onReset={onReset}
        videos={workflowVideos}
        onPreview={onPreview}
        onGenerateCharacters={onGenerateCharacters}
        onGenerateScenes={onGenerateScenes}
        onBatchRegenerateCharacters={onBatchRegenerateCharacters}
        onBatchRegenerateScenes={onBatchRegenerateScenes}
      />
    </div>
  );
}
