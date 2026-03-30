import { NextResponse } from 'next/server';

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
