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
                GlassEffectContainer(spacing: 10) {
                LazyVStack(alignment: .leading, spacing: 14) {
                    GlassCard {
                        VStack(alignment: .leading, spacing: 10) {
                            Text("本棚")
                                .font(.headline)
                            Text("複数の単語帳をまとめて学習できます。")
                                .font(.subheadline)
                                .foregroundStyle(MerkenTheme.secondaryText)
                        }
                    }

                    if let errorMessage = viewModel.errorMessage {
                        GlassCard {
                            Text(errorMessage)
                                .foregroundStyle(MerkenTheme.warning)
                        }
                    }

                    if viewModel.collections.isEmpty, !viewModel.loading {
                        GlassCard {
                            VStack(alignment: .leading, spacing: 10) {
                                Text("本棚がありません")
                                    .font(.headline)
                                Text("右上の「新規作成」から本棚を追加してください。")
                                    .font(.subheadline)
                                    .foregroundStyle(MerkenTheme.secondaryText)
                            }
                        }
                    } else {
                        LazyVStack(spacing: 12) {
                            ForEach(viewModel.collections) { collection in
                                GlassPane {
                                    HStack(spacing: 10) {
                                        VStack(alignment: .leading, spacing: 4) {
                                            Text(collection.name)
                                                .font(.headline)
                                                .foregroundStyle(.white)

                                            let count = viewModel.projectCounts[collection.id] ?? 0
                                            Text("\(count) 冊の単語帳")
                                                .font(.caption)
                                                .foregroundStyle(MerkenTheme.mutedText)
                                        }
                                        Spacer()
                                        Image(systemName: "trash")
                                            .foregroundStyle(MerkenTheme.danger)
                                            .onTapGesture {
                                                Task {
                                                    await viewModel.deleteCollection(id: collection.id, using: appState)
                                                }
                                            }
                                    }
                                }
                                .contentShape(.rect)
                                .onTapGesture {
                                    selectedCollection = collection
                                }
                            }
                        }
                    }
                }
                .padding(16)
                } // GlassEffectContainer
            }
            .refreshable {
                await viewModel.load(using: appState)
            }
        }
        .navigationTitle("本棚")
        .navigationDestination(item: $selectedCollection) { collection in
            BookshelfDetailView(collection: collection)
        }
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button("新規作成") {
                    showingCreateSheet = true
                }
                .foregroundStyle(MerkenTheme.accentBlue)
            }
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
}
