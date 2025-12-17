import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer, hashApiKey } from '../../tasks/config';
import { uploadToOSS } from '@/lib/oss';

// POST /api/workflow/upload-character - Upload character image for background workflow
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const historyId = formData.get('historyId') as string;
    const characterIndex = formData.get('characterIndex') as string;

    const authHeader = request.headers.get('authorization');
    const apiKey = authHeader?.replace('Bearer ', '');

    if (!apiKey) {
      return NextResponse.json({ success: false, error: 'API Key is required' }, { status: 401 });
    }

    if (!historyId) {
      return NextResponse.json({ success: false, error: 'History ID is required' }, { status: 400 });
    }

    if (characterIndex === undefined || characterIndex === null) {
      return NextResponse.json({ success: false, error: 'Character index is required' }, { status: 400 });
    }

    if (!file) {
      return NextResponse.json({ success: false, error: 'File is required' }, { status: 400 });
    }

    const userApiKey = hashApiKey(apiKey);
    const charIdx = parseInt(characterIndex, 10);

    // Get current workflow status
    const { data: workflow, error: fetchError } = await supabaseServer
      .from('workflow_histories')
      .select('*')
      .eq('id', parseInt(historyId, 10))
      .eq('user_api_key', userApiKey)
      .single();

    if (fetchError || !workflow) {
      return NextResponse.json({ success: false, error: 'Workflow not found' }, { status: 404 });
    }

    // Check if characters array exists and the index is valid
    const characters = workflow.characters || [];
    if (charIdx < 0 || charIdx >= characters.length) {
      return NextResponse.json({ success: false, error: 'Invalid character index' }, { status: 400 });
    }

    const character = characters[charIdx];

    console.log(`[Workflow ${historyId}] Uploading image for character ${charIdx}: ${character.name}`);

    // Update character status to uploading
    character.status = 'uploading';
    character.error = undefined;

    await supabaseServer
      .from('workflow_histories')
      .update({ characters })
      .eq('id', parseInt(historyId, 10));

    try {
      // Convert File to Buffer
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      // Upload to OSS
      const filename = `char-${charIdx}-upload-${Date.now()}.${file.name.split('.').pop() || 'png'}`;
      const ossUrl = await uploadToOSS(`workflow/${historyId}/${filename}`, buffer, false);

      // Update character with uploaded image
      character.imageUrl = ossUrl;
      character.ossUrl = ossUrl;
      character.status = 'done';
      character.error = undefined;

      await supabaseServer
        .from('workflow_histories')
        .update({ characters })
        .eq('id', parseInt(historyId, 10));

      console.log(`[Workflow ${historyId}] Character ${charIdx} image uploaded successfully`);

      return NextResponse.json({
        success: true,
        message: 'Character image uploaded',
        imageUrl: ossUrl
      });
    } catch (err) {
      character.status = 'error';
      character.error = (err as Error).message;
      console.error(`[Workflow ${historyId}] Character ${character.name} upload error:`, err);

      await supabaseServer
        .from('workflow_histories')
        .update({ characters })
        .eq('id', parseInt(historyId, 10));

      return NextResponse.json({
        success: false,
        error: (err as Error).message
      }, { status: 500 });
    }
  } catch (error) {
    const err = error as Error;
    console.error('Upload character error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
