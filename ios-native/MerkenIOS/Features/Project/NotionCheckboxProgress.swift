import Foundation

/// Notion風3マスチェックの表示用。`WordStatus` は3値のみのため、学習中で2マス目だけは UserDefaults で保持する。
enum NotionCheckboxProgress {
    private static func reviewSecondFillKey(_ wordId: String) -> String {
        "Merken.notionCheckbox.reviewSecondFill.\(wordId)"
    }

    /// `mastered` から1マス戻した直後の `review`+2マス目か。同じ見た目でも「進む」(→習得) と「戻る」(→1マス目) を分ける。
    private static func reviewSecondFromMasteredKey(_ wordId: String) -> String {
        "Merken.notionCheckbox.reviewSecondFromMastered.\(wordId)"
    }

    /// 習得から段階的に戻った結果の `review`+1マス目か。次タップは未学習へ（1マス目→進む と区別）。
    private static func reviewFirstFromWalkbackKey(_ wordId: String) -> String {
        "Merken.notionCheckbox.reviewFirstFromWalkback.\(wordId)"
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

    static func hasReviewSecondFromMastered(_ wordId: String) -> Bool {
        UserDefaults.standard.bool(forKey: reviewSecondFromMasteredKey(wordId))
    }

    static func setReviewSecondFromMastered(_ wordId: String, _ on: Bool) {
        if on {
            UserDefaults.standard.set(true, forKey: reviewSecondFromMasteredKey(wordId))
        } else {
            UserDefaults.standard.removeObject(forKey: reviewSecondFromMasteredKey(wordId))
        }
    }

    static func hasReviewFirstFromWalkback(_ wordId: String) -> Bool {
        UserDefaults.standard.bool(forKey: reviewFirstFromWalkbackKey(wordId))
    }

    static func setReviewFirstFromWalkback(_ wordId: String, _ on: Bool) {
        if on {
            UserDefaults.standard.set(true, forKey: reviewFirstFromWalkbackKey(wordId))
        } else {
            UserDefaults.standard.removeObject(forKey: reviewFirstFromWalkbackKey(wordId))
        }
    }

    /// サーバー同期後、`review` 以外ならローカルの2マス目フラグを捨てる
    static func reconcileAfterLoad(words: [Word]) {
        for w in words where w.status != .review {
            UserDefaults.standard.removeObject(forKey: reviewSecondFillKey(w.id))
            UserDefaults.standard.removeObject(forKey: reviewSecondFromMasteredKey(w.id))
            UserDefaults.standard.removeObject(forKey: reviewFirstFromWalkbackKey(w.id))
        }
    }
}
