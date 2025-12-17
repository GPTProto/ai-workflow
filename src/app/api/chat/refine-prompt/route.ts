import { NextResponse } from 'next/server';

const API_BASE_URL = 'https://gptproto.com';
const GEMINI_CHAT_URL = `${API_BASE_URL}/v1beta/models/gemini-3-pro-preview:generateContent`;

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface RequestBody {
  message: string;
  targetType: 'character' | 'scene';
  targetName: string;
  currentPrompt: string;
  history: ChatMessage[];
  // 是否是创建新内容模式
  isCreateMode?: boolean;
}

const SYSTEM_PROMPT_CHARACTER = `You are an AI assistant specialized in refining image generation prompts.

You are helping the user improve a prompt for a character reference image: "{TARGET_NAME}".

Current prompt:
---
{CURRENT_PROMPT}
---

Your task:
1. Understand what the user wants to change or improve about this prompt
2. Generate an improved prompt based on their feedback
3. The prompt should be detailed and suitable for AI image generation

When you have a new prompt to suggest, output in this JSON format:
{
  "message": "Your explanation of the changes",
  "newPrompt": "The improved prompt text"
}

If just discussing without a final prompt, set "newPrompt" to null.
All prompts should be in English for best AI generation results.
Keep prompts descriptive but concise (under 200 words).`;

const SYSTEM_PROMPT_SCENE = `You are an AI assistant specialized in refining prompts for scene/storyboard images and videos.

You are helping the user improve prompts for a scene: "{TARGET_NAME}".

Current prompt:
---
{CURRENT_PROMPT}
---

Your task:
1. Understand what the user wants to change or improve about this scene
2. Generate TWO prompts:
   - imagePrompt: A detailed prompt for generating a static image of the scene (focus on composition, lighting, atmosphere, visual elements)
   - videoPrompt: A prompt describing the motion and action in the scene (focus on camera movement, character actions, transitions)

When you have prompts to suggest, output in this JSON format:
{
  "message": "Your explanation of the changes",
  "newPrompt": "The improved image prompt text",
  "videoPrompt": "The improved video prompt text describing motion and action"
}

If just discussing without final prompts, set "newPrompt" and "videoPrompt" to null.
All prompts should be in English for best AI generation results.
Keep prompts descriptive but concise (under 200 words each).`;

// 创建新角色的系统提示
const CREATE_SYSTEM_PROMPT_CHARACTER = `You are an AI assistant specialized in creating image generation prompts.

You are helping the user create a new character reference image.

Your task:
1. Understand what kind of character the user wants to create
2. Generate a detailed prompt suitable for AI image generation
3. Focus on appearance, clothing, expression, pose, art style

When you have a prompt to suggest, output in this JSON format:
{
  "message": "Your explanation of the created prompt",
  "newPrompt": "The generated prompt text",
  "name": "A short name for this character"
}

If just discussing without a final prompt, set "newPrompt" to null.
All prompts should be in English for best AI generation results.
Keep prompts descriptive but concise (under 200 words).`;

// 创建新分镜的系统提示
const CREATE_SYSTEM_PROMPT_SCENE = `You are an AI assistant specialized in creating prompts for scene/storyboard images and videos.

You are helping the user create a new scene.

Your task:
1. Understand what kind of scene the user wants to create
2. Generate TWO prompts:
   - imagePrompt: A detailed prompt for generating a static image of the scene (focus on composition, lighting, atmosphere, visual elements)
   - videoPrompt: A prompt describing the motion and action in the scene (focus on camera movement, character actions, transitions)

When you have prompts to suggest, output in this JSON format:
{
  "message": "Your explanation of the created prompts",
  "newPrompt": "The generated image prompt text",
  "videoPrompt": "The generated video prompt text describing motion and action",
  "name": "Scene #X" (where X is the scene number)
}

If just discussing without final prompts, set "newPrompt" and "videoPrompt" to null.
All prompts should be in English for best AI generation results.
Keep prompts descriptive but concise (under 200 words each).`;

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as RequestBody;
    const { message, targetType, targetName, currentPrompt, history, isCreateMode } = body;

    // Get API key from Authorization header
    const authHeader = request.headers.get('Authorization');
    const apiKey = authHeader?.replace('Bearer ', '');

    if (!apiKey) {
      return NextResponse.json(
        { error: 'API Key not configured' },
        { status: 401 }
      );
    }

    // Build conversation history
    const contents = [];

    // System context - 根据类型和模式选择不同的提示
    let systemContext: string;
    if (isCreateMode) {
      systemContext = targetType === 'character'
        ? CREATE_SYSTEM_PROMPT_CHARACTER
        : CREATE_SYSTEM_PROMPT_SCENE;
    } else {
      systemContext = targetType === 'character'
        ? SYSTEM_PROMPT_CHARACTER
            .replace('{TARGET_NAME}', targetName)
            .replace('{CURRENT_PROMPT}', currentPrompt || '(no prompt yet)')
        : SYSTEM_PROMPT_SCENE
            .replace('{TARGET_NAME}', targetName)
            .replace('{CURRENT_PROMPT}', currentPrompt || '(no prompt yet)');
    }

    // First message with context
    contents.push({
      role: 'user',
      parts: [{ text: systemContext }],
    });

    if (isCreateMode) {
      contents.push({
        role: 'model',
        parts: [
          {
            text: JSON.stringify({
              message: `I'll help you create a new ${targetType === 'character' ? 'character' : 'scene'}. Please describe what you want to create.`,
              newPrompt: null,
              videoPrompt: targetType === 'scene' ? null : undefined,
            }),
          },
        ],
      });
    } else {
      contents.push({
        role: 'model',
        parts: [
          {
            text: JSON.stringify({
              message: `I understand you want to refine the prompt for ${targetType === 'character' ? 'character' : 'scene'} "${targetName}". The current prompt is: "${currentPrompt || '(empty)'}". Tell me what you'd like to change or improve.`,
              newPrompt: null,
              videoPrompt: targetType === 'scene' ? null : undefined,
            }),
          },
        ],
      });
    }

    // Add conversation history (only recent messages)
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
          maxOutputTokens: 2048,
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
          newPrompt: parsed.newPrompt || null,
          videoPrompt: parsed.videoPrompt || null, // 分镜的视频提示词
          name: parsed.name || null, // 创建模式下返回名称
          isCreateMode: isCreateMode || false,
          targetType, // 返回类型，便于前端判断
        });
      }
    } catch {
      // If not valid JSON, return as plain message
    }

    return NextResponse.json({
      message: responseText,
      newPrompt: null,
      videoPrompt: null,
      name: null,
      isCreateMode: isCreateMode || false,
      targetType,
    });
  } catch (error) {
    const err = error as Error;
    console.error('Refine prompt API error:', err);
    return NextResponse.json(
      { error: err.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
