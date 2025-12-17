import { NextRequest, NextResponse } from 'next/server';
import { hashApiKey, supabaseServer } from '../../tasks/config';

const API_BASE_URL = 'https://gptproto.com';
const GEMINI_PRO_URL = `${API_BASE_URL}/v1beta/models/gemini-3-pro-preview:generateContent`;

// 脚本输出格式要求
const SCRIPT_OUTPUT_FORMAT = `

---

# Output Format Requirements (Must Follow Strictly)

Please output the result strictly in the following JSON format:

\`\`\`json
{
  "characters": [
    {
      "name": "Character Name",
      "RoleimagePrompt": "Reference Image Prompt"
    }
  ],
  "scenes": [
    {
      "id": 1,
      "imagePrompt": "Image Prompt",
      "videoPrompt": "Video Prompt"
    }
  ]
}
\`\`\`

**Important**: Output must be valid JSON format.
`;

// 获取 MIME 类型
function getMimeType(url: string): string {
  const ext = url.toLowerCase().split('.').pop()?.split('?')[0];
  const mimeTypes: Record<string, string> = {
    mp4: 'video/mp4',
    avi: 'video/x-msvideo',
    mov: 'video/quicktime',
    webm: 'video/webm',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
  };
  return mimeTypes[ext || ''] || 'video/mp4';
}

// 清理 markdown 代码块
function cleanMarkdownCodeBlock(text: string): string {
  let cleaned = text.trim();
  // Remove ```json and ``` markers
  if (cleaned.startsWith('```json')) {
    cleaned = cleaned.slice(7);
  } else if (cleaned.startsWith('```')) {
    cleaned = cleaned.slice(3);
  }
  if (cleaned.endsWith('```')) {
    cleaned = cleaned.slice(0, -3);
  }
  return cleaned.trim();
}

interface ScriptData {
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

// POST /api/workflow/start - 启动视频工作流
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      apiKey,
      title,
      videoUrl,
      scriptPrompt,
      selectedModel,
      videoGenerationMode,
      imageSize,
      scriptData,
      chatMessages,
    } = body;

    if (!apiKey) {
      return NextResponse.json({ success: false, error: 'API Key is required' }, { status: 401 });
    }

    // 如果没有提供脚本数据，则需要视频URL
    if (!scriptData && !videoUrl) {
      return NextResponse.json({ success: false, error: 'Video URL or script data is required' }, { status: 400 });
    }

    const userApiKey = hashApiKey(apiKey);

    // 根据是否有脚本数据决定起始阶段
    const initialStage = scriptData ? 'characters' : 'script';

    // 预处理脚本数据
    let initialCharacters: Array<{ id: string; name: string; description: string; imagePrompt: string; status: string }> = [];
    let initialScenes: Array<{ id: number; imagePrompt: string; videoPrompt: string; imageStatus: string }> = [];

    if (scriptData) {
      initialCharacters = scriptData.characters.map((c: ScriptData['characters'][0], i: number) => ({
        id: `char-${i}`,
        name: c.name,
        description: c.description || '',
        imagePrompt: c.imagePrompt || c.RoleimagePrompt || '',
        status: 'pending',
      }));

      initialScenes = scriptData.scenes.map((s: ScriptData['scenes'][0]) => ({
        id: s.id,
        imagePrompt: s.imagePrompt,
        videoPrompt: s.videoPrompt || '',
        imageStatus: 'pending',
      }));
    }

    // 创建工作流历史记录
    const { data: history, error: historyError } = await supabaseServer
      .from('workflow_histories')
      .insert({
        user_api_key: userApiKey,
        title: title || `Workflow ${new Date().toLocaleString()}`,
        type: 'workflow',
        mode: videoGenerationMode || 'i2v',
        image_size: imageSize || '1K', // TODO: change to 1K
        status: 'running',
        video_url: videoUrl || '',
        // 工作流配置
        workflow_config: {
          scriptPrompt,
          selectedModel,
          videoGenerationMode,
          imageSize,
          hasScriptData: !!scriptData,
        },
        // 工作流阶段
        workflow_stage: initialStage,
        // 数据字段初始化
        script_result: scriptData ? JSON.stringify(scriptData) : null,
        characters: initialCharacters,
        scenes: initialScenes,
        videos: [],
        merged_video_url: null,
        // 聊天记录
        chat_messages: chatMessages || [],
      })
      .select('id')
      .single();

    if (historyError || !history) {
      throw new Error(`Failed to create workflow: ${historyError?.message}`);
    }

    // 启动后台工作流处理
    processWorkflowInBackground(history.id, apiKey, {
      videoUrl,
      scriptPrompt,
      selectedModel,
      videoGenerationMode,
      imageSize,
      scriptData,
    }).catch(err => console.error('[Workflow] Background error:', err));

    return NextResponse.json({
      success: true,
      historyId: history.id,
    });

  } catch (error) {
    const err = error as Error;
    console.error('Start workflow error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

// 后台处理工作流 - 手动模式：每个阶段完成后暂停等待用户继续
async function processWorkflowInBackground(
  historyId: number,
  apiKey: string,
  config: {
    videoUrl: string;
    scriptPrompt?: string;
    selectedModel?: string;
    videoGenerationMode?: string;
    imageSize?: string;
    scriptData?: ScriptData;
  }
) {
  const API_BASE_URL = 'https://gptproto.com';

  try {
    console.log(`[Workflow ${historyId}] Starting (manual mode)...`);

    // 检查是否被停止
    const checkStopped = async () => {
      const { data } = await supabaseServer
        .from('workflow_histories')
        .select('status')
        .eq('id', historyId)
        .single();
      return data?.status === 'stopped';
    };

    // 更新工作流阶段
    const updateStage = async (stage: string, data?: Record<string, unknown>) => {
      await supabaseServer
        .from('workflow_histories')
        .update({ workflow_stage: stage, ...data })
        .eq('id', historyId);
    };

    // 设置为等待用户继续状态
    const setWaiting = async (stage: string, data?: Record<string, unknown>) => {
      await supabaseServer
        .from('workflow_histories')
        .update({ status: 'waiting', workflow_stage: stage, ...data })
        .eq('id', historyId);
    };

    let characters: Array<{ id: string; name: string; description: string; imagePrompt: string; status: string; imageUrl?: string; error?: string }>;
    let scenes: Array<{ id: number; imagePrompt: string; videoPrompt: string; imageStatus: string; imageUrl?: string; error?: string }>;

    // 如果已有脚本数据，跳过生成和解析步骤
    if (config.scriptData) {
      console.log(`[Workflow ${historyId}] Using provided script data, skipping generation`);

      characters = config.scriptData.characters.map((c, i) => ({
        id: `char-${i}`,
        name: c.name,
        description: c.description || '',
        imagePrompt: c.imagePrompt || c.RoleimagePrompt || '',
        status: 'pending',
      }));

      scenes = config.scriptData.scenes.map((s) => ({
        id: s.id,
        imagePrompt: s.imagePrompt,
        videoPrompt: s.videoPrompt || '',
        imageStatus: 'pending',
      }));

      // 脚本数据就绪，等待用户继续到角色生成
      await setWaiting('script_done', { characters, scenes, script_result: JSON.stringify(config.scriptData) });
      console.log(`[Workflow ${historyId}] Script data ready, waiting for continue`);
      return; // 暂停，等待用户点击继续
    } else {
      // ========== 1. 生成脚本 ==========
      console.log(`[Workflow ${historyId}] Stage: script`);
      await updateStage('script');

      if (await checkStopped()) return;

      // 使用 Gemini Pro API 生成脚本（与前端相同的格式）
      const mimeType = getMimeType(config.videoUrl);
      const fullPrompt = (config.scriptPrompt || '') + SCRIPT_OUTPUT_FORMAT;

      const scriptResponse = await fetch(GEMINI_PRO_URL, {
        method: 'POST',
        headers: {
          'Authorization': apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [
                { text: fullPrompt },
                { file_data: { mime_type: mimeType, file_uri: config.videoUrl } },
              ],
            },
          ],
        }),
      });

      const scriptResponseData = await scriptResponse.json();

      if (!scriptResponse.ok) {
        const errorMsg = scriptResponseData.error?.message || `Request failed: ${scriptResponse.status}`;
        console.error(`[Workflow ${historyId}] Script generation failed:`, errorMsg);
        throw new Error(`Failed to generate script: ${errorMsg}`);
      }

      const scriptResult = scriptResponseData.candidates?.[0]?.content?.parts?.[0]?.text || '';
      console.log(`[Workflow ${historyId}] Script generated, length: ${scriptResult.length}`);

      await updateStage('script_done', { script_result: scriptResult });

      if (await checkStopped()) return;

      // ========== 2. 解析脚本提取角色和场景 ==========
      console.log(`[Workflow ${historyId}] Stage: parsing`);
      await updateStage('parsing');

      // 直接解析脚本 JSON
      try {
        const cleanedScript = cleanMarkdownCodeBlock(scriptResult);
        const parsedData = JSON.parse(cleanedScript);

        characters = (parsedData.characters || []).map((c: { name: string; description?: string; imagePrompt?: string; RoleimagePrompt?: string }, i: number) => ({
          id: `char-${i}`,
          name: c.name,
          description: c.description || '',
          imagePrompt: c.imagePrompt || c.RoleimagePrompt || '',
          status: 'pending',
        }));

        scenes = (parsedData.scenes || []).map((s: { id?: number; imagePrompt: string; videoPrompt?: string }, i: number) => ({
          id: s.id || i + 1,
          imagePrompt: s.imagePrompt,
          videoPrompt: s.videoPrompt || '',
          imageStatus: 'pending',
        }));

        console.log(`[Workflow ${historyId}] Parsed: ${characters.length} characters, ${scenes.length} scenes`);
      } catch (parseError) {
        console.error(`[Workflow ${historyId}] Failed to parse script JSON:`, parseError);
        throw new Error('Failed to parse script: Invalid JSON format');
      }

      // 脚本解析完成，等待用户继续到角色生成
      await setWaiting('parsing_done', { characters, scenes });
      console.log(`[Workflow ${historyId}] Parsed: ${characters.length} characters, ${scenes.length} scenes, waiting for continue`);
      return; // 暂停，等待用户点击继续
    }
  } catch (error) {
    console.error(`[Workflow ${historyId}] Error:`, error);

    await supabaseServer
      .from('workflow_histories')
      .update({
        status: 'failed',
        workflow_stage: 'error',
      })
      .eq('id', historyId);
  }
}
