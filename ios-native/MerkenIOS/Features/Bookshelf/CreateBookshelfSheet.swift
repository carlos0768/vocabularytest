import SwiftUI

struct CreateBookshelfSheet: View {
    let onComplete: () async -> Void

    @EnvironmentObject private var appState: AppState
    @Environment(\.dismiss) private var dismiss

    @State private var name: String = ""
    @State private var description: String = ""
    @State private var allProjects: [Project] = []
    @State private var selectedProjectIds: Set<String> = []
    @State private var saving = false

    var body: some View {
        NavigationStack {
            ZStack {
                AppBackground()

                ScrollView {
                    VStack(alignment: .leading, spacing: 14) {
                        Text("新しい本棚")
                            .font(.title3.bold())
                            .foregroundStyle(MerkenTheme.primaryText)

                        TextField("名前（例: 期末テスト対策）", text: $name)
                            .textFieldStyle(.plain)
                            .solidTextField(cornerRadius: 14)

                        TextField("説明（任意）", text: $description)
                            .textFieldStyle(.plain)
                            .solidTextField(cornerRadius: 14)

                        if !allProjects.isEmpty {
                            Text("単語帳を選択")
                                .font(.headline)
                                .foregroundStyle(MerkenTheme.secondaryText)

                            ForEach(allProjects) { project in
                                SolidPane {
                                    HStack {
                                        Image(systemName: selectedProjectIds.contains(project.id) ? "checkmark.circle.fill" : "circle")
                                            .foregroundStyle(selectedProjectIds.contains(project.id) ? MerkenTheme.accentBlue : MerkenTheme.secondaryText)
                                        Text(project.title)
                                            .foregroundStyle(MerkenTheme.primaryText)
                                        Spacer()
                                    }
                                }
                                .contentShape(.rect)
                                .onTapGesture {
                                    if selectedProjectIds.contains(project.id) {
                                        selectedProjectIds.remove(project.id)
                                    } else {
                                        selectedProjectIds.insert(project.id)
                                    }
                                }
                            }
                        }

                        Button("作成") {
                            Task {
                                saving = true
                                do {
                                    let created = try await appState.collectionRepository.createCollection(
                                        userId: appState.activeUserId,
                                        name: name.trimmingCharacters(in: .whitespaces),
                                        description: description.isEmpty ? nil : description
                                    )
                                    if !selectedProjectIds.isEmpty {
                                        try await appState.collectionRepository.addProjects(
                                            collectionId: created.id,
                                            projectIds: Array(selectedProjectIds)
                                        )
                                    }
                                    await onComplete()
                                    dismiss()
                                } catch {
                                    // Error will be shown via parent reload
                                    dismiss()
                                }
                                saving = false
                            }
                        }
                        .buttonStyle(PrimaryGlassButton())
                        .disabled(name.trimmingCharacters(in: .whitespaces).isEmpty || saving)

                        Spacer()
                    }
                    .padding(16)
                }
            }
            .task {
                let projects = try? await appState.activeRepository.fetchProjects(userId: appState.activeUserId)
                allProjects = projects ?? []
            }
        }
    }
}
