import { NextResponse } from 'next/server';
import { z } from 'zod';

type ParseJsonSuccess<T> = {
  ok: true;
  data: T;
};

type ParseJsonFailure = {
  ok: false;
  response: NextResponse;
};

export type ParseJsonResult<T> = ParseJsonSuccess<T> | ParseJsonFailure;

type ParseJsonOptions = {
  parseMessage?: string;
  invalidMessage?: string;
  allowEmptyBody?: boolean;
};

export async function parseJsonWithSchema<TSchema extends z.ZodTypeAny>(
  request: Request,
  schema: TSchema,
  options?: ParseJsonOptions,
): Promise<ParseJsonResult<z.infer<TSchema>>> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    if (options?.allowEmptyBody) {
      body = {};
    } else {
      return {
        ok: false,
        response: NextResponse.json(
          { error: options?.parseMessage ?? 'リクエストの解析に失敗しました' },
          { status: 400 },
        ),
      };
    }
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: options?.invalidMessage ?? '無効なリクエスト形式です' },
        { status: 400 },
      ),
    };
  }

  return {
    ok: true,
    data: parsed.data,
  };
}
