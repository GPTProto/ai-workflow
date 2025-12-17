import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    // Dynamic import for xlsx
    const xlsxModule = await import('xlsx');
    const XLSX = xlsxModule.default || xlsxModule;

    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json(
        { success: false, error: 'No file provided' },
        { status: 400 }
      );
    }

    // Read file as ArrayBuffer
    const arrayBuffer = await file.arrayBuffer();
    const data8 = new Uint8Array(arrayBuffer);
    const workbook = XLSX.read(data8, { type: 'array' });

    // Get first sheet
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];

    // Convert to JSON
    const data = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as string[][];

    // Extract prompts from first column (skip header if exists)
    const prompts: string[] = [];

    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      if (row && row[0]) {
        const value = String(row[0]).trim();
        // Skip if looks like a header
        if (i === 0 && (value.toLowerCase() === 'prompt' || value.toLowerCase() === 'prompts')) {
          continue;
        }
        if (value) {
          prompts.push(value);
        }
      }
    }

    if (prompts.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No prompts found in Excel file' },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      prompts,
      count: prompts.length,
    });
  } catch (error) {
    console.error('Excel parse error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to parse Excel file' },
      { status: 500 }
    );
  }
}
