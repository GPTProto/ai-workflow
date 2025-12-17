import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer, hashApiKey } from '../config';

// POST /api/tasks/stop - 停止任务
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { apiKey, historyId } = body;

    if (!apiKey || !historyId) {
      return NextResponse.json({ success: false, error: 'Missing parameters' }, { status: 400 });
    }

    const userApiKey = hashApiKey(apiKey);

    // 验证历史记录属于当前用户
    const { data: history, error: historyError } = await supabaseServer
      .from('workflow_histories')
      .select('id, status')
      .eq('id', historyId)
      .eq('user_api_key', userApiKey)
      .single();

    if (historyError || !history) {
      return NextResponse.json({ success: false, error: 'History not found' }, { status: 404 });
    }

    // 更新历史记录状态为 stopped
    await supabaseServer
      .from('workflow_histories')
      .update({ status: 'stopped' })
      .eq('id', historyId);

    // 将所有 pending 和 processing 的任务标记为 error
    await supabaseServer
      .from('tasks')
      .update({ status: 'error', error_message: 'Stopped by user' })
      .eq('history_id', historyId)
      .in('status', ['pending', 'processing']);

    // 获取最终统计
    const { data: tasks } = await supabaseServer
      .from('tasks')
      .select('status')
      .eq('history_id', historyId);

    const successCount = tasks?.filter(t => t.status === 'done').length || 0;
    const errorCount = tasks?.filter(t => t.status === 'error').length || 0;

    // 更新历史记录统计
    await supabaseServer
      .from('workflow_histories')
      .update({
        image_gen_success_count: successCount,
        image_gen_error_count: errorCount,
      })
      .eq('id', historyId);

    return NextResponse.json({
      success: true,
      message: 'Task stopped',
      successCount,
      errorCount,
    });

  } catch (error) {
    const err = error as Error;
    console.error('Stop task error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
