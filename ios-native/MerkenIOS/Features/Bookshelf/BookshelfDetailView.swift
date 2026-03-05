import SwiftUI
import AVFoundation

struct BookshelfDetailView: View {
    let collection: Collection

    @EnvironmentObject private var appState: AppState
    @StateObject private var viewModel = BookshelfDetailViewModel()
    @Environment(\.dismiss) private var dismiss
    @Environment(\.colorScheme) private var colorScheme

    @State private var isEditingName = false
    @State private var editedName: String = ""
    @State private var editedDescription: String = ""
    @State private var showingAddProjects = false

    @State private var flashcardDestination: Project?
    @State private var quiz2Destination: Project?
    @State private var showTimeAttack = false
    @State private var showMatchGame = false
    @State private var weakWordsFlashcard: Project?

    @State private var previewIndex = 0
    @State private var showingWordList = false
    @State private var dictionaryURL: URL?
    @State private var showingDeleteConfirm = false

    /// Dummy project used as a container for quiz/flashcard navigation
    private var dummyProject: Project {
        Project(
            id: collection.id,
            userId: collection.userId,
            title: collection.name
        )
    }

    var body: some View {
        ZStack {
            AppBackground()

            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    if let errorMessage = viewModel.errorMessage {
                        SolidCard {
                            Text(errorMessage)
                                .foregroundStyle(MerkenTheme.warning)
                        }
                    }

                    // Flashcard preview with navigation (full-width)
                    if !viewModel.allWords.isEmpty {
                        flashcardPreview
                    }

                    // Learning modes
                    learningModesSection

                    // Member projects
                    memberProjectsSection
                }
                .padding(16)
            }
            .scrollIndicators(.hidden)
            .refreshable {
                await viewModel.load(collectionId: collection.id, using: appState)
            }
        }
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .principal) {
                Button {
                    showingWordList = true
                } label: {
                    HStack(spacing: 4) {
                        Text(viewModel.collection?.name ?? collection.name)
                            .font(.headline)
                            .foregroundStyle(MerkenTheme.primaryText)
                            .lineLimit(1)
                        Image(systemName: "chevron.down")
                            .font(.system(size: 11, weight: .semibold))
                            .foregroundStyle(MerkenTheme.mutedText)
                    }
                }
            }
            ToolbarItem(placement: .topBarTrailing) {
                Menu {
                    Button {
                        showingAddProjects = true
                    } label: {
                        Label("単語帳を追加", systemImage: "plus")
                    }
                    Button {
                        editedName = viewModel.collection?.name ?? collection.name
                        editedDescription = viewModel.collection?.description ?? ""
                        isEditingName = true
                    } label: {
                        Label("本棚を編集", systemImage: "pencil")
                    }

                    Divider()

                    Button(role: .destructive) {
                        showingDeleteConfirm = true
                    } label: {
                        Label("本棚を削除", systemImage: "trash")
                    }
                } label: {
                    Image(systemName: "ellipsis")
                        .foregroundStyle(MerkenTheme.accentBlue)
                }
            }
        }
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
        .sheet(isPresented: $showingWordList) {
            NavigationStack {
                BookshelfWordListView(collection: collection)
            }
            .presentationDetents([.medium, .large])
            .presentationDragIndicator(.visible)
            .presentationContentInteraction(.scrolls)
        }
        .fullScreenCover(item: $flashcardDestination) { project in
            NavigationStack {
                FlashcardView(project: project, preloadedWords: viewModel.allWords)
            }
        }
        .fullScreenCover(item: $weakWordsFlashcard) { project in
            NavigationStack {
                FlashcardView(project: project, preloadedWords: weakWords)
            }
        }
        .navigationDestination(item: $quiz2Destination) { project in
            Quiz2View(project: project, preloadedWords: viewModel.allWords)
        }
        .navigationDestination(isPresented: $showTimeAttack) {
            TimeAttackView(project: dummyProject, words: viewModel.allWords)
        }
        .navigationDestination(isPresented: $showMatchGame) {
            MatchGameView(project: dummyProject, words: viewModel.allWords)
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
        .onChange(of: viewModel.allWords.count) { _ in
            if viewModel.allWords.isEmpty {
                previewIndex = 0
                return
            }
            if previewIndex >= viewModel.allWords.count {
                previewIndex = viewModel.allWords.count - 1
            }
        }
    }

    // MARK: - Flashcard Preview (full-width with fullscreen button)

    private var safePreviewIndex: Int {
        guard !viewModel.allWords.isEmpty else { return 0 }
        return min(previewIndex, viewModel.allWords.count - 1)
    }

    private var flashcardPreview: some View {
        let word = viewModel.allWords[safePreviewIndex]

        return VStack(spacing: 14) {
            // Card (full-width, with fullscreen button overlay)
            ZStack(alignment: .bottomTrailing) {
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

                // Fullscreen button overlay
                Button {
                    flashcardDestination = dummyProject
                } label: {
                    Image(systemName: "arrow.up.left.and.arrow.down.right")
                        .font(.system(size: 14, weight: .medium))
                        .foregroundStyle(MerkenTheme.primaryText)
                        .frame(width: 36, height: 36)
                        .background(.ultraThinMaterial, in: .circle)
                }
                .padding(12)
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

    // MARK: - Weak Words (苦手な単語)

    private var weakWords: [Word] {
        viewModel.allWords.filter { word in
            word.status == .review || word.easeFactor < 2.5
        }
    }

    // MARK: - Learning Modes (2-column grid, matching ProjectDetailView)

    private var learningModesSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("学習モード")
                .font(.headline)
                .foregroundStyle(MerkenTheme.primaryText)

            let columns = [
                GridItem(.flexible(), spacing: 10),
                GridItem(.flexible(), spacing: 10)
            ]
            LazyVGrid(columns: columns, spacing: 10) {
                learningModeCard(
                    icon: "scope",
                    iconColor: MerkenTheme.success,
                    title: "クイズ2",
                    subtitle: "思い出して評価"
                ) {
                    quiz2Destination = dummyProject
                }

                learningModeCard(
                    icon: "timer",
                    iconColor: .orange,
                    title: "タイムアタック",
                    subtitle: "時間内に即答"
                ) {
                    showTimeAttack = true
                }

                learningModeCard(
                    icon: "exclamationmark.triangle",
                    iconColor: MerkenTheme.danger,
                    title: "苦手な単語",
                    subtitle: weakWords.isEmpty ? "苦手な単語なし" : "\(weakWords.count)語を復習"
                ) {
                    if !weakWords.isEmpty {
                        weakWordsFlashcard = dummyProject
                    }
                }

                if viewModel.allWords.count >= 4 {
                    learningModeCard(
                        icon: "square.grid.2x2",
                        iconColor: .purple,
                        title: "マッチ",
                        subtitle: "ペアを見つけろ"
                    ) {
                        showMatchGame = true
                    }
                }
            }
        }
    }

    private func learningModeCard(icon: String, iconColor: Color, title: String, subtitle: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            VStack(alignment: .leading, spacing: 10) {
                IconBadge(systemName: icon, color: iconColor, size: 56)

                Text(title)
                    .font(.system(size: 18, weight: .bold))
                    .foregroundStyle(MerkenTheme.primaryText)
                Text(subtitle)
                    .font(.caption)
                    .foregroundStyle(MerkenTheme.mutedText)
            }
            .padding(20)
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

    // MARK: - Member Projects (所属する単語帳)

    @State private var showMemberProjects = false

    private var memberProjectsSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Button {
                withAnimation(.easeOut(duration: 0.2)) {
                    showMemberProjects.toggle()
                }
            } label: {
                HStack {
                    Text("所属する単語帳")
                        .font(.headline)
                        .foregroundStyle(MerkenTheme.primaryText)
                    Text("\(viewModel.projects.count)")
                        .font(.subheadline)
                        .foregroundStyle(MerkenTheme.mutedText)
                    Spacer()
                    Image(systemName: "chevron.right")
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(MerkenTheme.mutedText)
                        .rotationEffect(.degrees(showMemberProjects ? 90 : 0))
                }
            }

            if showMemberProjects {
                HStack {
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
    }

    private func memberProjectRow(_ project: Project) -> some View {
        SolidPane {
            HStack(spacing: 12) {
                // Thumbnail
                ZStack {
                    RoundedRectangle(cornerRadius: 10)
                        .fill(MerkenTheme.placeholderColor(for: project.id, isDark: colorScheme == .dark))
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
                ScrollView {
                    VStack(alignment: .leading, spacing: 12) {
                        Text("単語一覧")
                            .font(.system(size: 28, weight: .bold))
                            .foregroundStyle(MerkenTheme.primaryText)

                        Text("\(viewModel.allWords.count)語")
                            .font(.subheadline)
                            .foregroundStyle(MerkenTheme.mutedText)

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
        .task(id: "\(appState.repositoryMode)-\(appState.dataVersion)") {
            await viewModel.load(collectionId: collection.id, using: appState)
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
