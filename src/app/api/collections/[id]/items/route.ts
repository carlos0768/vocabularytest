import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { parseJsonWithSchema } from '@/lib/api/validation';
import {
  addAssetToCollectionForUser,
  listCollectionItemsForUser,
} from '@/lib/learning-assets/service';
import { resolveAuthenticatedUser } from '@/app/api/share-import/shared';

const addItemSchema = z.object({
  assetId: z.string().uuid(),
}).strict();

type CollectionItemsDeps = {
  resolveUser?: typeof resolveAuthenticatedUser;
  listItems?: typeof listCollectionItemsForUser;
  addItem?: typeof addAssetToCollectionForUser;
};

function mapCollectionItemsError(error: unknown): { status: number; message: string } {
  const code = error instanceof Error ? error.message.split(':', 1)[0] : '';
  if (code === 'collection_not_found') {
    return { status: 404, message: 'フォルダが見つかりません。' };
  }
  if (code === 'asset_not_found') {
    return { status: 404, message: '学習アセットが見つかりません。' };
  }
  return { status: 500, message: 'フォルダ項目の処理に失敗しました。' };
}

export async function handleCollectionItemsGet(
  request: NextRequest,
  params: { id: string },
  deps: CollectionItemsDeps = {},
) {
  const resolveUser = deps.resolveUser ?? resolveAuthenticatedUser;
  const listItems = deps.listItems ?? listCollectionItemsForUser;

  try {
    const user = await resolveUser(request);
    if (!user) {
      return NextResponse.json({ success: false, error: '認証が必要です。' }, { status: 401 });
    }

    const items = await listItems(user.id, params.id);
    return NextResponse.json({ success: true, items });
  } catch (error) {
    const mapped = mapCollectionItemsError(error);
    return NextResponse.json({ success: false, error: mapped.message }, { status: mapped.status });
  }
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const params = await context.params;
  return handleCollectionItemsGet(request, params);
}

export async function handleCollectionItemsPost(
  request: NextRequest,
  params: { id: string },
  deps: CollectionItemsDeps = {},
) {
  const resolveUser = deps.resolveUser ?? resolveAuthenticatedUser;
  const addItem = deps.addItem ?? addAssetToCollectionForUser;

  try {
    const user = await resolveUser(request);
    if (!user) {
      return NextResponse.json({ success: false, error: '認証が必要です。' }, { status: 401 });
    }

    const parsed = await parseJsonWithSchema(request, addItemSchema, {
      invalidMessage: 'assetId が不正です。',
    });
    if (!parsed.ok) {
      return parsed.response;
    }

    await addItem(user.id, params.id, parsed.data.assetId);
    return NextResponse.json({ success: true });
  } catch (error) {
    const mapped = mapCollectionItemsError(error);
    return NextResponse.json({ success: false, error: mapped.message }, { status: mapped.status });
  }
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const params = await context.params;
  return handleCollectionItemsPost(request, params);
}
