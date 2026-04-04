import Foundation

/// Notion風3マスチェックの表示用。`WordStatus` は3値のみのため、学習中で2マス目だけは UserDefaults で保持する。
enum NotionCheckboxProgress {
    private static func reviewSecondFillKey(_ wordId: String) -> String {
        "Merken.notionCheckbox.reviewSecondFill.\(wordId)"
    }

    /// 塗りマス数 0...3（3マスUI用）
    static func filledCount(for word: Word) -> Int {
        switch word.status {
        case .new:
            return 0
        case .mastered:
            return 3
        case .review:
            return UserDefaults.standard.bool(forKey: reviewSecondFillKey(word.id)) ? 2 : 1
        }
    }

    static func hasReviewSecondFill(_ wordId: String) -> Bool {
        UserDefaults.standard.bool(forKey: reviewSecondFillKey(wordId))
    }

    static func setReviewSecondFill(_ wordId: String, _ on: Bool) {
        if on {
            UserDefaults.standard.set(true, forKey: reviewSecondFillKey(wordId))
        } else {
            UserDefaults.standard.removeObject(forKey: reviewSecondFillKey(wordId))
        }
    }

    /// サーバー同期後、`review` 以外ならローカルの2マス目フラグを捨てる
    static func reconcileAfterLoad(words: [Word]) {
        for w in words where w.status != .review {
            UserDefaults.standard.removeObject(forKey: reviewSecondFillKey(w.id))
        }
    }
}
