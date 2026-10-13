import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { FREE_NAV_TABS, PRO_NAV_TABS, getNavTabs, isNavTabActive } from './tabs';

// CLAUDE.md 3b: ボトムナビ・サイドバー・デスクトップヘッダーは同じ並び。
// 3 つとも getNavTabs を読むので、並びを固定するのはここだけでよい。
describe('nav tabs', () => {
  it('Pro は ホーム / 目標 / 作成 / 共有 / アカウント', () => {
    assert.deepEqual(PRO_NAV_TABS.map((t) => t.key), ['home', 'goal', 'create', 'shared', 'account']);
  });

  it('Free / ゲストは ホーム / 共有 / 作成 / リール / アカウント', () => {
    assert.deepEqual(FREE_NAV_TABS.map((t) => t.key), ['home', 'shared', 'create', 'reels', 'account']);
  });

  it('どちらも 5 タブで、作成 (primary) は中央、他は href を持つ', () => {
    for (const tabs of [PRO_NAV_TABS, FREE_NAV_TABS]) {
      assert.equal(tabs.length, 5);
      assert.equal(tabs[2].primary, true);
      assert.equal(tabs[2].href, undefined);
      for (const tab of tabs) {
        if (!tab.primary) assert.ok(tab.href, `${tab.key} に href が無い`);
        assert.ok(tab.iconPath.length > 0);
      }
      assert.equal(new Set(tabs.map((t) => t.key)).size, 5);
    }
  });

  it('getNavTabs は isPro で切り替える', () => {
    assert.equal(getNavTabs(true), PRO_NAV_TABS);
    assert.equal(getNavTabs(false), FREE_NAV_TABS);
  });
});

describe('isNavTabActive', () => {
  const byKey = (key: string) => PRO_NAV_TABS.find((t) => t.key === key) ?? FREE_NAV_TABS.find((t) => t.key === key)!;

  it('ホームは / だけ (前方一致にすると全ページで光る)', () => {
    assert.equal(isNavTabActive(byKey('home'), '/'), true);
    assert.equal(isNavTabActive(byKey('home'), '/goal'), false);
  });

  it('アカウントは自分のプロフィール (/profile) だけ。他人の /profile/<id> は違う', () => {
    assert.equal(isNavTabActive(byKey('account'), '/profile'), true);
    assert.equal(isNavTabActive(byKey('account'), '/profile/abc'), false);
    assert.equal(isNavTabActive(byKey('account'), '/settings/account'), true);
    assert.equal(isNavTabActive(byKey('account'), '/coins'), true);
  });

  it('共有はグループと共有リンクのページも含む', () => {
    assert.equal(isNavTabActive(byKey('shared'), '/shared'), true);
    assert.equal(isNavTabActive(byKey('shared'), '/groups/xyz'), true);
    assert.equal(isNavTabActive(byKey('shared'), '/share/abc'), true);
    assert.equal(isNavTabActive(byKey('shared'), '/sharedfoo'), false);
  });

  it('作成 (href 無し) はどこでもアクティブにならない', () => {
    assert.equal(isNavTabActive(byKey('create'), '/'), false);
  });
});
