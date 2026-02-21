import SwiftUI

struct BookshelfListView: View {
    @EnvironmentObject private var appState: AppState
    @StateObject private var viewModel = BookshelfListViewModel()

    @State private var showingCreateSheet = false
    @State private var selectedCollection: Collection?

    var body: some View {
        ZStack {
            AppBackground()

            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    // Header
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
                            .foregroundStyle(MerkenTheme.success)
                            .padding(.horizontal, 14)
                            .padding(.vertical, 8)
                            .background(MerkenTheme.successLight, in: .capsule)
                            .overlay(Capsule().stroke(MerkenTheme.success.opacity(0.3), lineWidth: 1))
                        }
                    }

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
                .padding(16)
            }
            .refreshable {
                await viewModel.load(using: appState)
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

    private func collectionCard(_ collection: Collection) -> some View {
        SolidCard {
            VStack(alignment: .leading, spacing: 10) {
                // Thumbnail collage area
                let count = viewModel.projectCounts[collection.id] ?? 0
                HStack(spacing: 4) {
                    // Placeholder thumbnails
                    ForEach(0..<min(count, 3), id: \.self) { _ in
                        RoundedRectangle(cornerRadius: 6)
                            .fill(MerkenTheme.surfaceAlt)
                            .frame(height: 60)
                            .overlay(
                                RoundedRectangle(cornerRadius: 6)
                                    .stroke(MerkenTheme.borderLight, lineWidth: 1)
                            )
                    }
                    if count > 3 {
                        Text("+\(count - 3)")
                            .font(.caption)
                            .foregroundStyle(MerkenTheme.mutedText)
                    }
                }
                .frame(maxWidth: .infinity)
                .frame(height: 60)

                Text(collection.name)
                    .font(.headline)
                    .foregroundStyle(MerkenTheme.primaryText)
                    .lineLimit(1)

                Text("\(count)冊")
                    .font(.caption)
                    .foregroundStyle(MerkenTheme.mutedText)
            }
        }
    }
}
