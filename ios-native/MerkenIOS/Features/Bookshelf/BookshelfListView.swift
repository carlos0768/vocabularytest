import SwiftUI

struct BookshelfListView: View {
    @EnvironmentObject private var appState: AppState
    @StateObject private var viewModel = BookshelfListViewModel()

    @State private var showingCreateSheet = false
    @State private var selectedCollection: Collection?

    var body: some View {
        ZStack {
            AppBackground()

            VStack(spacing: 0) {
                // Fixed header
                HStack(alignment: .top) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("本棚")
                            .font(.system(size: 28, weight: .bold))
                            .foregroundStyle(MerkenTheme.primaryText)
                        Text("単語帳をまとめて管理")
                            .font(.subheadline)
                            .foregroundStyle(MerkenTheme.mutedText)
                    }
                    Spacer()
                    Button {
                        showingCreateSheet = true
                    } label: {
                        HStack(spacing: 4) {
                            Image(systemName: "plus")
                                .font(.subheadline.bold())
                            Text("新規作成")
                                .font(.subheadline.bold())
                        }
                        .foregroundStyle(.white)
                        .padding(.horizontal, 14)
                        .padding(.vertical, 8)
                        .background(MerkenTheme.accentBlue, in: .capsule)
                        .overlay(Capsule().stroke(Color.clear, lineWidth: 1))
                        .background(
                            Capsule()
                                .fill(MerkenTheme.accentBlueStrong)
                                .offset(y: 2)
                        )
                    }
                }
                .padding(.horizontal, 16)
                .padding(.top, 4)
                .padding(.bottom, 10)
                .stickyHeaderStyle()

                ScrollView {
                    VStack(alignment: .leading, spacing: 16) {
                        if let errorMessage = viewModel.errorMessage {
                            SolidCard {
                                Text(errorMessage)
                                    .foregroundStyle(MerkenTheme.warning)
                            }
                        }

                        if viewModel.collections.isEmpty, !viewModel.loading {
                            SolidCard {
                                VStack(alignment: .leading, spacing: 10) {
                                    Text("本棚がありません")
                                        .font(.headline)
                                        .foregroundStyle(MerkenTheme.primaryText)
                                    Text("「+ 新規作成」から本棚を追加してください。")
                                        .font(.subheadline)
                                        .foregroundStyle(MerkenTheme.secondaryText)
                                }
                            }
                        } else {
                            // 2-column grid
                            let columns = [
                                GridItem(.flexible(), spacing: 12),
                                GridItem(.flexible(), spacing: 12)
                            ]
                            LazyVGrid(columns: columns, spacing: 12) {
                                ForEach(viewModel.collections) { collection in
                                    collectionCard(collection)
                                        .onTapGesture {
                                            selectedCollection = collection
                                        }
                                }
                            }
                        }
                    }
                    .padding(.horizontal, 16)
                    .padding(.bottom, 16)
                }
                .refreshable {
                    await viewModel.load(using: appState)
                }
            }
        }
        .navigationBarTitleDisplayMode(.inline)
        .toolbar(.hidden, for: .navigationBar)
        .navigationDestination(item: $selectedCollection) { collection in
            BookshelfDetailView(collection: collection)
        }
        .sheet(isPresented: $showingCreateSheet) {
            CreateBookshelfSheet {
                await viewModel.load(using: appState)
            }
            .presentationDetents([.medium])
            .presentationDragIndicator(.visible)
        }
        .task(id: "\(appState.repositoryMode)-\(appState.dataVersion)") {
            await viewModel.load(using: appState)
        }
    }

    // MARK: - Collection Card (Web-matching bookshelf style)

    private func collectionCard(_ collection: Collection) -> some View {
        let stat = viewModel.stats[collection.id]
        let projectCount = stat?.projectCount ?? 0
        let wordCount = stat?.wordCount ?? 0
        let progress = stat?.progress ?? 0
        let previews = stat?.previews ?? []

        return VStack(spacing: 0) {
            // Bookshelf area — mini books
            HStack(spacing: 0) {
                if previews.isEmpty {
                    // Empty state — dashed placeholder
                    RoundedRectangle(cornerRadius: 4)
                        .strokeBorder(MerkenTheme.border, style: StrokeStyle(lineWidth: 1.5, dash: [5, 3]))
                        .frame(height: 56)
                        .frame(maxWidth: .infinity)
                        .overlay(
                            Image(systemName: "books.vertical")
                                .font(.title3)
                                .foregroundStyle(MerkenTheme.mutedText)
                        )
                } else {
                    Spacer(minLength: 0)
                    ForEach(Array(previews.enumerated()), id: \.element.id) { index, preview in
                        miniBook(preview)
                            .padding(.leading, index > 0 ? -4 : 0)
                    }

                    let extraCount = projectCount - previews.count
                    if extraCount > 0 {
                        RoundedRectangle(cornerRadius: 3)
                            .fill(MerkenTheme.surfaceAlt)
                            .frame(width: 40, height: 56)
                            .overlay(
                                RoundedRectangle(cornerRadius: 3)
                                    .stroke(MerkenTheme.border, lineWidth: 1)
                            )
                            .overlay(
                                Text("+\(extraCount)")
                                    .font(.system(size: 10, weight: .bold))
                                    .foregroundStyle(MerkenTheme.mutedText)
                            )
                            .padding(.leading, -4)
                    }
                    Spacer(minLength: 0)
                }
            }
            .frame(minHeight: 68)
            .padding(.horizontal, 8)
            .padding(.top, 8)

            // Shelf line
            Rectangle()
                .fill(MerkenTheme.border)
                .frame(height: 2)
                .padding(.horizontal, 4)
                .padding(.top, 2)

            // Title
            Text(collection.name)
                .font(.caption.weight(.semibold))
                .foregroundStyle(MerkenTheme.primaryText)
                .multilineTextAlignment(.center)
                .lineLimit(2)
                .frame(minHeight: 32)
                .padding(.horizontal, 4)
                .padding(.top, 8)

            // Stats
            HStack(spacing: 0) {
                Text("\(projectCount)冊")
                if wordCount > 0 {
                    Text(" · \(wordCount)語")
                }
                if progress > 0 {
                    Text(" · \(progress)%")
                }
            }
            .font(.system(size: 10, weight: .medium))
            .foregroundStyle(MerkenTheme.mutedText)
            .padding(.bottom, 10)
        }
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

    // MARK: - Mini Book (matching Web MiniBook component)

    private func miniBook(_ preview: CollectionProjectPreview) -> some View {
        let color = MerkenTheme.placeholderColor(for: preview.id)
        let initial = String(preview.title.prefix(1)).uppercased()

        return ZStack {
            if let iconImage = preview.iconImage,
               let uiImage = ImageCompressor.decodeBase64Image(iconImage) {
                // Project has a cover image
                Image(uiImage: uiImage)
                    .resizable()
                    .scaledToFill()
            } else {
                // Gradient + initial letter
                LinearGradient(
                    colors: [color, color.opacity(0.7)],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )

                // Spine shadow (left edge)
                HStack(spacing: 0) {
                    Color.black.opacity(0.15)
                        .frame(width: 2)
                    Spacer()
                }

                // Initial letter
                Text(initial)
                    .font(.system(size: 14, weight: .bold))
                    .foregroundStyle(.white.opacity(0.9))
            }
        }
        .frame(width: 40, height: 56)
        .clipShape(.rect(cornerRadius: 3))
        .shadow(color: .black.opacity(0.08), radius: 1, x: 0, y: 1)
    }
}
