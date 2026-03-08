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
    @State private var showFullScreenWord = false

    @State private var previewIndex = 0
    @State private var showingWordList = false
    @State private var statsPage = 0
    @State private var filteredWordListStatus: WordStatus?
    @State private var showingFilteredWordList = false
    @State private var showingDeleteConfirm = false
    @State private var showMemberProjects = false

    /// Dummy project used as a container for quiz/flashcard navigation
    private var dummyProject: Project {
        Project(
            id: collection.id,
            userId: collection.userId,
            title: collection.name
        )
    }

    private var thumbnailProject: Project? {
        viewModel.projects.first(where: { $0.iconImage != nil }) ?? viewModel.projects.first
    }

    private var thumbnailBackgroundColor: Color {
        if thumbnailProject?.iconImage != nil {
            return Color(red: 0.15, green: 0.15, blue: 0.18)
        }
        return MerkenTheme.placeholderColor(for: collection.id, isDark: colorScheme == .dark)
    }

    var body: some View {
        ZStack(alignment: .bottom) {
            VStack(spacing: 0) {
                thumbnailBackgroundColor
                MerkenTheme.background
            }
            .ignoresSafeArea()

            ScrollView {
                VStack(spacing: 0) {
                    collectionThumbnailHeader

                    VStack(alignment: .leading, spacing: 16) {
                        HStack(alignment: .firstTextBaseline) {
                            Text(viewModel.collection?.name ?? collection.name)
                                .font(.system(size: 24, weight: .bold))
                                .foregroundStyle(MerkenTheme.primaryText)
                                .lineLimit(2)
                            Spacer()
                            HStack(alignment: .firstTextBaseline, spacing: 2) {
                                Text("\(viewModel.allWords.count)")
                                    .font(.system(size: 22, weight: .bold))
                                    .monospacedDigit()
                                    .foregroundStyle(MerkenTheme.primaryText)
                                Text("語")
                                    .font(.system(size: 13, weight: .semibold))
                                    .foregroundStyle(MerkenTheme.secondaryText)
                            }
                        }
                        .padding(.bottom, 24)

                        if let errorMessage = viewModel.errorMessage {
                            SolidCard {
                                Text(errorMessage)
                                    .foregroundStyle(MerkenTheme.warning)
                            }
                        }

                        bookshelfStatsSection
                        learningModesSection
                        memberProjectsSection
                    }
                    .padding(20)
                    .padding(.bottom, 80)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(
                        UnevenRoundedRectangle(
                            topLeadingRadius: 24,
                            bottomLeadingRadius: 0,
                            bottomTrailingRadius: 0,
                            topTrailingRadius: 24
                        )
                        .fill(MerkenTheme.background)
                    )
                    .clipShape(
                        UnevenRoundedRectangle(
                            topLeadingRadius: 24,
                            bottomLeadingRadius: 0,
                            bottomTrailingRadius: 0,
                            topTrailingRadius: 24
                        )
                    )
                    .padding(.top, -100)
                }
            }
            .scrollIndicators(.hidden)
            .ignoresSafeArea(.container, edges: .top)
            .refreshable {
                await viewModel.load(collectionId: collection.id, using: appState)
            }

            bottomActionBar
        }
        .navigationBarTitleDisplayMode(.inline)
        .toolbarBackground(.hidden, for: .navigationBar)
        .navigationBarBackButtonHidden(true)
        .toolbar(.hidden, for: .navigationBar)
        .overlay(alignment: .top) {
            topButtonsOverlay
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
        .fullScreenCover(isPresented: $showingWordList) {
            NavigationStack {
                BookshelfWordListView(collection: collection)
                    .toolbar {
                        ToolbarItem(placement: .cancellationAction) {
                            Button {
                                showingWordList = false
                            } label: {
                                Image(systemName: "xmark")
                                    .font(.system(size: 14, weight: .semibold))
                                    .foregroundStyle(MerkenTheme.secondaryText)
                            }
                        }
                    }
            }
        }
        .fullScreenCover(item: $flashcardDestination) { project in
            NavigationStack {
                FlashcardView(project: project, preloadedWords: viewModel.allWords)
            }
        }
        .fullScreenCover(isPresented: $showFullScreenWord) {
            fullScreenWordView
        }
        .fullScreenCover(isPresented: $showingFilteredWordList) {
            NavigationStack {
                BookshelfWordListView(collection: collection, initialStatus: filteredWordListStatus)
                    .toolbar {
                        ToolbarItem(placement: .cancellationAction) {
                            Button {
                                showingFilteredWordList = false
                            } label: {
                                Image(systemName: "xmark")
                                    .font(.system(size: 14, weight: .semibold))
                                    .foregroundStyle(MerkenTheme.secondaryText)
                            }
                        }
                    }
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
        .onAppear { appState.tabBarVisible = false }
        .onDisappear {
            if flashcardDestination == nil &&
                quiz2Destination == nil &&
                !showTimeAttack &&
                !showMatchGame &&
                !showFullScreenWord &&
                !showingWordList &&
                !showingFilteredWordList {
                appState.tabBarVisible = true
            }
        }
    }

    private var topButtonsOverlay: some View {
        HStack {
            Button { dismiss() } label: {
                Image(systemName: "chevron.left")
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(.white)
                    .frame(width: 44, height: 44)
                    .background(Color.black.opacity(0.35), in: .circle)
            }

            Spacer()

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
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(.white)
                    .frame(width: 44, height: 44)
                    .background(Color.black.opacity(0.35), in: .circle)
            }
        }
        .padding(.horizontal, 16)
        .padding(.top, 4)
    }

    private var collectionThumbnailHeader: some View {
        ZStack {
            if let iconImage = thumbnailProject?.iconImage,
               let uiImage = ImageCompressor.decodeBase64Image(iconImage) {
                Image(uiImage: uiImage)
                    .resizable()
                    .scaledToFill()
            } else {
                thumbnailBackgroundColor
                VStack(spacing: 10) {
                    Image(systemName: "books.vertical.fill")
                        .font(.system(size: 44, weight: .medium))
                        .foregroundStyle(.white.opacity(0.75))
                    Text(String((viewModel.collection?.name ?? collection.name).prefix(1)))
                        .font(.system(size: 34, weight: .bold))
                        .foregroundStyle(.white.opacity(0.72))
                }
            }

            LinearGradient(
                colors: [
                    Color.black.opacity(0.12),
                    Color.black.opacity(0.02)
                ],
                startPoint: .top,
                endPoint: .bottom
            )
        }
        .frame(maxWidth: .infinity)
        .frame(height: 300)
        .contentShape(Rectangle())
        .clipped()
    }

    private var bookshelfStatsSection: some View {
        let words = viewModel.allWords
        let widgets = HomeViewModel.topHomePartOfSpeechWidgets(for: words)
        let masteredCount = words.filter { $0.status == .mastered }.count
        let reviewCount = words.filter { $0.status == .review }.count
        let newCount = words.filter { $0.status == .new }.count
        let total = words.count

        return VStack(spacing: 8) {
            TabView(selection: $statsPage) {
                Group {
                    if !widgets.isEmpty {
                        HStack(alignment: .top, spacing: 10) {
                            ForEach(widgets) { widget in
                                bookshelfPartOfSpeechCard(widget)
                            }
                        }
                    } else {
                        HStack(alignment: .top, spacing: 10) {
                            masteryCard(
                                label: "習得",
                                count: masteredCount,
                                total: total,
                                color: MerkenTheme.success,
                                icon: "checkmark.seal.fill"
                            )
                            masteryCard(
                                label: "学習中",
                                count: reviewCount,
                                total: total,
                                color: MerkenTheme.accentBlue,
                                icon: "arrow.trianglehead.2.clockwise"
                            )
                            masteryCard(
                                label: "未学習",
                                count: newCount,
                                total: total,
                                color: MerkenTheme.mutedText,
                                icon: "sparkle"
                            )
                        }
                    }
                }
                .tag(0)

                HStack(alignment: .top, spacing: 10) {
                    Button {
                        filteredWordListStatus = .mastered
                        showingFilteredWordList = true
                    } label: {
                        masteryCard(
                            label: "習得",
                            count: masteredCount,
                            total: total,
                            color: MerkenTheme.success,
                            icon: "checkmark.seal.fill"
                        )
                    }
                    .buttonStyle(.plain)

                    Button {
                        filteredWordListStatus = .review
                        showingFilteredWordList = true
                    } label: {
                        masteryCard(
                            label: "学習中",
                            count: reviewCount,
                            total: total,
                            color: MerkenTheme.accentBlue,
                            icon: "arrow.trianglehead.2.clockwise"
                        )
                    }
                    .buttonStyle(.plain)

                    Button {
                        filteredWordListStatus = .new
                        showingFilteredWordList = true
                    } label: {
                        masteryCard(
                            label: "未学習",
                            count: newCount,
                            total: total,
                            color: MerkenTheme.mutedText,
                            icon: "sparkle"
                        )
                    }
                    .buttonStyle(.plain)
                }
                .tag(1)
            }
            .tabViewStyle(.page(indexDisplayMode: .never))
            .frame(height: 130)

            HStack(spacing: 6) {
                ForEach(0..<2, id: \.self) { page in
                    Circle()
                        .fill(statsPage == page ? MerkenTheme.accentBlue : MerkenTheme.borderLight)
                        .frame(width: 6, height: 6)
                }
            }
        }
    }

    private func masteryCard(label: String, count: Int, total: Int, color: Color, icon: String) -> some View {
        let progress: CGFloat = total > 0 ? CGFloat(count) / CGFloat(total) : 0

        return VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .firstTextBaseline, spacing: 0) {
                Text("\(count)")
                    .foregroundStyle(MerkenTheme.primaryText)
                Text("/\(total)語")
                    .foregroundStyle(MerkenTheme.secondaryText)
            }
            .font(.system(size: 21, weight: .bold))
            .monospacedDigit()
            .lineLimit(1)
            .minimumScaleFactor(0.6)
            .allowsTightening(true)

            Text(label)
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(MerkenTheme.secondaryText)
                .lineLimit(1)
                .minimumScaleFactor(0.8)

            Spacer(minLength: 2)

            ZStack {
                Circle()
                    .stroke(MerkenTheme.borderLight, lineWidth: 5)

                Circle()
                    .trim(from: 0, to: progress)
                    .stroke(
                        color,
                        style: StrokeStyle(lineWidth: 5, lineCap: .round)
                    )
                    .rotationEffect(.degrees(-90))

                Image(systemName: icon)
                    .font(.system(size: 17, weight: .semibold))
                    .foregroundStyle(color)
            }
            .frame(width: 54, height: 54)
            .frame(maxWidth: .infinity)
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 11)
        .frame(maxWidth: .infinity, alignment: .leading)
        .frame(height: 120)
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

    private func bookshelfPartOfSpeechCard(_ widget: HomePartOfSpeechWidget) -> some View {
        let accentColor = bookshelfPartOfSpeechAccent(for: widget.key)
        let iconName = bookshelfPartOfSpeechIcon(for: widget.key)

        return VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .firstTextBaseline, spacing: 0) {
                Text("\(widget.masteredCount)")
                    .foregroundStyle(MerkenTheme.primaryText)
                Text("/\(widget.totalCount)語")
                    .foregroundStyle(MerkenTheme.secondaryText)
            }
            .font(.system(size: 21, weight: .bold))
            .monospacedDigit()
            .lineLimit(1)
            .minimumScaleFactor(0.6)
            .allowsTightening(true)

            Text(widget.label)
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(MerkenTheme.secondaryText)
                .lineLimit(1)
                .minimumScaleFactor(0.8)

            Spacer(minLength: 2)

            ZStack {
                Circle()
                    .stroke(MerkenTheme.borderLight, lineWidth: 5)

                Circle()
                    .trim(from: 0, to: widget.progress)
                    .stroke(
                        accentColor,
                        style: StrokeStyle(lineWidth: 5, lineCap: .round)
                    )
                    .rotationEffect(.degrees(-90))

                Image(systemName: iconName)
                    .font(.system(size: 17, weight: .semibold))
                    .foregroundStyle(accentColor)
            }
            .frame(width: 54, height: 54)
            .frame(maxWidth: .infinity)
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 11)
        .frame(maxWidth: .infinity, alignment: .leading)
        .frame(height: 120)
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

    private func bookshelfPartOfSpeechAccent(for key: String) -> Color {
        switch key {
        case "noun": return MerkenTheme.chartBlue
        case "verb": return MerkenTheme.danger
        case "adjective": return MerkenTheme.warning
        case "idiom": return MerkenTheme.success
        case "phrasal_verb": return Color(red: 0.18, green: 0.68, blue: 0.62)
        case "adverb": return Color(red: 0.37, green: 0.45, blue: 0.83)
        case "preposition": return Color(red: 0.32, green: 0.52, blue: 0.74)
        case "conjunction": return Color(red: 0.84, green: 0.52, blue: 0.20)
        case "pronoun": return Color(red: 0.24, green: 0.63, blue: 0.72)
        case "determiner": return Color(red: 0.58, green: 0.49, blue: 0.84)
        case "interjection": return Color(red: 0.94, green: 0.43, blue: 0.43)
        case "auxiliary": return Color(red: 0.46, green: 0.58, blue: 0.71)
        default: return MerkenTheme.secondaryText
        }
    }

    private func bookshelfPartOfSpeechIcon(for key: String) -> String {
        switch key {
        case "noun": return "tag.fill"
        case "verb": return "bolt.fill"
        case "adjective": return "sparkles"
        case "adverb": return "gauge.with.dots.needle.50percent"
        case "idiom": return "quote.opening"
        case "phrasal_verb": return "link"
        case "preposition": return "arrow.right"
        case "conjunction": return "point.3.connected.trianglepath.dotted"
        case "pronoun": return "person.fill"
        case "determiner": return "text.book.closed.fill"
        case "interjection": return "exclamationmark.bubble.fill"
        case "auxiliary": return "gearshape.2.fill"
        default: return "square.grid.2x2.fill"
        }
    }

    private var bottomActionBar: some View {
        HStack(spacing: 12) {
            Button {
                showingWordList = true
            } label: {
                HStack(spacing: 6) {
                    Image(systemName: "list.bullet")
                        .font(.system(size: 15, weight: .medium))
                    Text("単語一覧")
                        .font(.system(size: 15, weight: .semibold))
                }
                .foregroundStyle(MerkenTheme.primaryText)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 14)
                .background(MerkenTheme.surface, in: .rect(cornerRadius: 14))
                .overlay(
                    RoundedRectangle(cornerRadius: 14)
                        .stroke(MerkenTheme.border, lineWidth: 1)
                )
            }

            Button {
                flashcardDestination = dummyProject
            } label: {
                HStack(spacing: 6) {
                    Image(systemName: "rectangle.portrait.on.rectangle.portrait")
                        .font(.system(size: 15, weight: .medium))
                    Text("フラッシュカード")
                        .font(.system(size: 15, weight: .semibold))
                }
                .foregroundStyle(.white)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 14)
                .background(MerkenTheme.accentBlue, in: .rect(cornerRadius: 14))
            }
        }
        .padding(.horizontal, 16)
        .padding(.top, 12)
        .padding(.bottom, 8)
        .background(
            Rectangle()
                .fill(.ultraThinMaterial)
                .ignoresSafeArea(.container, edges: .bottom)
        )
    }

    // MARK: - Loose-leaf Word Card

    private var safePreviewIndex: Int {
        guard !viewModel.allWords.isEmpty else { return 0 }
        return min(previewIndex, viewModel.allWords.count - 1)
    }

    private var looseLeafWordCard: some View {
        let safeIdx = min(previewIndex, max(viewModel.allWords.count - 1, 0))
        let word = viewModel.allWords[safeIdx]

        return VStack(spacing: 8) {
            HStack {
                Spacer()
                Text("\(safeIdx + 1) / \(viewModel.allWords.count)")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(MerkenTheme.mutedText)
            }

            VStack(alignment: .leading, spacing: 0) {
                HStack(spacing: 0) {
                    Rectangle()
                        .fill(Color.clear)
                        .frame(width: 40)
                    Rectangle()
                        .fill(Color.red.opacity(0.2))
                        .frame(width: 1)
                    Spacer()
                }
                .frame(height: 0)

                VStack(alignment: .leading, spacing: 16) {
                    HStack(alignment: .firstTextBaseline) {
                        Text(word.english)
                            .font(.system(size: 28, weight: .bold))
                            .foregroundStyle(MerkenTheme.primaryText)
                        Spacer()
                        HStack(spacing: 12) {
                            Button { speakWord(word.english) } label: {
                                Image(systemName: "speaker.wave.2")
                                    .font(.system(size: 16))
                                    .foregroundStyle(MerkenTheme.accentBlue)
                            }
                            Button {
                                Task { await viewModel.toggleFavorite(word: word, using: appState) }
                            } label: {
                                Image(systemName: word.isFavorite ? "heart.fill" : "heart")
                                    .font(.system(size: 16))
                                    .foregroundStyle(word.isFavorite ? MerkenTheme.danger : MerkenTheme.mutedText)
                            }
                        }
                    }

                    Text(word.japanese)
                        .font(.system(size: 18))
                        .foregroundStyle(MerkenTheme.secondaryText)

                    Rectangle()
                        .fill(MerkenTheme.border.opacity(0.3))
                        .frame(height: 1)

                    if let example = word.exampleSentence, !example.isEmpty {
                        VStack(alignment: .leading, spacing: 6) {
                            Text(example)
                                .font(.system(size: 15))
                                .foregroundStyle(MerkenTheme.primaryText)
                                .italic()
                            if let exampleJa = word.exampleSentenceJa, !exampleJa.isEmpty {
                                Text(exampleJa)
                                    .font(.system(size: 14))
                                    .foregroundStyle(MerkenTheme.mutedText)
                            }
                        }
                    } else {
                        Text("例文なし")
                            .font(.system(size: 14))
                            .foregroundStyle(MerkenTheme.mutedText)
                    }

                    HStack(spacing: 8) {
                        statusBadge(word.status)
                        if word.isFavorite {
                            Text("苦手")
                                .font(.system(size: 11, weight: .semibold))
                                .foregroundStyle(MerkenTheme.danger)
                                .padding(.horizontal, 8)
                                .padding(.vertical, 3)
                                .background(MerkenTheme.danger.opacity(0.1), in: .capsule)
                        }
                    }
                }
                .padding(20)
            }
            .background {
                VStack(spacing: 0) {
                    ForEach(0..<12, id: \.self) { _ in
                        Rectangle()
                            .fill(Color.clear)
                            .frame(height: 27)
                            .overlay(alignment: .bottom) {
                                Rectangle()
                                    .fill(MerkenTheme.accentBlue.opacity(0.06))
                                    .frame(height: 1)
                            }
                    }
                }
            }
            .clipShape(.rect(cornerRadius: 16))
            .background(Color.white, in: .rect(cornerRadius: 16))
            .overlay(
                RoundedRectangle(cornerRadius: 16)
                    .stroke(MerkenTheme.border, lineWidth: 1)
            )
            .overlay(alignment: .bottomTrailing) {
                Button { showFullScreenWord = true } label: {
                    Image(systemName: "arrow.up.left.and.arrow.down.right")
                        .font(.system(size: 13, weight: .medium))
                        .foregroundStyle(MerkenTheme.primaryText)
                        .frame(width: 32, height: 32)
                        .background(.ultraThinMaterial, in: .circle)
                }
                .padding(12)
            }
            .shadow(color: .black.opacity(0.06), radius: 4, x: 0, y: 2)
            .gesture(
                DragGesture(minimumDistance: 30, coordinateSpace: .local)
                    .onEnded { value in
                        if value.translation.width < -30 {
                            withAnimation(.easeOut(duration: 0.2)) {
                                previewIndex = safeIdx < viewModel.allWords.count - 1 ? safeIdx + 1 : 0
                            }
                        } else if value.translation.width > 30 {
                            withAnimation(.easeOut(duration: 0.2)) {
                                previewIndex = safeIdx > 0 ? safeIdx - 1 : viewModel.allWords.count - 1
                            }
                        }
                    }
            )
        }
    }

    private var fullScreenWordView: some View {
        let safeIdx = min(previewIndex, max(viewModel.allWords.count - 1, 0))
        let word = viewModel.allWords[safeIdx]

        return GeometryReader { geometry in
            let topInset = geometry.safeAreaInsets.top
            let bottomInset = geometry.safeAreaInsets.bottom

            ZStack {
                Color.white.ignoresSafeArea()
                VStack(spacing: 0) {
                    ForEach(0..<30, id: \.self) { _ in
                        Rectangle()
                            .fill(Color.clear)
                            .frame(height: 28)
                            .overlay(alignment: .bottom) {
                                Rectangle()
                                    .fill(MerkenTheme.accentBlue.opacity(0.06))
                                    .frame(height: 1)
                            }
                    }
                }
                .ignoresSafeArea()

                VStack(spacing: 0) {
                    HStack {
                        Button { showFullScreenWord = false } label: {
                            Image(systemName: "xmark")
                                .font(.system(size: 16, weight: .semibold))
                                .foregroundStyle(MerkenTheme.primaryText)
                                .frame(width: 36, height: 36)
                                .background(MerkenTheme.surfaceAlt, in: .circle)
                        }
                        Spacer()
                        Text("\(safeIdx + 1) / \(viewModel.allWords.count)")
                            .font(.system(size: 15, weight: .semibold))
                            .foregroundStyle(MerkenTheme.mutedText)
                        Spacer()
                        HStack(spacing: 16) {
                            Button { speakWord(word.english) } label: {
                                Image(systemName: "speaker.wave.2")
                                    .font(.system(size: 18))
                                    .foregroundStyle(MerkenTheme.accentBlue)
                            }
                            Button {
                                Task { await viewModel.toggleFavorite(word: word, using: appState) }
                            } label: {
                                Image(systemName: word.isFavorite ? "heart.fill" : "heart")
                                    .font(.system(size: 18))
                                    .foregroundStyle(word.isFavorite ? MerkenTheme.danger : MerkenTheme.mutedText)
                            }
                        }
                    }
                    .padding(.horizontal, 20)
                    .padding(.top, topInset + 4)
                    .padding(.bottom, 18)

                    VStack(spacing: 16) {
                        Text(word.english)
                            .font(.system(size: 40, weight: .bold))
                            .foregroundStyle(MerkenTheme.primaryText)
                            .multilineTextAlignment(.center)

                        Text(word.japanese)
                            .font(.system(size: 24))
                            .foregroundStyle(MerkenTheme.secondaryText)

                        if let example = word.exampleSentence, !example.isEmpty {
                            VStack(spacing: 8) {
                                Text(example)
                                    .font(.system(size: 18))
                                    .foregroundStyle(MerkenTheme.primaryText)
                                    .italic()
                                    .multilineTextAlignment(.center)
                                if let exampleJa = word.exampleSentenceJa, !exampleJa.isEmpty {
                                    Text(exampleJa)
                                        .font(.system(size: 16))
                                        .foregroundStyle(MerkenTheme.mutedText)
                                        .multilineTextAlignment(.center)
                                }
                            }
                            .padding(.top, 8)
                        }

                        statusBadge(word.status)
                    }
                    .padding(.horizontal, 32)
                    .padding(.top, 28)
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
                }
                .padding(.bottom, bottomInset + 32)
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
            }
        }
        .gesture(
            DragGesture(minimumDistance: 30, coordinateSpace: .local)
                .onEnded { value in
                    if value.translation.width < -30 {
                        withAnimation(.easeOut(duration: 0.2)) {
                            previewIndex = safeIdx < viewModel.allWords.count - 1 ? safeIdx + 1 : 0
                        }
                    } else if value.translation.width > 30 {
                        withAnimation(.easeOut(duration: 0.2)) {
                            previewIndex = safeIdx > 0 ? safeIdx - 1 : viewModel.allWords.count - 1
                        }
                    }
                }
        )
    }

    private func statusBadge(_ status: WordStatus) -> some View {
        let (text, color): (String, Color) = {
            switch status {
            case .mastered: return ("習得", MerkenTheme.success)
            case .review: return ("学習中", MerkenTheme.accentBlue)
            case .new: return ("未学習", MerkenTheme.mutedText)
            }
        }()
        return Text(text)
            .font(.system(size: 11, weight: .semibold))
            .foregroundStyle(color)
            .padding(.horizontal, 8)
            .padding(.vertical, 3)
            .background(color.opacity(0.1), in: .capsule)
    }

    private func speakWord(_ text: String) {
        let utterance = AVSpeechUtterance(string: text)
        utterance.voice = AVSpeechSynthesisVoice(language: "en-US")
        utterance.rate = 0.45
        AVSpeechSynthesizer().speak(utterance)
    }

    // MARK: - Learning Modes (horizontal full-width)

    private var learningModesSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("学習モード")
                .font(.system(size: 20, weight: .bold))
                .foregroundStyle(MerkenTheme.primaryText)

            VStack(spacing: 10) {
                learningModeCard(
                    icon: "scope",
                    iconColor: MerkenTheme.success,
                    title: "自己評価",
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
            HStack(spacing: 14) {
                IconBadge(systemName: icon, color: iconColor, size: 48)

                VStack(alignment: .leading, spacing: 2) {
                    Text(title)
                        .font(.system(size: 16, weight: .bold))
                        .foregroundStyle(MerkenTheme.primaryText)
                    Text(subtitle)
                        .font(.system(size: 13))
                        .foregroundStyle(MerkenTheme.mutedText)
                }

                Spacer()

                Image(systemName: "chevron.right")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(MerkenTheme.mutedText)
            }
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(MerkenTheme.surface, in: .rect(cornerRadius: 16))
            .overlay(
                RoundedRectangle(cornerRadius: 16)
                    .stroke(MerkenTheme.border, lineWidth: 1.5)
            )
            .background(
                RoundedRectangle(cornerRadius: 16)
                    .fill(MerkenTheme.border)
                    .offset(y: 3)
            )
        }
    }

    // MARK: - Member Projects (所属する単語帳)

    private var memberProjectsSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Button {
                withAnimation(.easeOut(duration: 0.2)) {
                    showMemberProjects.toggle()
                }
            } label: {
                HStack {
                    Text("所属する単語帳")
                        .font(.system(size: 20, weight: .bold))
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
    let contentScrollEnabled: Bool
    let initialStatus: WordStatus?

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

    init(collection: Collection, initialStatus: WordStatus? = nil, contentScrollEnabled: Bool = true) {
        self.collection = collection
        self.initialStatus = initialStatus
        self.contentScrollEnabled = contentScrollEnabled
        _selectedStatus = State(initialValue: initialStatus)
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
                .scrollDisabled(!contentScrollEnabled)
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
