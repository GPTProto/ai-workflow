import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer, hashApiKey } from '../../tasks/config';

// POST /api/workflow/stop - 停止工作流
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { historyId } = body;
    const apiKey = request.headers.get('Authorization')?.replace('Bearer ', '');

    if (!apiKey || !historyId) {
      return NextResponse.json({ success: false, error: 'Missing parameters' }, { status: 400 });
    }

    const userApiKey = hashApiKey(apiKey);

    // 更新状态为 stopped
    const { error } = await supabaseServer
      .from('workflow_histories')
      .update({ status: 'stopped' })
      .eq('id', historyId)
      .eq('user_api_key', userApiKey);

    if (error) {
      throw new Error(`Failed to stop workflow: ${error.message}`);
    }

    return NextResponse.json({ success: true });

  } catch (error) {
    const err = error as Error;
    console.error('Stop workflow error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
