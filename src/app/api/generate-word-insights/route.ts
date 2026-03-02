import { NextResponse } from 'next/server';

export async function POST() {
  return NextResponse.json(
    { success: false, error: 'Word Insightsは現在利用できません。' },
    { status: 403 },
  );
}
