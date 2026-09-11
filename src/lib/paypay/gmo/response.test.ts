import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GmoApiError,
  extractGmoErrors,
  parseGmoResponse,
  parseGmoResponseBody,
} from './response';

test('parses a form-urlencoded success body', () => {
  const body = parseGmoResponseBody('AccessID=abc123&AccessPass=def456&Status=CAPTURE');
  assert.deepEqual(body, {
    AccessID: 'abc123',
    AccessPass: 'def456',
    Status: 'CAPTURE',
  });
});

test('decodes percent-encoded values', () => {
  const body = parseGmoResponseBody('PayPayURL=https%3A%2F%2Fexample.com%2Fpay%3Fa%3D1');
  assert.equal(body.PayPayURL, 'https://example.com/pay?a=1');
});

test('a business error is thrown even though GMO answers with HTTP 200', () => {
  assert.throws(
    () => parseGmoResponse('ErrCode=E01&ErrInfo=E01010001'),
    (error: unknown) => {
      assert.ok(error instanceof GmoApiError);
      assert.deepEqual(error.errors, [{ errCode: 'E01', errInfo: 'E01010001' }]);
      assert.equal(error.hasErrInfo('E01010001'), true);
      return true;
    }
  );
});

test('pipe-separated errors are paired positionally', () => {
  const errors = extractGmoErrors({
    ErrCode: 'E01|E01',
    ErrInfo: 'E01010001|E01020010',
  });
  assert.deepEqual(errors, [
    { errCode: 'E01', errInfo: 'E01010001' },
    { errCode: 'E01', errInfo: 'E01020010' },
  ]);
});

test('an ErrInfo without a matching ErrCode is still reported', () => {
  const errors = extractGmoErrors({ ErrInfo: 'E01010001' });
  assert.deepEqual(errors, [{ errCode: '', errInfo: 'E01010001' }]);
});

test('an empty body is an error, not a silent success', () => {
  assert.throws(() => parseGmoResponse(''), GmoApiError);
  assert.throws(() => parseGmoResponse('   '), GmoApiError);
});

test('empty ErrCode/ErrInfo fields do not fabricate an error', () => {
  const body = parseGmoResponse('AccessID=abc&ErrCode=&ErrInfo=');
  assert.equal(body.AccessID, 'abc');
});
