'use client';

import { Navbar } from '@/components/layout';
import {
  ControlPanel,
  PreviewModal,
  WorkflowCanvas,
} from '@/components/workflow';
import { ApiKeyDialog } from '@/components/workflow/ApiKeyDialog';
import { useApiKey } from '@/hooks/useApiKey';
import { useWorkflow } from '@/hooks/useWorkflow';
import { useBackgroundWorkflow } from '@/hooks/useBackgroundWorkflow';
import { updateWorkflowHistoryFull, type ChatMessageData } from '@/hooks/useHistoryDB';
import { useEffect, useState, useRef, useCallback } from 'react';
import type { ChatMessage } from '@/components/workflow/ScriptChatBox';
import type { AgentAction } from '@/components/workflow/ControlPanel';

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

export default function WorkflowPage() {
  const {
    videoUrl,
    setVideoUrl,
    nodes,
    edges,
    onNodesChange,
    onEdgesChange,
    previewContent,
    closePreview,
    resetWorkflow,
    handleVideoUpload,
    loadFromHistory,
    updateInputNodeWithVideo,
    handlePreview,
    scriptPrompt,
    selectedModel,
    videoGenerationMode,
    imageSize,
  } = useWorkflow();

  // 后台工作流
  const {
    isRunning,
    isWaiting,
    workflow: backgroundWorkflow,
    startWorkflow: startBackgroundWorkflow,
    stopWorkflow: stopBackgroundWorkflow,
    continueWorkflow: continueBackgroundWorkflow,
    restoreWorkflow: restoreBackgroundWorkflow,
    retryVideo: retryBackgroundVideo,
    retryCharacter: retryBackgroundCharacter,
    retryScene: retryBackgroundScene,
    retryMerge: retryBackgroundMerge,
    uploadCharacter: uploadBackgroundCharacter,
    updateScript: updateBackgroundScript,
    addCharacter: addBackgroundCharacter,
    addScene: addBackgroundScene,
    reorderCharacter: reorderBackgroundCharacter,
    reorderScene: reorderBackgroundScene,
    deleteCharacter: deleteBackgroundCharacter,
    deleteScene: deleteBackgroundScene,
    // Client-side generation methods
    generateCharacters: generateBackgroundCharacters,
    generateScenes: generateBackgroundScenes,
    generateVideos: generateBackgroundVideos,
    // Batch regenerate methods
    batchRegenerateCharacters: batchRegenerateBackgroundCharacters,
    batchRegenerateScenes: batchRegenerateBackgroundScenes,
    // Auto-resume
    resumePendingTasks,
  } = useBackgroundWorkflow();

  const { apiKey, setApiKey, hasApiKey, isLoaded } = useApiKey();
  const [showApiKeyDialog, setShowApiKeyDialog] = useState(false);
  const [appliedScript, setAppliedScript] = useState<ScriptJson | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const hasCheckedRunningWorkflow = useRef(false);
  // 跟踪上次同步的 workflow 数据签名，避免重复同步
  const lastSyncedWorkflowRef = useRef<string>('');

  // 更新聊天记录并保存到数据库
  const handleChatMessagesChange = useCallback((messages: ChatMessage[]) => {
    setChatMessages(messages);
    // 转换为数据库格式并保存
    if (backgroundWorkflow?.id) {
      const dbMessages: ChatMessageData[] = messages.map(m => ({
        id: m.id,
        role: m.role,
        content: m.content,
        timestamp: m.timestamp.toISOString(),
        scriptData: m.scriptData,
        stageNotification: m.stageNotification,
        suggestedPrompt: m.suggestedPrompt,
      }));
      updateWorkflowHistoryFull(backgroundWorkflow.id, { chatMessages: dbMessages });
    }
  }, [backgroundWorkflow?.id]);

  // 跟踪是否已恢复聊天记录（按工作流 ID）
  const chatRestoredForWorkflowRef = useRef<number | undefined>(undefined);

  // 当工作流 ID 变化时，恢复聊天记录（只在 ID 首次出现且有数据时执行）
  useEffect(() => {
    // 只在工作流 ID 变化时处理
    if (!backgroundWorkflow?.id) return;

    // 如果已经恢复过这个工作流的聊天记录，跳过
    if (chatRestoredForWorkflowRef.current === backgroundWorkflow.id) return;

    // 如果有聊天记录数据，恢复它们
    if (backgroundWorkflow.chatMessages && backgroundWorkflow.chatMessages.length > 0) {
      const restoredMessages: ChatMessage[] = backgroundWorkflow.chatMessages.map(m => ({
        id: m.id,
        role: m.role,
        content: m.content,
        timestamp: new Date(m.timestamp),
        scriptData: m.scriptData as ChatMessage['scriptData'],
        stageNotification: m.stageNotification as ChatMessage['stageNotification'],
        suggestedPrompt: m.suggestedPrompt as ChatMessage['suggestedPrompt'],
      }));
      setChatMessages(restoredMessages);
      chatRestoredForWorkflowRef.current = backgroundWorkflow.id;
    } else {
      // 没有聊天记录，但仍然标记为已恢复（空记录也算恢复了）
      chatRestoredForWorkflowRef.current = backgroundWorkflow.id;
    }
  }, [backgroundWorkflow?.id]); // 只依赖 ID

  // 跟踪上一次的 stage，用于检测 stage 变化
  const lastStageRef = useRef<string | undefined>(undefined);

  // 当工作流阶段变化时，添加提示消息
  useEffect(() => {
    if (!backgroundWorkflow?.stage) return;

    const currentStage = backgroundWorkflow.stage;
    const lastStage = lastStageRef.current;

    // 如果 stage 没有变化，跳过
    if (currentStage === lastStage) return;

    // 更新 lastStage
    lastStageRef.current = currentStage;

    // 根据 stage 添加不同的提示消息（带有阶段通知卡片）
    let stageNotification: ChatMessage['stageNotification'] | undefined;

    if ((currentStage === 'script_done' || currentStage === 'parsing_done') &&
        lastStage !== 'script_done' && lastStage !== 'parsing_done') {
      stageNotification = {
        stage: 'script_done',
        title: 'Script Generated',
        description: 'The script has been generated successfully. You can now generate character reference images.',
        actionLabel: 'Generate Characters',
      };
    } else if (currentStage === 'characters_done' && lastStage !== 'characters_done') {
      stageNotification = {
        stage: 'characters_done',
        title: 'Character References Generated',
        description: 'All character reference images have been generated successfully. You can now proceed to generate scene images.',
        actionLabel: 'Generate Scenes',
      };
    } else if (currentStage === 'scenes_done' && lastStage !== 'scenes_done') {
      stageNotification = {
        stage: 'scenes_done',
        title: 'Scene Images Generated',
        description: 'All storyboard scene images have been generated successfully. You can now proceed to generate videos.',
        actionLabel: 'Generate Videos',
      };
    } else if (currentStage === 'videos_done' && lastStage !== 'videos_done') {
      stageNotification = {
        stage: 'videos_done',
        title: 'Videos Generated',
        description: 'All videos have been generated successfully. You can now merge them into the final output.',
        actionLabel: 'Merge Videos',
      };
    }

    // 如果有阶段通知要添加
    if (stageNotification) {
      const newMessage: ChatMessage = {
        id: `system-${Date.now()}`,
        role: 'assistant',
        content: '',  // 内容为空，由 stageNotification 卡片来显示
        timestamp: new Date(),
        stageNotification,
      };
      setChatMessages(prev => [...prev, newMessage]);
    }
  }, [backgroundWorkflow?.stage]);

  // When videoUrl changes, update input node to video preview node
  useEffect(() => {
    updateInputNodeWithVideo(videoUrl);
  }, [videoUrl, updateInputNodeWithVideo]);

  // Check for running workflow on page load
  useEffect(() => {
    if (isLoaded && hasApiKey && !hasCheckedRunningWorkflow.current) {
      hasCheckedRunningWorkflow.current = true;
      // restoreBackgroundWorkflow 会调用 fetchStatus，fetchStatus 会自动检测并恢复正在生成的任务
      restoreBackgroundWorkflow();
    }
  }, [isLoaded, hasApiKey, restoreBackgroundWorkflow]);

  // Start 按钮点击 - 检查是否有已应用的脚本
  const handleRunWorkflow = () => {
    if (!hasApiKey) {
      setShowApiKeyDialog(true);
      return;
    }

    // 清空之前的内容
    setChatMessages([]);
    chatRestoredForWorkflowRef.current = undefined; // 重置聊天记录恢复标记
    resetWorkflow();

    // 保存当前 appliedScript 用于启动（如果有）
    const scriptToUse = appliedScript;
    setAppliedScript(null); // 立即清除

    // 如果有已应用的脚本，使用脚本数据启动
    if (scriptToUse) {
      startBackgroundWorkflow({
        videoUrl,
        title: `Workflow ${new Date().toLocaleString()}`,
        scriptPrompt,
        selectedModel,
        videoGenerationMode,
        imageSize,
        scriptData: scriptToUse,
      });
    } else {
      // 否则从视频生成脚本
      startBackgroundWorkflow({
        videoUrl,
        title: `Workflow ${new Date().toLocaleString()}`,
        scriptPrompt,
        selectedModel,
        videoGenerationMode,
        imageSize,
      });
    }
  };

  const handleStopWorkflow = () => {
    stopBackgroundWorkflow();
  };

  // Reset workflow - 重置工作流，清空所有状态
  const handleResetWorkflow = () => {
    stopBackgroundWorkflow(); // 清空后台工作流状态（historyId, workflow 等）
    resetWorkflow(); // 清空画布上的节点和本地状态
    setChatMessages([]); // 清空聊天记录
    chatRestoredForWorkflowRef.current = undefined; // 重置聊天记录恢复标记
    setAppliedScript(null); // 清空已应用的脚本
    setVideoUrl(''); // 清空输入视频
  };

  // Continue to next step - uses client-side generation based on current stage
  const handleContinueWorkflow = useCallback(() => {
    const stage = backgroundWorkflow?.stage;

    if (stage === 'script_done' || stage === 'parsing_done' || stage === 'characters_done') {
      // Generate characters or scenes
      if (stage === 'characters_done') {
        generateBackgroundScenes();
      } else {
        generateBackgroundCharacters();
      }
    } else if (stage === 'scenes_done') {
      // Generate videos
      generateBackgroundVideos();
    } else if (stage === 'videos_done') {
      // Merge videos
      retryBackgroundMerge();
    } else {
      // Fallback to server-side continue for other stages
      continueBackgroundWorkflow();
    }
  }, [backgroundWorkflow?.stage, generateBackgroundCharacters, generateBackgroundScenes, generateBackgroundVideos, retryBackgroundMerge, continueBackgroundWorkflow]);

  // 使用脚本数据启动工作流 (自动模式)
  const handleRunWithScript = (script: ScriptJson) => {
    if (!hasApiKey) {
      setShowApiKeyDialog(true);
      return;
    }

    // 清空之前的内容
    setChatMessages([]);
    chatRestoredForWorkflowRef.current = undefined; // 重置聊天记录恢复标记
    resetWorkflow();

    startBackgroundWorkflow({
      videoUrl,
      title: `Workflow ${new Date().toLocaleString()}`,
      scriptPrompt,
      selectedModel,
      videoGenerationMode,
      imageSize,
      scriptData: script,
    });
    setAppliedScript(null);
  };

  // 应用脚本（不自动启动生成）
  const handleApplyScript = async (script: ScriptJson | null) => {
    if (!script) {
      setAppliedScript(null);
      return;
    }

    if (!hasApiKey) {
      setShowApiKeyDialog(true);
      return;
    }

    // 如果已有工作流在运行，更新脚本
    if (backgroundWorkflow?.id) {
      setAppliedScript(script);
      // 只更新后台工作流状态，UI 更新由 useEffect 中的 loadFromHistory 统一处理
      await updateBackgroundScript(script);
    } else {
      // 没有工作流运行，直接用脚本数据启动新工作流（只创建记录，不生成）
      chatRestoredForWorkflowRef.current = undefined;
      resetWorkflow();
      // 不清空聊天记录，保留 AI Script Generator 的对话
      // 将当前聊天记录转换为数据库格式并传递给工作流
      const chatMessagesForDb = chatMessages.map(m => ({
        id: m.id,
        role: m.role,
        content: m.content,
        timestamp: m.timestamp.toISOString(),
        scriptData: m.scriptData,
        stageNotification: m.stageNotification,
        suggestedPrompt: m.suggestedPrompt,
      }));

      await startBackgroundWorkflow({
        videoUrl,
        title: `Workflow ${new Date().toLocaleString()}`,
        scriptData: script,
        chatMessages: chatMessagesForDb,
      });
      setAppliedScript(null);
    }
  };

  // 手动启动角色生成（点击 Generate Characters 按钮）
  const handleGenerateCharacters = useCallback(() => {
    generateBackgroundCharacters();
    // 不再自动触发分镜生成，让用户手动控制
  }, [generateBackgroundCharacters]);

  // 处理 Agent 操作
  const handleAgentAction = useCallback((action: AgentAction) => {
    switch (action.type) {
      case 'regenerate_character':
        retryBackgroundCharacter(action.index);
        break;
      case 'regenerate_scene':
        retryBackgroundScene(action.index);
        break;
      case 'update_character_prompt':
        if (action.prompt !== undefined) {
          retryBackgroundCharacter(action.index, action.prompt);
        }
        break;
      case 'update_scene_prompt':
        if (action.prompt !== undefined) {
          // 传递 videoPrompt（如果有的话）
          retryBackgroundScene(action.index, action.prompt, action.videoPrompt);
        }
        break;
      case 'add_character':
        if (action.prompt !== undefined && action.name !== undefined) {
          // action.index 用作 insertAfter 位置
          addBackgroundCharacter(action.name, action.prompt, action.index);
        }
        break;
      case 'add_scene':
        if (action.prompt !== undefined) {
          // action.index 用作 insertAfter 位置，传递 videoPrompt（如果有的话）
          addBackgroundScene(action.prompt, action.videoPrompt, action.index);
        }
        break;
      case 'reorder_character':
        if (action.toIndex !== undefined) {
          reorderBackgroundCharacter(action.index, action.toIndex);
        }
        break;
      case 'reorder_scene':
        if (action.toIndex !== undefined) {
          reorderBackgroundScene(action.index, action.toIndex);
        }
        break;
      case 'delete_character':
        deleteBackgroundCharacter(action.index);
        break;
      case 'delete_scene':
        deleteBackgroundScene(action.index);
        break;
    }
  }, [retryBackgroundCharacter, retryBackgroundScene, addBackgroundCharacter, addBackgroundScene, reorderBackgroundCharacter, reorderBackgroundScene, deleteBackgroundCharacter, deleteBackgroundScene]);

  // Check if there's history data to load
  useEffect(() => {
    const historyDataStr = sessionStorage.getItem('loadHistoryData');
    if (historyDataStr) {
      try {
        const historyData = JSON.parse(historyDataStr);
        loadFromHistory(historyData);
        sessionStorage.removeItem('loadHistoryData');
      } catch (error) {
        console.error('Failed to load history data:', error);
      }
    }
  }, [loadFromHistory]);

  // 后台工作流数据同步到画布
  useEffect(() => {
    if (!backgroundWorkflow) return;

    // 创建数据签名，只比较关键数据（不包括回调函数）
    const workflowSignature = JSON.stringify({
      id: backgroundWorkflow.id,
      videoUrl: backgroundWorkflow.videoUrl,
      scriptResult: backgroundWorkflow.scriptResult,
      characters: backgroundWorkflow.characters.map(c => ({
        name: c.name,
        imagePrompt: c.imagePrompt,
        imageUrl: c.imageUrl,
        status: c.status,
      })),
      scenes: backgroundWorkflow.scenes.map(s => ({
        id: s.id,
        imagePrompt: s.imagePrompt,
        imageUrl: s.imageUrl,
        imageStatus: s.imageStatus,
      })),
      videos: backgroundWorkflow.videos.map(v => ({
        id: v.id,
        videoUrl: v.videoUrl,
        status: v.status,
      })),
      mergedVideoUrl: backgroundWorkflow.mergedVideoUrl,
      status: backgroundWorkflow.status,
      stage: backgroundWorkflow.stage,
    });

    // 如果数据没有变化，跳过同步
    if (lastSyncedWorkflowRef.current === workflowSignature) {
      return;
    }

    console.log('[PageSync] Workflow data changed, syncing to canvas...');
    console.log('[PageSync] Characters:', backgroundWorkflow.characters.map(c => ({
      name: c.name,
      status: c.status,
      hasImageUrl: !!c.imageUrl,
    })));
    console.log('[PageSync] Scenes:', backgroundWorkflow.scenes.map(s => ({
      id: s.id,
      imageStatus: s.imageStatus,
      hasImageUrl: !!s.imageUrl,
    })));

    lastSyncedWorkflowRef.current = workflowSignature;

    loadFromHistory({
      historyId: backgroundWorkflow.id, // Pass history ID for database sync
      videoUrl: backgroundWorkflow.videoUrl,
      scriptResult: backgroundWorkflow.scriptResult,
      characters: backgroundWorkflow.characters.map(c => ({
        ...c,
        description: c.description || '',
        status: c.status as 'pending' | 'generating' | 'uploading' | 'done' | 'error',
      })),
      scenes: backgroundWorkflow.scenes.map(s => ({
        ...s,
        videoPrompt: s.videoPrompt || '',
        imageStatus: s.imageStatus as 'pending' | 'generating' | 'done' | 'error',
        videoStatus: 'pending' as const,
      })),
      videos: backgroundWorkflow.videos.map(v => ({
        ...v,
        status: v.status as 'pending' | 'submitting' | 'polling' | 'done' | 'error',
      })),
      mergedVideoUrl: backgroundWorkflow.mergedVideoUrl,
      // Pass workflow status info for proper state handling
      workflowStatus: backgroundWorkflow.status,
      workflowStage: backgroundWorkflow.stage,
      // Pass retry callbacks for background workflow
      onRetryVideo: retryBackgroundVideo,
      onRetryVideoWithModel: retryBackgroundVideo,
      onRetryCharacter: retryBackgroundCharacter,
      onRetryCharacterWithModel: retryBackgroundCharacter,
      onRetryScene: retryBackgroundScene,
      onRetrySceneWithModel: retryBackgroundScene,
      onRetryMerge: retryBackgroundMerge,
      onUploadCharacter: uploadBackgroundCharacter,
      onSaveScript: updateBackgroundScript,
      // Pass batch regenerate callbacks for background workflow
      onBatchRegenerateCharacters: batchRegenerateBackgroundCharacters,
      onBatchRegenerateScenes: batchRegenerateBackgroundScenes,
    });
    // 聊天记录由专门的 effect 处理，避免重复覆盖
  }, [backgroundWorkflow, loadFromHistory, retryBackgroundVideo, retryBackgroundCharacter, retryBackgroundScene, retryBackgroundMerge, uploadBackgroundCharacter, updateBackgroundScript, batchRegenerateBackgroundCharacters, batchRegenerateBackgroundScenes]);

  // Wait for API Key loading
  if (!isLoaded) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="text-zinc-500 text-sm">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950">
      {/* Navigation bar */}
      <Navbar hasApiKey={hasApiKey} onApiKeyClick={() => setShowApiKeyDialog(true)} />

      {/* Main Content */}
      <main className="px-6 py-4 flex gap-4 h-[calc(100vh-57px)]">
        {/* Left Content - Workflow Canvas */}
        <div className="flex-1 flex flex-col min-w-0">
          <div className="flex-1 min-h-0 rounded-lg border border-zinc-800 bg-zinc-900/50 overflow-hidden">
            <WorkflowCanvas
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
            />
          </div>
        </div>

        {/* Right Sidebar - Control Panel */}
        <div className="w-[420px] shrink-0">
          <ControlPanel
            videoUrl={videoUrl}
            onVideoUrlChange={setVideoUrl}
            isRunning={isRunning}
            isWaiting={isWaiting}
            onStop={handleStopWorkflow}
            onReset={handleResetWorkflow}
            onGenerateVideos={generateBackgroundVideos}
            onMergeVideos={retryBackgroundMerge}
            onUpload={handleVideoUpload}
            backgroundStatus={backgroundWorkflow?.status}
            currentStage={backgroundWorkflow?.stage}
            onApplyScript={handleApplyScript}
            workflowVideos={backgroundWorkflow?.videos}
            chatMessages={chatMessages}
            onChatMessagesChange={handleChatMessagesChange}
            onAgentAction={handleAgentAction}
            characters={backgroundWorkflow?.characters?.map(c => ({
              name: c.name,
              imagePrompt: c.imagePrompt,
              imageUrl: c.imageUrl,
            }))}
            scenes={backgroundWorkflow?.scenes?.map(s => ({
              id: s.id,
              imagePrompt: s.imagePrompt,
              imageUrl: s.imageUrl,
            }))}
            onPreview={handlePreview}
            onGenerateCharacters={handleGenerateCharacters}
            onGenerateScenes={generateBackgroundScenes}
            onBatchRegenerateCharacters={batchRegenerateBackgroundCharacters}
            onBatchRegenerateScenes={batchRegenerateBackgroundScenes}
          />
        </div>
      </main>

      {/* Preview Modal */}
      <PreviewModal content={previewContent} onClose={closePreview} />

      {/* API Key Dialog */}
      <ApiKeyDialog
        isOpen={showApiKeyDialog}
        onClose={() => setShowApiKeyDialog(false)}
        apiKey={apiKey}
        onSave={setApiKey}
      />
    </div>
  );
}
