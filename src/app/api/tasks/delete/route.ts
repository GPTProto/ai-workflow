import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer, hashApiKey } from '../config';

// DELETE /api/tasks/delete?historyId=xxx - 删除任务
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const historyId = searchParams.get('historyId');
    const apiKey = request.headers.get('Authorization')?.replace('Bearer ', '');

    if (!apiKey || !historyId) {
      return NextResponse.json({ success: false, error: 'Missing parameters' }, { status: 400 });
    }

    const userApiKey = hashApiKey(apiKey);

    // 验证历史记录属于当前用户
    const { data: history, error: historyError } = await supabaseServer
      .from('workflow_histories')
      .select('id')
      .eq('id', parseInt(historyId))
      .eq('user_api_key', userApiKey)
      .single();

    if (historyError || !history) {
      return NextResponse.json({ success: false, error: 'History not found' }, { status: 404 });
    }

    // 删除历史记录（任务会级联删除）
    const { error: deleteError } = await supabaseServer
      .from('workflow_histories')
      .delete()
      .eq('id', parseInt(historyId));

    if (deleteError) {
      throw new Error(`Failed to delete: ${deleteError.message}`);
    }

    return NextResponse.json({
      success: true,
      message: 'Task deleted',
    });

  } catch (error) {
    const err = error as Error;
    console.error('Delete task error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
