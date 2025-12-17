import { NextResponse } from 'next/server';

const API_BASE_URL = 'https://gptproto.com';
const GEMINI_CHAT_URL = `${API_BASE_URL}/v1beta/models/gemini-3-pro-preview:generateContent`;

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface RequestBody {
  message: string;
  currentScript: string;
  history: ChatMessage[];
  videoUrl?: string;
  // 当前工作流数据，用于智能识别微调目标
  workflowData?: {
    characters: Array<{
      name: string;
      imagePrompt?: string;
    }>;
    scenes: Array<{
      id: number;
      imagePrompt: string;
    }>;
  };
}

// Get MIME type for file extension
const getMimeType = (url: string): string => {
  const ext = url.toLowerCase().split('.').pop()?.split('?')[0];
  const mimeTypes: Record<string, string> = {
    mp4: 'video/mp4',
    avi: 'video/x-msvideo',
    mov: 'video/quicktime',
    webm: 'video/webm',
  };
  return mimeTypes[ext || ''] || 'video/mp4';
};

const SYSTEM_PROMPT = `You are an AI video analysis assistant. Your job is to analyze videos and generate storyboard scripts through conversation with the user.

{VIDEO_CONTEXT}

The user's script generation guidelines:
---
{CURRENT_SCRIPT}
---

Your task:
1. Analyze the video content if provided
2. Chat with the user to understand their requirements for the storyboard
3. When the user is satisfied or asks to generate, output the final script JSON

When generating the script, output in this JSON format:
{
  "message": "Your explanation or response to the user",
  "script": {
    "characters": [
      {
        "name": "Character Name",
        "description": "Character description",
        "imagePrompt": "Detailed prompt for generating character reference image"
      }
    ],
    "scenes": [
      {
        "id": 1,
        "imagePrompt": "Detailed prompt for storyboard image",
        "videoPrompt": "Detailed prompt for video generation"
      }
    ]
  }
}

If just chatting without generating script, set "script" to null.
All prompts in the script should be in English for best AI generation results.`;

const SYSTEM_PROMPT_NO_VIDEO = `You are an AI storyboard script assistant. Your job is to help users create storyboard scripts through conversation.

No video has been provided. You can help the user:
1. Create original storyboard scripts based on their ideas
2. Refine and adjust existing script concepts
3. Generate character designs and scene descriptions

The user's script generation guidelines:
---
{CURRENT_SCRIPT}
---

When generating the script, output in this JSON format:
{
  "message": "Your explanation or response to the user",
  "script": {
    "characters": [
      {
        "name": "Character Name",
        "description": "Character description",
        "imagePrompt": "Detailed prompt for generating character reference image"
      }
    ],
    "scenes": [
      {
        "id": 1,
        "imagePrompt": "Detailed prompt for storyboard image",
        "videoPrompt": "Detailed prompt for video generation"
      }
    ]
  }
}

If just chatting without generating script, set "script" to null.
All prompts in the script should be in English for best AI generation results.`;

// 微调模式的系统提示 - 当已有工作流数据时使用
const SYSTEM_PROMPT_REFINE = `You are an AI assistant helping to refine image generation prompts for a storyboard.

Current workflow has:
{WORKFLOW_DATA}

Your task:
1. Understand what the user wants to modify
2. Identify which specific character or scene they want to adjust
3. Generate an improved prompt ONLY for that specific item
4. Do NOT regenerate the entire script - only modify what the user asks for

When you identify what the user wants to change, output in this JSON format:
{
  "message": "Your explanation of the changes",
  "adjustment": {
    "type": "character" or "scene",
    "index": <index number starting from 0>,
    "name": "Name of the character or Scene #id",
    "newPrompt": "The improved image prompt"
  }
}

If the user wants to modify multiple items or the entire script, set "adjustment" to null and explain that they should be more specific about which character or scene to modify.

If just chatting or unclear what to modify, set "adjustment" to null.
All prompts should be in English for best AI generation results.`;

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as RequestBody;
    const { message, currentScript, history, videoUrl, workflowData } = body;

    // Get API key from Authorization header
    const authHeader = request.headers.get('Authorization');
    const apiKey = authHeader?.replace('Bearer ', '');

    if (!apiKey) {
      return NextResponse.json(
        { error: 'API Key not configured' },
        { status: 401 }
      );
    }

    // 判断是否使用微调模式
    const hasWorkflowData = workflowData &&
      ((workflowData.characters && workflowData.characters.length > 0) ||
       (workflowData.scenes && workflowData.scenes.length > 0));

    // Build conversation history
    const contents = [];

    let systemContext: string;

    if (hasWorkflowData) {
      // 微调模式 - 有工作流数据时
      const workflowDataStr = [
        'Characters:',
        ...(workflowData.characters || []).map((c, i) =>
          `  ${i}. ${c.name}: "${c.imagePrompt || '(no prompt)'}"`
        ),
        'Scenes:',
        ...(workflowData.scenes || []).map((s, i) =>
          `  ${i}. Scene #${s.id}: "${s.imagePrompt}"`
        ),
      ].join('\n');

      systemContext = SYSTEM_PROMPT_REFINE.replace('{WORKFLOW_DATA}', workflowDataStr);

      contents.push({
        role: 'user',
        parts: [{ text: systemContext }],
      });
      contents.push({
        role: 'model',
        parts: [
          {
            text: JSON.stringify({
              message: 'I can help you refine the prompts for your characters and scenes. Tell me which one you\'d like to adjust and how.',
              adjustment: null,
            }),
          },
        ],
      });
    } else {
      // 完整脚本生成模式
      systemContext = videoUrl
        ? SYSTEM_PROMPT
            .replace('{CURRENT_SCRIPT}', currentScript)
            .replace('{VIDEO_CONTEXT}', 'A video has been provided. Please analyze it carefully.')
        : SYSTEM_PROMPT_NO_VIDEO.replace('{CURRENT_SCRIPT}', currentScript);

      // First message with video if available
      const firstMessageParts: Array<{ text?: string; file_data?: { mime_type: string; file_uri: string } }> = [
        { text: systemContext },
      ];
      if (videoUrl) {
        firstMessageParts.push({
          file_data: {
            mime_type: getMimeType(videoUrl),
            file_uri: videoUrl,
          },
        });
      }

      contents.push({
        role: 'user',
        parts: firstMessageParts,
      });
      contents.push({
        role: 'model',
        parts: [
          {
            text: JSON.stringify({
              message: videoUrl
                ? 'I\'ve analyzed the video. Tell me what kind of storyboard you\'d like to create, or say "generate" to create the script based on my analysis.'
                : 'I\'m ready to help you create a storyboard script. Describe your story idea or provide details about what you want to create.',
              script: null,
            }),
          },
        ],
      });
    }

    // Add conversation history
    for (const msg of history) {
      contents.push({
        role: msg.role === 'user' ? 'user' : 'model',
        parts: [{ text: msg.content }],
      });
    }

    // Add current message
    contents.push({
      role: 'user',
      parts: [{ text: message }],
    });

    const response = await fetch(GEMINI_CHAT_URL, {
      method: 'POST',
      headers: {
        Authorization: apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents,
        generationConfig: {
          temperature: 0.7,
          topP: 0.95,
          maxOutputTokens: 8192,
        },
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      return NextResponse.json(
        { error: data.error?.message || 'Request failed' },
        { status: response.status }
      );
    }

    const responseText =
      data.candidates?.[0]?.content?.parts?.[0]?.text || '';

    // Try to parse JSON response
    try {
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return NextResponse.json({
          message: parsed.message || responseText,
          script: parsed.script || null,
          // 微调模式返回的调整数据
          adjustment: parsed.adjustment || null,
        });
      }
    } catch {
      // If not valid JSON, return as plain message
    }

    return NextResponse.json({
      message: responseText,
      script: null,
      adjustment: null,
    });
  } catch (error) {
    const err = error as Error;
    console.error('Chat API error:', err);
    return NextResponse.json(
      { error: err.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
