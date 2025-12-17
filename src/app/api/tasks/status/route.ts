import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer, hashApiKey } from '../config';

// 任务结构
interface TaskItem {
  index: number;
  filename: string;
  originalUrl: string | null;
  prompt: string;
  status: 'pending' | 'processing' | 'done' | 'error';
  generatedUrl: string | null;
  error: string | null;
}

// GET /api/tasks/status?historyId=xxx - 查询任务状态
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const historyId = searchParams.get('historyId');
    const apiKey = request.headers.get('Authorization')?.replace('Bearer ', '');

    if (!apiKey || !historyId) {
      return NextResponse.json({ success: false, error: 'Missing parameters' }, { status: 400 });
    }

    const userApiKey = hashApiKey(apiKey);

    // 获取历史记录（包含任务列表）
    const { data: history, error: historyError } = await supabaseServer
      .from('workflow_histories')
      .select('*')
      .eq('id', parseInt(historyId))
      .eq('user_api_key', userApiKey)
      .single();

    if (historyError || !history) {
      return NextResponse.json({ success: false, error: 'History not found' }, { status: 404 });
    }

    // 从 JSONB 中获取任务列表
    const tasks = (history.tasks as TaskItem[]) || [];

    // 统计
    const totalCount = tasks.length;
    const pendingCount = tasks.filter(t => t.status === 'pending').length;
    const processingCount = tasks.filter(t => t.status === 'processing').length;
    const successCount = tasks.filter(t => t.status === 'done').length;
    const errorCount = tasks.filter(t => t.status === 'error').length;

    // 转换任务格式（兼容前端）
    const formattedTasks = tasks.map(t => ({
      id: t.index,
      taskIndex: t.index,
      filename: t.filename,
      prompt: t.prompt,
      status: t.status,
      generatedUrl: t.generatedUrl,
      errorMessage: t.error,
    }));

    return NextResponse.json({
      success: true,
      history: {
        id: history.id,
        title: history.title,
        status: history.status,
        mode: history.mode,
        totalCount: history.total_count,
        successCount: history.success_count,
        errorCount: history.error_count,
        createdAt: history.created_at,
        updatedAt: history.updated_at,
      },
      tasks: formattedTasks,
      stats: {
        totalCount,
        pendingCount,
        processingCount,
        successCount,
        errorCount,
      },
      completed: pendingCount === 0 && processingCount === 0,
    });

  } catch (error) {
    const err = error as Error;
    console.error('Status query error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
