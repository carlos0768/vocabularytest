import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveUniqueProjectTitle } from './unique-title';

test('衝突しなければ元の名前をそのまま使う', () => {
  assert.equal(resolveUniqueProjectTitle('英単語', ['他の単語帳']), '英単語');
  assert.equal(resolveUniqueProjectTitle('英単語', []), '英単語');
});

test('同名があれば（1）を付ける', () => {
  assert.equal(resolveUniqueProjectTitle('英単語', ['英単語']), '英単語（1）');
});

test('（1）も埋まっていれば空いている番号まで進む', () => {
  assert.equal(
    resolveUniqueProjectTitle('英単語', ['英単語', '英単語（1）', '英単語（2）']),
    '英単語（3）',
  );
});

test('途中の番号が空いていればそこを使う', () => {
  assert.equal(
    resolveUniqueProjectTitle('英単語', ['英単語', '英単語（1）', '英単語（3）']),
    '英単語（2）',
  );
});

test('連番付きの名前を取り込んだときは番号を振り直す', () => {
  assert.equal(
    resolveUniqueProjectTitle('英単語（1）', ['英単語（1）']),
    '英単語（2）',
  );
  assert.equal(
    resolveUniqueProjectTitle('英単語（1）', ['英単語', '英単語（1）', '英単語（2）']),
    '英単語（3）',
  );
});

test('前後の空白は比較時に無視する', () => {
  assert.equal(resolveUniqueProjectTitle('  英単語  ', ['英単語']), '英単語（1）');
  assert.equal(resolveUniqueProjectTitle('英単語', ['  英単語  ']), '英単語（1）');
});

test('空白だけの名前は触らない', () => {
  assert.equal(resolveUniqueProjectTitle('   ', ['   ']), '   ');
});

test('数字だけの名前でも無限ループしない', () => {
  assert.equal(resolveUniqueProjectTitle('（1）', ['（1）']), '（1）（1）');
});
