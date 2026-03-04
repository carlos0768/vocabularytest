import SwiftUI

/// Sheet that lets the user add the current project to an existing bookshelf.
struct AddToBookshelfSheet: View {
    let projectId: String

    @EnvironmentObject private var appState: AppState
    @Environment(\.dismiss) private var dismiss

    @State private var collections: [Collection] = []
    @State private var memberOf: Set<String> = []
    @State private var loading = true
    @State private var saving = false

    var body: some View {
        NavigationStack {
            ZStack {
                AppBackground()

                if loading {
                    ProgressView()
                } else if collections.isEmpty {
                    VStack(spacing: 12) {
                        Image(systemName: "books.vertical")
                            .font(.largeTitle)
                            .foregroundStyle(MerkenTheme.secondaryText)
                        Text("本棚がまだありません")
                            .foregroundStyle(MerkenTheme.secondaryText)
                    }
                } else {
                    ScrollView {
                        VStack(spacing: 8) {
                            ForEach(collections) { collection in
                                let isMember = memberOf.contains(collection.id)
                                SolidPane {
                                    HStack(spacing: 12) {
                                        Image(systemName: isMember ? "checkmark.circle.fill" : "circle")
                                            .font(.title3)
                                            .foregroundStyle(isMember ? MerkenTheme.accentBlue : MerkenTheme.secondaryText)

                                        VStack(alignment: .leading, spacing: 2) {
                                            Text(collection.name)
                                                .font(.system(size: 15, weight: .medium, design: .serif))
                                                .foregroundStyle(MerkenTheme.primaryText)
                                                .lineLimit(1)
                                            if let desc = collection.description, !desc.isEmpty {
                                                Text(desc)
                                                    .font(.caption)
                                                    .foregroundStyle(MerkenTheme.secondaryText)
                                                    .lineLimit(1)
                                            }
                                        }

                                        Spacer()
                                    }
                                }
                                .contentShape(.rect)
                                .onTapGesture {
                                    Task {
                                        await toggle(collectionId: collection.id, isMember: isMember)
                                    }
                                }
                            }
                        }
                        .padding(16)
                    }
                }
            }
            .navigationTitle("本棚に追加")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("完了") {
                        dismiss()
                    }
                    .fontWeight(.semibold)
                }
            }
            .task {
                await loadData()
            }
        }
    }

    private func loadData() async {
        loading = true
        defer { loading = false }

        let userId = appState.activeUserId
        let fetched = (try? await appState.collectionRepository.fetchCollections(userId: userId)) ?? []
        collections = fetched

        // Check which collections already contain this project
        var membership: Set<String> = []
        for collection in fetched {
            let cps = (try? await appState.collectionRepository.fetchCollectionProjects(collectionId: collection.id)) ?? []
            if cps.contains(where: { $0.projectId == projectId }) {
                membership.insert(collection.id)
            }
        }
        memberOf = membership
    }

    private func toggle(collectionId: String, isMember: Bool) async {
        guard !saving else { return }
        saving = true
        defer { saving = false }

        do {
            if isMember {
                try await appState.collectionRepository.removeProject(
                    collectionId: collectionId,
                    projectId: projectId
                )
                memberOf.remove(collectionId)
            } else {
                try await appState.collectionRepository.addProjects(
                    collectionId: collectionId,
                    projectIds: [projectId]
                )
                memberOf.insert(collectionId)
            }
        } catch {
            // Silently handle — UI will reflect actual state on next load
        }
    }
}
