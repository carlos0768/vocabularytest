import { NextRequest, NextResponse } from 'next/server';

export async function GET() {
  const srvKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  const cloudRunUrl = process.env.CLOUD_RUN_URL || '';
  return NextResponse.json({
    srvKeyPrefix: srvKey.substring(0, 15),
    srvKeyLength: srvKey.length,
    cloudRunUrl: cloudRunUrl.substring(0, 30),
    hasCloudRunUrl: Boolean(cloudRunUrl),
  });
}

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization') || '';
  const srvKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  const expected = `Bearer ${srvKey}`;
  return NextResponse.json({
    match: authHeader === expected,
    authHeaderLen: authHeader.length,
    expectedLen: expected.length,
    authHeaderPrefix: authHeader.substring(0, 22),
    expectedPrefix: expected.substring(0, 22),
    authHeaderSuffix: authHeader.substring(authHeader.length - 10),
    expectedSuffix: expected.substring(expected.length - 10),
  });
}
