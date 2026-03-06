import SwiftUI

struct BookshelfListView: View {
    @EnvironmentObject private var appState: AppState
    @Environment(\.colorScheme) private var colorScheme
    @StateObject private var viewModel = BookshelfListViewModel()

    @State private var showingCreateSheet = false
    @State private var selectedCollection: Collection?

    var body: some View {
        ZStack {
            AppBackground()

            VStack(spacing: 0) {
                ScrollView {
                    VStack(alignment: .leading, spacing: 16) {
                        Spacer().frame(height: 4)

                        Text("本棚")
                            .font(.system(size: 28, weight: .bold))
                            .foregroundStyle(MerkenTheme.primaryText)
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
                            HStack {
                                Text("すべての本棚")
                                    .font(.subheadline.bold())
                                    .foregroundStyle(MerkenTheme.primaryText)
                                Spacer()
                                Text("\(viewModel.collections.count)件")
                                    .font(.caption)
                                    .foregroundStyle(MerkenTheme.mutedText)
                            }

                            // 3-column grid (matching ProjectListView)
                            let columns = [
                                GridItem(.flexible(), spacing: 18),
                                GridItem(.flexible(), spacing: 18),
                                GridItem(.flexible(), spacing: 18)
                            ]
                            LazyVGrid(columns: columns, spacing: 14) {
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

            // Floating + button (liquid glass)
            VStack {
                Spacer()
                HStack {
                    Spacer()
                    Button {
                        showingCreateSheet = true
                    } label: {
                        let baseLabel = Image(systemName: "plus")
                            .font(.system(size: 24, weight: .semibold))
                            .foregroundStyle(MerkenTheme.accentBlue)
                            .frame(width: 56, height: 56)
                        if #available(iOS 26.0, *) {
                            baseLabel
                                .glassEffect(.regular.interactive())
                                .clipShape(.circle)
                        } else {
                            baseLabel
                                .background(.ultraThinMaterial, in: .circle)
                        }
                    }
                    .shadow(color: .black.opacity(0.15), radius: 8, x: 0, y: 4)
                    .padding(.trailing, 20)
                    .padding(.bottom, 16)
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
        let statsLoaded = stat != nil
        let projectCount = stat?.projectCount ?? 0
        let previews = stat?.previews ?? []

        return VStack(spacing: 0) {
            // Bookshelf area — mini books
            HStack(spacing: 0) {
                if !statsLoaded {
                    // Loading state — show shimmer placeholder
                    RoundedRectangle(cornerRadius: 4)
                        .fill(MerkenTheme.surfaceAlt)
                        .frame(height: 56)
                        .frame(maxWidth: .infinity)
                        .overlay(
                            ProgressView()
                                .tint(MerkenTheme.mutedText)
                                .scaleEffect(0.7)
                        )
                } else if previews.isEmpty {
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
                    GeometryReader { geo in
                        let overlap: CGFloat = 4
                        let visiblePreviews = Array(previews.prefix(3))
                        let extraCount = max(projectCount - visiblePreviews.count, 0)
                        let totalItems = visiblePreviews.count + (extraCount > 0 ? 1 : 0)
                        let rawWidth = totalItems > 0
                            ? (geo.size.width + overlap * CGFloat(max(totalItems - 1, 0))) / CGFloat(totalItems)
                            : 40
                        let bookWidth = min(40, max(24, floor(rawWidth)))

                        HStack(spacing: 0) {
                            Spacer(minLength: 0)
                            ForEach(Array(visiblePreviews.enumerated()), id: \.element.id) { index, preview in
                                miniBook(preview, width: bookWidth)
                                    .padding(.leading, index > 0 ? -overlap : 0)
                            }

                            if extraCount > 0 {
                                RoundedRectangle(cornerRadius: 3)
                                    .fill(MerkenTheme.surfaceAlt)
                                    .frame(width: bookWidth, height: 56)
                                    .overlay(
                                        RoundedRectangle(cornerRadius: 3)
                                            .stroke(MerkenTheme.border, lineWidth: 1)
                                    )
                                    .overlay(
                                        Text("+\(extraCount)")
                                            .font(.system(size: 10, weight: .bold))
                                            .foregroundStyle(MerkenTheme.mutedText)
                                    )
                                    .padding(.leading, -overlap)
                            }
                            Spacer(minLength: 0)
                        }
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                        .clipped()
                    }
                    .frame(height: 56)
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
        .frame(maxWidth: .infinity)
    }

    // MARK: - Mini Book (matching Web MiniBook component)

    private func miniBook(_ preview: CollectionProjectPreview, width: CGFloat = 40) -> some View {
        let color = MerkenTheme.placeholderColor(for: preview.id, isDark: colorScheme == .dark)
        let initial = String(preview.title.prefix(1)).uppercased()

        return ZStack {
            if let iconImage = preview.iconImage,
               let uiImage = ImageCompressor.decodeBase64Image(
                iconImage,
                cacheKey: preview.iconImageCacheKey
               ) {
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
        .frame(width: width, height: 56)
        .clipShape(.rect(cornerRadius: 3))
        .shadow(color: .black.opacity(0.08), radius: 1, x: 0, y: 1)
    }
}
