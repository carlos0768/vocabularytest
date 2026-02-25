import SwiftUI
import AVFoundation

private struct QuizDestination: Hashable {
    let collectionId: String
}

private struct FlashcardDestination: Hashable {
    let collectionId: String
}

private struct Quiz2Destination: Hashable {
    let collectionId: String
}

private struct SentenceQuizDestination: Hashable {
    let collectionId: String
}

struct BookshelfDetailView: View {
    let collection: Collection

    @EnvironmentObject private var appState: AppState
    @StateObject private var viewModel = BookshelfDetailViewModel()
    @Environment(\.dismiss) private var dismiss

    @State private var isEditingName = false
    @State private var editedName: String = ""
    @State private var editedDescription: String = ""
    @State private var showingAddProjects = false

    @State private var quizDestination: QuizDestination?
    @State private var flashcardDestination: FlashcardDestination?
    @State private var quiz2Destination: Quiz2Destination?
    @State private var sentenceQuizDestination: SentenceQuizDestination?

    @State private var previewIndex = 0
    @State private var showingWordList = false
    @State private var dictionaryURL: URL?
    @State private var showingDeleteConfirm = false

    var body: some View {
        ZStack {
            // Use plain background (placeholder color extends behind nav bar)
            MerkenTheme.background.ignoresSafeArea()

            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    // Notion-style cover header (scrolls with content)
                    headerSection

                    // Content below header — wrap in AppBackground so dots show here
                    ZStack(alignment: .top) {
                        AppBackground()

                        VStack(alignment: .leading, spacing: 16) {
                            if let errorMessage = viewModel.errorMessage {
                                SolidCard {
                                    Text(errorMessage)
                                        .foregroundStyle(MerkenTheme.warning)
                                }
                            }

                            // Flashcard preview with navigation
                            if !viewModel.allWords.isEmpty {
                                flashcardPreview
                            }

                            // Learning modes
                            learningModesSection

                            // Word list (compact summary → navigates to full list)
                            wordListSection

                            // Member projects
                            memberProjectsSection
                        }
                        .padding(16)
                    }
                }
            }
            .scrollIndicators(.hidden)
            .scrollEdgeEffectStyle(.none, for: .top)
            .contentMargins(.top, 0, for: .scrollContent)
            .refreshable {
                await viewModel.load(collectionId: collection.id, using: appState)
            }
        }
        .ignoresSafeArea(.container, edges: .top)
        .navigationBarTitleDisplayMode(.inline)
        .toolbarBackground(.hidden, for: .navigationBar)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                HStack(spacing: 16) {
                    Button {
                        showingAddProjects = true
                    } label: {
                        Image(systemName: "plus")
                            .foregroundStyle(.white)
                            .shadow(color: .black.opacity(0.4), radius: 2, x: 0, y: 1)
                    }

                    Button {
                        editedName = viewModel.collection?.name ?? collection.name
                        editedDescription = viewModel.collection?.description ?? ""
                        isEditingName = true
                    } label: {
                        Image(systemName: "pencil")
                            .foregroundStyle(.white)
                            .shadow(color: .black.opacity(0.4), radius: 2, x: 0, y: 1)
                    }
                }
            }
        }
        .tint(.white)
        .sheet(isPresented: $isEditingName) {
            editSheet
                .presentationDetents([.height(280)])
                .presentationDragIndicator(.visible)
        }
        .sheet(isPresented: $showingAddProjects) {
            AddProjectsSheet(
                collectionId: collection.id,
                existingProjectIds: Set(viewModel.projects.map(\.id))
            ) {
                await viewModel.load(collectionId: collection.id, using: appState)
            }
            .presentationDetents([.medium, .large])
            .presentationDragIndicator(.visible)
        }
        .sheet(item: $dictionaryURL) { url in
            SafariView(url: url)
                .ignoresSafeArea()
        }
        .navigationDestination(isPresented: $showingWordList) {
            BookshelfWordListView(collection: collection)
        }
        .navigationDestination(item: $quizDestination) { _ in
            QuizView(
                project: dummyProject,
                preloadedWords: viewModel.allWords
            )
        }
        .navigationDestination(item: $flashcardDestination) { _ in
            FlashcardView(
                project: dummyProject,
                preloadedWords: viewModel.allWords
            )
        }
        .navigationDestination(item: $quiz2Destination) { _ in
            Quiz2View(
                project: dummyProject,
                preloadedWords: viewModel.allWords
            )
        }
        .navigationDestination(item: $sentenceQuizDestination) { _ in
            SentenceQuizView(
                project: dummyProject,
                preloadedWords: viewModel.allWords
            )
        }
        .alert("この本棚を削除しますか？", isPresented: $showingDeleteConfirm) {
            Button("削除", role: .destructive) {
                Task {
                    await viewModel.deleteCollection(id: collection.id, using: appState)
                    dismiss()
                }
            }
            Button("キャンセル", role: .cancel) {}
        } message: {
            Text("「\(collection.name)」が削除されます。所属する単語帳は削除されません。")
        }
        .task(id: "\(appState.repositoryMode)-\(appState.dataVersion)") {
            await viewModel.load(collectionId: collection.id, using: appState)
        }
    }

    /// Dummy project used as a container for quiz navigation
    private var dummyProject: Project {
        Project(
            id: collection.id,
            userId: collection.userId,
            title: collection.name
        )
    }

    // MARK: - Header (Notion-style cover, extends behind nav bar)

    /// Extra height added above the visible header to cover safe area + nav bar + overscroll
    private let headerTopExtension: CGFloat = 300

    private var headerSection: some View {
        ZStack(alignment: .bottomLeading) {
            // Cover placeholder color — extended upward to cover safe area
            MerkenTheme.placeholderColor(for: collection.id)
                .frame(height: 230 + headerTopExtension)

            // Content overlay — title + actions pinned to bottom
            HStack(alignment: .bottom) {
                VStack(alignment: .leading, spacing: 2) {
                    HStack(spacing: 8) {
                        Image(systemName: "books.vertical.fill")
                            .font(.title3)
                            .foregroundStyle(.white)
                            .shadow(color: .black.opacity(0.3), radius: 2, x: 0, y: 1)

                        Text(viewModel.collection?.name ?? collection.name)
                            .font(.title3.bold())
                            .foregroundStyle(.white)
                            .lineLimit(1)
                            .truncationMode(.tail)
                            .layoutPriority(-1)
                            .shadow(color: .black.opacity(0.3), radius: 2, x: 0, y: 1)

                        if appState.isPro {
                            HStack(spacing: 2) {
                                Image(systemName: "sparkles")
                                    .font(.caption2)
                                Text("Pro")
                                    .font(.caption2.bold())
                            }
                            .foregroundStyle(.white)
                            .padding(.horizontal, 8)
                            .padding(.vertical, 3)
                            .background(MerkenTheme.accentBlue, in: .capsule)
                        }
                    }

                    Text("\(viewModel.allWords.count)語 / 習得 \(viewModel.masteredCount)語 / \(viewModel.projects.count)冊")
                        .font(.caption)
                        .foregroundStyle(.white.opacity(0.85))
                        .shadow(color: .black.opacity(0.3), radius: 2, x: 0, y: 1)
                }

                Spacer(minLength: 0)

                HStack(spacing: 10) {
                    Button {
                        showingDeleteConfirm = true
                    } label: {
                        Image(systemName: "trash")
                            .font(.subheadline)
                            .foregroundStyle(.white)
                            .frame(width: 36, height: 36)
                            .background(.white.opacity(0.2), in: .circle)
                    }
                }
            }
            .padding(.horizontal, 16)
            .padding(.bottom, 12)
        }
        .frame(height: 230 + headerTopExtension)
        .padding(.top, -headerTopExtension)
    }

    // MARK: - Flashcard Preview (with navigation, matching ProjectDetailView)

    private var safePreviewIndex: Int {
        guard !viewModel.allWords.isEmpty else { return 0 }
        return min(previewIndex, viewModel.allWords.count - 1)
    }

    private var flashcardPreview: some View {
        let word = viewModel.allWords[safePreviewIndex]

        return VStack(spacing: 14) {
            // Card
            SolidCard {
                VStack(spacing: 12) {
                    // Top bar: progress + actions
                    HStack {
                        Text("\(safePreviewIndex + 1)/\(viewModel.allWords.count)")
                            .font(.caption.bold())
                            .foregroundStyle(MerkenTheme.mutedText)
                        Spacer()
                        HStack(spacing: 4) {
                            Button {
                                speakWord(word.english)
                            } label: {
                                Image(systemName: "speaker.wave.2")
                                    .font(.subheadline)
                                    .foregroundStyle(MerkenTheme.secondaryText)
                                    .frame(width: 32, height: 32)
                            }
                            Button {
                                // No-op: favorite toggling requires per-project context
                            } label: {
                                Image(systemName: word.isFavorite ? "flag.fill" : "flag")
                                    .font(.subheadline)
                                    .foregroundStyle(word.isFavorite ? MerkenTheme.accentBlue : MerkenTheme.secondaryText)
                                    .frame(width: 32, height: 32)
                            }
                        }
                    }

                    // English word
                    VStack(spacing: 4) {
                        Text(word.english)
                            .font(.title.bold())
                            .foregroundStyle(MerkenTheme.primaryText)
                            .multilineTextAlignment(.center)
                        if let pronunciation = word.pronunciation, !pronunciation.isEmpty {
                            Text(pronunciation)
                                .font(.subheadline)
                                .foregroundStyle(MerkenTheme.mutedText)
                        }
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 8)

                    // Japanese translation
                    Text(word.japanese)
                        .font(.title3)
                        .foregroundStyle(MerkenTheme.secondaryText)
                        .multilineTextAlignment(.center)
                        .frame(maxWidth: .infinity)
                }
            }

            // Navigation: prev / dictionary / next
            HStack(spacing: 12) {
                Button {
                    withAnimation(.easeOut(duration: 0.2)) {
                        previewIndex = safePreviewIndex > 0
                            ? safePreviewIndex - 1
                            : viewModel.allWords.count - 1
                    }
                } label: {
                    Image(systemName: "chevron.left")
                        .font(.subheadline.bold())
                        .foregroundStyle(MerkenTheme.primaryText)
                        .frame(width: 44, height: 44)
                        .background(MerkenTheme.surface, in: .circle)
                        .overlay(Circle().stroke(MerkenTheme.border, lineWidth: 1.5))
                }

                Button {
                    let encoded = word.english.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? word.english
                    if let url = URL(string: "https://eow.alc.co.jp/search?q=\(encoded)") {
                        dictionaryURL = url
                    }
                } label: {
                    HStack(spacing: 6) {
                        Image(systemName: "book")
                            .font(.subheadline)
                        Text("辞書")
                            .font(.subheadline.bold())
                    }
                    .foregroundStyle(MerkenTheme.primaryText)
                    .padding(.horizontal, 20)
                    .frame(height: 44)
                    .background(MerkenTheme.surface, in: .capsule)
                    .overlay(Capsule().stroke(MerkenTheme.border, lineWidth: 1.5))
                }

                Button {
                    withAnimation(.easeOut(duration: 0.2)) {
                        previewIndex = safePreviewIndex < viewModel.allWords.count - 1
                            ? safePreviewIndex + 1
                            : 0
                    }
                } label: {
                    Image(systemName: "chevron.right")
                        .font(.subheadline.bold())
                        .foregroundStyle(MerkenTheme.primaryText)
                        .frame(width: 44, height: 44)
                        .background(MerkenTheme.surface, in: .circle)
                        .overlay(Circle().stroke(MerkenTheme.border, lineWidth: 1.5))
                }
            }
        }
    }

    private func speakWord(_ text: String) {
        let utterance = AVSpeechUtterance(string: text)
        utterance.voice = AVSpeechSynthesisVoice(language: "en-US")
        utterance.rate = 0.45
        AVSpeechSynthesizer().speak(utterance)
    }

    // MARK: - Learning Modes (2-column grid, matching ProjectDetailView)

    private var learningModesSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("学習モード")
                .font(.headline)
                .foregroundStyle(MerkenTheme.primaryText)

            let columns = [
                GridItem(.flexible(), spacing: 12),
                GridItem(.flexible(), spacing: 12)
            ]
            LazyVGrid(columns: columns, spacing: 12) {
                learningModeCard(
                    icon: "questionmark.square.fill",
                    iconColor: MerkenTheme.accentBlue,
                    title: "クイズ",
                    subtitle: "4択で確認"
                ) {
                    quizDestination = QuizDestination(collectionId: collection.id)
                }

                learningModeCard(
                    icon: "scope",
                    iconColor: MerkenTheme.success,
                    title: "クイズ2",
                    subtitle: "思い出して評価"
                ) {
                    quiz2Destination = Quiz2Destination(collectionId: collection.id)
                }

                learningModeCard(
                    icon: "rectangle.on.rectangle.angled",
                    iconColor: MerkenTheme.warning,
                    title: "フラッシュカード",
                    subtitle: "めくって学習"
                ) {
                    flashcardDestination = FlashcardDestination(collectionId: collection.id)
                }

                if appState.isPro {
                    learningModeCard(
                        icon: "text.bubble.fill",
                        iconColor: .purple,
                        title: "例文",
                        subtitle: "文脈で理解"
                    ) {
                        sentenceQuizDestination = SentenceQuizDestination(collectionId: collection.id)
                    }
                }
            }
        }
    }

    private func learningModeCard(icon: String, iconColor: Color, title: String, subtitle: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            VStack(alignment: .leading, spacing: 10) {
                IconBadge(systemName: icon, color: iconColor, size: 48)

                Text(title)
                    .font(.headline.bold())
                    .foregroundStyle(MerkenTheme.primaryText)
                Text(subtitle)
                    .font(.caption)
                    .foregroundStyle(MerkenTheme.mutedText)
            }
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(MerkenTheme.surface, in: .rect(cornerRadius: 20))
            .overlay(
                RoundedRectangle(cornerRadius: 20)
                    .stroke(MerkenTheme.border, lineWidth: 1.5)
            )
            .background(
                RoundedRectangle(cornerRadius: 20)
                    .fill(MerkenTheme.border)
                    .offset(y: 3)
            )
        }
    }

    // MARK: - Word List (compact summary → navigates to full list)

    private var wordListSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Button {
                showingWordList = true
            } label: {
                SolidCard {
                    HStack {
                        IconBadge(systemName: "list.bullet", color: MerkenTheme.accentBlue, size: 32)
                        VStack(alignment: .leading, spacing: 0) {
                            Text("単語一覧")
                                .font(.headline)
                                .foregroundStyle(MerkenTheme.primaryText)
                            Text("\(viewModel.allWords.count)語 / 習得 \(viewModel.masteredCount)語 / 復習 \(viewModel.reviewCount)語")
                                .font(.caption)
                                .foregroundStyle(MerkenTheme.mutedText)
                        }
                        Spacer()
                        Image(systemName: "chevron.right")
                            .font(.subheadline)
                            .foregroundStyle(MerkenTheme.mutedText)
                    }
                }
            }
        }
    }

    // MARK: - Member Projects

    private var memberProjectsSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text("所属する単語帳")
                    .font(.headline)
                    .foregroundStyle(MerkenTheme.primaryText)
                Spacer()
                Button {
                    showingAddProjects = true
                } label: {
                    HStack(spacing: 4) {
                        Image(systemName: "plus")
                            .font(.caption.bold())
                        Text("追加")
                            .font(.subheadline.bold())
                    }
                    .foregroundStyle(.white)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 8)
                    .background(MerkenTheme.accentBlue, in: .capsule)
                }
            }

            if viewModel.projects.isEmpty {
                SolidCard {
                    Text("まだ単語帳が追加されていません")
                        .foregroundStyle(MerkenTheme.secondaryText)
                }
            } else {
                ForEach(viewModel.projects) { project in
                    memberProjectRow(project)
                }
            }
        }
    }

    private func memberProjectRow(_ project: Project) -> some View {
        SolidPane {
            HStack(spacing: 12) {
                // Thumbnail
                ZStack {
                    RoundedRectangle(cornerRadius: 10)
                        .fill(MerkenTheme.placeholderColor(for: project.id))
                        .frame(width: 40, height: 40)
                    Text(String(project.title.prefix(1)))
                        .font(.headline.bold())
                        .foregroundStyle(.white)
                }

                VStack(alignment: .leading, spacing: 2) {
                    Text(project.title)
                        .font(.subheadline.weight(.medium))
                        .foregroundStyle(MerkenTheme.primaryText)
                        .lineLimit(1)
                    let count = viewModel.allWords.filter { $0.projectId == project.id }.count
                    Text("\(count)語")
                        .font(.caption)
                        .foregroundStyle(MerkenTheme.mutedText)
                }

                Spacer()

                Button {
                    Task {
                        await viewModel.removeProject(collectionId: collection.id, projectId: project.id, using: appState)
                    }
                } label: {
                    Image(systemName: "minus.circle")
                        .foregroundStyle(MerkenTheme.danger)
                }
            }
        }
    }

    // MARK: - Edit Sheet

    private var editSheet: some View {
        NavigationStack {
            ZStack {
                AppBackground()

                VStack(alignment: .leading, spacing: 14) {
                    Text("本棚を編集")
                        .font(.title3.bold())
                        .foregroundStyle(MerkenTheme.primaryText)

                    TextField("名前", text: $editedName)
                        .textFieldStyle(.plain)
                        .solidTextField(cornerRadius: 16)

                    TextField("説明（任意）", text: $editedDescription)
                        .textFieldStyle(.plain)
                        .solidTextField(cornerRadius: 16)

                    Button("保存") {
                        Task {
                            await viewModel.updateCollection(
                                id: collection.id,
                                name: editedName,
                                description: editedDescription.isEmpty ? nil : editedDescription,
                                using: appState
                            )
                            isEditingName = false
                        }
                    }
                    .buttonStyle(PrimaryGlassButton())
                    .disabled(editedName.trimmingCharacters(in: .whitespaces).isEmpty)

                    Spacer()
                }
                .padding(16)
            }
        }
    }
}

// MARK: - Bookshelf Word List (full-page, matching WordListView)

struct BookshelfWordListView: View {
    let collection: Collection

    @EnvironmentObject private var appState: AppState
    @StateObject private var viewModel = BookshelfDetailViewModel()

    @State private var searchText = ""
    @State private var selectedStatus: WordStatus?

    private var filteredWords: [Word] {
        viewModel.allWords.filter { word in
            if let status = selectedStatus, word.status != status {
                return false
            }
            if !searchText.isEmpty {
                return word.english.localizedCaseInsensitiveContains(searchText)
                    || word.japanese.localizedCaseInsensitiveContains(searchText)
            }
            return true
        }
    }

    var body: some View {
        ZStack {
            AppBackground()

            VStack(spacing: 0) {
                // Fixed header
                headerSection
                    .padding(.horizontal, 16)
                    .padding(.top, 4)
                    .padding(.bottom, 10)
                    .stickyHeaderStyle()

                ScrollView {
                    VStack(alignment: .leading, spacing: 12) {
                        searchBar
                        statusChips

                        if filteredWords.isEmpty {
                            SolidCard {
                                Text(searchText.isEmpty
                                     ? "単語がありません。単語帳を追加してください。"
                                     : "「\(searchText)」に一致する単語がありません。")
                                    .foregroundStyle(MerkenTheme.secondaryText)
                            }
                        }

                        ForEach(filteredWords) { word in
                            wordRow(word)
                        }
                    }
                    .padding(.horizontal, 16)
                    .padding(.bottom, 16)
                }
                .refreshable {
                    await viewModel.load(collectionId: collection.id, using: appState)
                }
            }
        }
        .navigationBarTitleDisplayMode(.inline)
        .toolbarBackground(.visible, for: .navigationBar)
        .task(id: "\(appState.repositoryMode)-\(appState.dataVersion)") {
            await viewModel.load(collectionId: collection.id, using: appState)
        }
    }

    private var headerSection: some View {
        HStack(alignment: .top) {
            VStack(alignment: .leading, spacing: 2) {
                Text("単語一覧")
                    .font(.system(size: 28, weight: .bold))
                    .foregroundStyle(MerkenTheme.primaryText)
                Text("\(viewModel.allWords.count)語")
                    .font(.subheadline)
                    .foregroundStyle(MerkenTheme.mutedText)
            }
            Spacer()
        }
    }

    private var searchBar: some View {
        HStack(spacing: 8) {
            Image(systemName: "magnifyingglass")
                .foregroundStyle(MerkenTheme.mutedText)
            TextField("単語を検索...", text: $searchText)
                .textFieldStyle(.plain)
            if !searchText.isEmpty {
                Button {
                    searchText = ""
                } label: {
                    Image(systemName: "xmark.circle.fill")
                        .foregroundStyle(MerkenTheme.mutedText)
                }
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
        .background(MerkenTheme.surface, in: .rect(cornerRadius: 20))
        .overlay(
            RoundedRectangle(cornerRadius: 20)
                .stroke(MerkenTheme.borderLight, lineWidth: 1.5)
        )
    }

    private var statusChips: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 6) {
                statusChip(label: "すべて", status: nil)
                statusChip(label: "新規", status: .new)
                statusChip(label: "復習", status: .review)
                statusChip(label: "習得", status: .mastered)
            }
        }
    }

    private func statusChip(label: String, status: WordStatus?) -> some View {
        let isActive = selectedStatus == status
        let count: Int = {
            if let s = status {
                return viewModel.allWords.filter { $0.status == s }.count
            }
            return viewModel.allWords.count
        }()

        return Button {
            selectedStatus = status
        } label: {
            HStack(spacing: 3) {
                Text(label)
                    .font(.caption)
                    .lineLimit(1)
                Text("\(count)")
                    .font(.caption2.bold())
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 6)
            .foregroundStyle(isActive ? .white : MerkenTheme.secondaryText)
            .background(
                isActive ? MerkenTheme.accentBlue : MerkenTheme.surface,
                in: .capsule
            )
            .overlay(
                Capsule().stroke(
                    isActive ? Color.clear : MerkenTheme.borderLight,
                    lineWidth: 1
                )
            )
        }
    }

    private func wordRow(_ word: Word) -> some View {
        SolidPane {
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    HStack(spacing: 6) {
                        Text(word.english)
                            .font(.headline)
                            .foregroundStyle(MerkenTheme.primaryText)
                        Text(word.status.rawValue)
                            .font(.caption2.bold())
                            .foregroundStyle(.white)
                            .padding(.horizontal, 6)
                            .padding(.vertical, 2)
                            .background(statusColor(word.status), in: .capsule)
                    }
                    Text(word.japanese)
                        .font(.subheadline)
                        .foregroundStyle(MerkenTheme.secondaryText)
                }
                Spacer()
                if word.isFavorite {
                    Image(systemName: "flag.fill")
                        .foregroundStyle(MerkenTheme.accentBlue)
                        .font(.caption)
                }
            }
        }
    }

    private func statusColor(_ status: WordStatus) -> Color {
        switch status {
        case .new: return MerkenTheme.warning
        case .review: return MerkenTheme.accentBlue
        case .mastered: return MerkenTheme.success
        }
    }
}

// MARK: - Add Projects Sheet

struct AddProjectsSheet: View {
    let collectionId: String
    let existingProjectIds: Set<String>
    let onComplete: () async -> Void

    @EnvironmentObject private var appState: AppState
    @Environment(\.dismiss) private var dismiss
    @State private var allProjects: [Project] = []
    @State private var selectedIds: Set<String> = []
    @State private var loading = false

    var body: some View {
        NavigationStack {
            ZStack {
                AppBackground()

                if loading && allProjects.isEmpty {
                    ProgressView()
                        .tint(MerkenTheme.accentBlue)
                } else {
                    ScrollView {
                        LazyVStack(spacing: 10) {
                            let available = allProjects.filter { !existingProjectIds.contains($0.id) }

                            if available.isEmpty {
                                SolidCard {
                                    Text("追加できる単語帳がありません。")
                                        .foregroundStyle(MerkenTheme.mutedText)
                                }
                            } else {
                                ForEach(available) { project in
                                    SolidPane {
                                        HStack {
                                            Image(systemName: selectedIds.contains(project.id) ? "checkmark.circle.fill" : "circle")
                                                .foregroundStyle(selectedIds.contains(project.id) ? MerkenTheme.accentBlue : MerkenTheme.secondaryText)
                                            Text(project.title)
                                                .foregroundStyle(MerkenTheme.primaryText)
                                            Spacer()
                                        }
                                    }
                                    .contentShape(.rect)
                                    .onTapGesture {
                                        if selectedIds.contains(project.id) {
                                            selectedIds.remove(project.id)
                                        } else {
                                            selectedIds.insert(project.id)
                                        }
                                    }
                                }
                            }
                        }
                        .padding(16)
                    }
                }
            }
            .navigationTitle("単語帳を追加")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("キャンセル") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("追加") {
                        Task {
                            loading = true
                            try? await appState.collectionRepository.addProjects(
                                collectionId: collectionId,
                                projectIds: Array(selectedIds)
                            )
                            await onComplete()
                            dismiss()
                        }
                    }
                    .disabled(selectedIds.isEmpty)
                    .foregroundStyle(MerkenTheme.accentBlue)
                }
            }
            .task {
                loading = true
                let projects = try? await appState.activeRepository.fetchProjects(userId: appState.activeUserId)
                allProjects = projects ?? []
                loading = false
            }
        }
    }
}
