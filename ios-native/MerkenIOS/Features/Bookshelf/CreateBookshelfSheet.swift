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

    private var canSubmit: Bool {
        !name.trimmingCharacters(in: .whitespaces).isEmpty && !saving
    }

    var body: some View {
        NavigationStack {
            ZStack {
                AppBackground()

                ScrollView {
                    VStack(alignment: .leading, spacing: 14) {
                        SolidCard {
                            HStack(spacing: 14) {
                                IconBadge(systemName: "books.vertical.fill", color: MerkenTheme.accentBlue, size: 52)

                                VStack(alignment: .leading, spacing: 4) {
                                    Text("新しい本棚を作成")
                                        .font(.system(size: 18, weight: .bold))
                                        .foregroundStyle(MerkenTheme.primaryText)
                                    Text("複数の単語帳を1つにまとめて整理・学習できます。")
                                        .font(.system(size: 13, weight: .medium))
                                        .foregroundStyle(MerkenTheme.secondaryText)
                                        .lineSpacing(2)
                                }

                                Spacer(minLength: 0)
                            }
                        }

                        sectionLabel("基本情報")

                        TextField("名前（例: 期末テスト対策）", text: $name)
                            .textFieldStyle(.plain)
                            .solidTextField(cornerRadius: 16)

                        TextField("説明（任意）", text: $description)
                            .textFieldStyle(.plain)
                            .solidTextField(cornerRadius: 16)

                        if !allProjects.isEmpty {
                            HStack {
                                sectionLabel("単語帳を選択")
                                Spacer()
                                Text("\(selectedProjectIds.count)冊")
                                    .font(.system(size: 12, weight: .semibold))
                                    .foregroundStyle(MerkenTheme.secondaryText)
                                    .padding(.horizontal, 10)
                                    .padding(.vertical, 6)
                                    .background(MerkenTheme.surfaceAlt, in: Capsule())
                            }

                            ForEach(allProjects) { project in
                                let isSelected = selectedProjectIds.contains(project.id)
                                SolidPane {
                                    HStack(spacing: 12) {
                                        Image(systemName: isSelected ? "checkmark.circle.fill" : "circle")
                                            .font(.title3)
                                            .foregroundStyle(isSelected ? MerkenTheme.accentBlue : MerkenTheme.secondaryText)

                                        // Thumbnail
                                        projectThumbnailView(project)

                                        VStack(alignment: .leading, spacing: 2) {
                                            Text(project.title)
                                                .font(.system(size: 15, weight: .medium))
                                                .foregroundStyle(MerkenTheme.primaryText)
                                                .lineLimit(1)
                                            Text(isSelected ? "追加予定" : "タップで追加")
                                                .font(.system(size: 12, weight: .medium))
                                                .foregroundStyle(isSelected ? MerkenTheme.accentBlue : MerkenTheme.secondaryText)
                                        }

                                        Spacer()
                                    }
                                }
                                .contentShape(.rect)
                                .onTapGesture {
                                    if isSelected {
                                        selectedProjectIds.remove(project.id)
                                    } else {
                                        selectedProjectIds.insert(project.id)
                                    }
                                }
                            }
                        }
                    }
                    .padding(16)
                }
            }
            .navigationTitle("新しい本棚")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        Task {
                            await createBookshelf()
                        }
                    } label: {
                        if saving {
                            ProgressView()
                                .controlSize(.small)
                        } else {
                            Text("作成")
                                .fontWeight(.semibold)
                        }
                    }
                    .disabled(!canSubmit)
                }
            }
            .task {
                let projects = try? await appState.activeRepository.fetchProjects(userId: appState.activeUserId)
                allProjects = projects ?? []
            }
        }
    }

    @ViewBuilder
    private func projectThumbnailView(_ project: Project) -> some View {
        if let iconImage = project.iconImage,
           let uiImage = ImageCompressor.decodeBase64Image(iconImage) {
            Image(uiImage: uiImage)
                .resizable()
                .scaledToFill()
                .frame(width: 44, height: 44)
                .clipShape(.rect(cornerRadius: 10))
        } else {
            let bgColor = MerkenTheme.placeholderColor(for: project.id)
            ZStack {
                bgColor
                Text(String(project.title.prefix(1)))
                    .font(.system(size: 18, weight: .bold))
                    .foregroundStyle(.white)
            }
            .frame(width: 44, height: 44)
            .clipShape(.rect(cornerRadius: 10))
        }
    }

    private func createBookshelf() async {
        guard canSubmit else { return }

        saving = true
        defer { saving = false }

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
            // Error will be shown via parent reload.
            dismiss()
        }
    }

    private func sectionLabel(_ title: String) -> some View {
        Text(title)
            .font(.system(size: 13, weight: .bold))
            .foregroundStyle(MerkenTheme.secondaryText)
    }
}
