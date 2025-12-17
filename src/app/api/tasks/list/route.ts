import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer, hashApiKey } from '../config';

// GET /api/tasks/list - 获取用户的所有任务列表
export async function GET(request: NextRequest) {
  try {
    const apiKey = request.headers.get('Authorization')?.replace('Bearer ', '');

    if (!apiKey) {
      return NextResponse.json({ success: false, error: 'API Key is required' }, { status: 401 });
    }

    const userApiKey = hashApiKey(apiKey);

    // 获取所有历史记录
    const { data: histories, error } = await supabaseServer
      .from('workflow_histories')
      .select('*')
      .eq('user_api_key', userApiKey)
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(`Failed to fetch histories: ${error.message}`);
    }

    // 转换格式
    const formattedHistories = (histories || []).map(h => ({
      id: h.id,
      title: h.title,
      type: h.type,
      status: h.status,
      mode: h.mode,
      totalCount: h.total_count,
      successCount: h.success_count,
      errorCount: h.error_count,
      createdAt: h.created_at,
      updatedAt: h.updated_at,
    }));

    return NextResponse.json({
      success: true,
      histories: formattedHistories,
    });

  } catch (error) {
    const err = error as Error;
    console.error('List tasks error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
