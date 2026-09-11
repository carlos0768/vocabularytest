// GMO PG のレスポンス解析。
//
// GMO は JSON を返さない。成功も失敗も application/x-www-form-urlencoded の
// key=value&key=value で、HTTPステータスは失敗時も 200 で返ってくる。
// つまり「HTTP 200 = 成功」と書くと、課金に失敗した取引を成功扱いする。
// 成否は本文の ErrCode/ErrInfo の有無だけで判定する。
//
// 複数エラーはパイプ区切りで同じ位置に対応する:
//   ErrCode=E01|E01&ErrInfo=E01010001|E01020010

export class GmoApiError extends Error {
  readonly errors: GmoErrorDetail[];

  constructor(message: string, errors: GmoErrorDetail[]) {
    super(message);
    this.name = 'GmoApiError';
    this.errors = errors;
  }

  /** 指定の ErrInfo を含むか。呼び出し側が「既に解約済み」等を握り潰す判定に使う */
  hasErrInfo(errInfo: string): boolean {
    return this.errors.some((detail) => detail.errInfo === errInfo);
  }
}

export type GmoErrorDetail = {
  errCode: string;
  errInfo: string;
};

export type GmoResponseBody = Record<string, string>;

/**
 * GMO の応答本文をキー/値に分解する。
 *
 * 値は URL エンコードされているので decode する。GMO は日本語項目を Shift_JIS で
 * 返す設定があるが、ここで読むのは ID・コード・金額・ステータスといった ASCII 項目だけで、
 * 日本語のエラーメッセージは使わない（ErrInfo のコードで判断する）ため UTF-8 で扱う。
 */
export function parseGmoResponseBody(raw: string): GmoResponseBody {
  const result: GmoResponseBody = {};
  const params = new URLSearchParams(raw.trim());
  for (const [key, value] of params.entries()) {
    result[key] = value;
  }
  return result;
}

export function extractGmoErrors(body: GmoResponseBody): GmoErrorDetail[] {
  const codes = body.ErrCode ? body.ErrCode.split('|') : [];
  const infos = body.ErrInfo ? body.ErrInfo.split('|') : [];

  // 片方しか返らないケースがあるため、長い方に合わせて対応付ける。
  const length = Math.max(codes.length, infos.length);
  const errors: GmoErrorDetail[] = [];

  for (let index = 0; index < length; index++) {
    const errCode = codes[index]?.trim() ?? '';
    const errInfo = infos[index]?.trim() ?? '';
    if (errCode === '' && errInfo === '') {
      continue;
    }
    errors.push({ errCode, errInfo });
  }

  return errors;
}

/**
 * 応答を検証して本文を返す。エラーがあれば GmoApiError を投げる。
 *
 * 空応答もエラーにする。GMO はパラメータ不正で本文なしを返すことがあり、
 * 空を「エラーなし」と読むと成功扱いになる。
 */
export function parseGmoResponse(raw: string): GmoResponseBody {
  const body = parseGmoResponseBody(raw);

  const errors = extractGmoErrors(body);
  if (errors.length > 0) {
    const summary = errors
      .map((detail) => `${detail.errCode}/${detail.errInfo}`)
      .join(', ');
    throw new GmoApiError(`GMO API returned an error: ${summary}`, errors);
  }

  if (Object.keys(body).length === 0) {
    throw new GmoApiError('GMO API returned an empty body', []);
  }

  return body;
}
