import SwiftUI

struct ShareImportRootView: View {
    @StateObject private var viewModel: ShareImportViewModel

    init(viewModel: ShareImportViewModel) {
        _viewModel = StateObject(wrappedValue: viewModel)
    }

    var body: some View {
        ZStack {
            LinearGradient(
                colors: [
                    Color(red: 0.03, green: 0.09, blue: 0.20),
                    Color(red: 0.02, green: 0.05, blue: 0.14)
                ],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
            .ignoresSafeArea()

            content
                .padding(16)
        }
    }

    @ViewBuilder
    private var content: some View {
        switch viewModel.phase {
        case .loading:
            loadingView
        case .loginRequired:
            loginRequiredView
        case .editing:
            editingView
        case .saving:
            savingView
        case .success(let message):
            successView(message: message)
        case .failure(let message):
            failureView(message: message)
        }
    }

    private var loadingView: some View {
        VStack(spacing: 12) {
            ProgressView()
                .tint(.white)
            Text("共有内容を準備中…")
                .foregroundStyle(.white)
                .font(.headline)
        }
        .padding(24)
        .glassEffect(in: .rect(cornerRadius: 20))
    }

    private var loginRequiredView: some View {
        VStack(spacing: 14) {
            Text("ログインが必要です")
                .font(.headline)
                .foregroundStyle(.white)

            Text("Merkenアプリでログイン後に再度共有してください。")
                .font(.subheadline)
                .foregroundStyle(.white.opacity(0.84))
                .multilineTextAlignment(.center)

            Button("閉じる") {
                viewModel.close()
            }
            .buttonStyle(.glassProminent)
        }
        .padding(20)
        .glassEffect(in: .rect(cornerRadius: 20))
    }

    private var savingView: some View {
        VStack(spacing: 12) {
            ProgressView()
                .tint(.white)
            Text("保存中…")
                .foregroundStyle(.white)
                .font(.headline)
        }
        .padding(24)
        .glassEffect(in: .rect(cornerRadius: 20))
    }

    private func successView(message: String) -> some View {
        VStack(spacing: 14) {
            Text("追加完了")
                .font(.headline)
                .foregroundStyle(.white)

            Text(message)
                .font(.subheadline)
                .foregroundStyle(.white.opacity(0.88))
                .multilineTextAlignment(.center)

            Button("閉じる") {
                viewModel.finishAfterSuccess()
            }
            .buttonStyle(.glassProminent)
        }
        .padding(20)
        .glassEffect(.regular.tint(.green.opacity(0.2)), in: .rect(cornerRadius: 20))
    }

    private func failureView(message: String) -> some View {
        VStack(spacing: 14) {
            Text("エラー")
                .font(.headline)
                .foregroundStyle(.white)

            Text(message)
                .font(.subheadline)
                .foregroundStyle(.white.opacity(0.88))
                .multilineTextAlignment(.center)

            HStack(spacing: 10) {
                Button("閉じる") {
                    viewModel.close()
                }
                .buttonStyle(.glass)

                Button("再試行") {
                    viewModel.retry()
                }
                .buttonStyle(.glassProminent)
            }
        }
        .padding(20)
        .glassEffect(.regular.tint(.red.opacity(0.16)), in: .rect(cornerRadius: 20))
    }

    private var editingView: some View {
        ScrollView {
            GlassEffectContainer(spacing: 14) {
                VStack(alignment: .leading, spacing: 12) {
                    HStack(spacing: 12) {
                        Text("Merkenに追加")
                            .font(.headline)
                            .foregroundStyle(.white)
                        Spacer()
                        Button("閉じる") {
                            viewModel.close()
                        }
                        .buttonStyle(.glass)
                    }

                    if !viewModel.warnings.isEmpty {
                        VStack(alignment: .leading, spacing: 6) {
                            ForEach(viewModel.warnings, id: \.self) { warning in
                                Text("• \(warning)")
                                    .font(.footnote)
                                    .foregroundStyle(Color.yellow.opacity(0.96))
                            }
                        }
                        .padding(10)
                        .glassEffect(.regular.tint(.orange.opacity(0.16)), in: .rect(cornerRadius: 12))
                    }

                    Text("共有テキスト")
                        .font(.caption)
                        .foregroundStyle(.white.opacity(0.78))
                    Text(viewModel.sourceText)
                        .font(.footnote)
                        .foregroundStyle(.white.opacity(0.92))
                        .lineLimit(3)
                        .padding(10)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .glassEffect(in: .rect(cornerRadius: 12))

                    Text("英語")
                        .font(.caption)
                        .foregroundStyle(.white.opacity(0.78))
                    TextField("english", text: $viewModel.english)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled(true)
                        .padding(12)
                        .foregroundStyle(.white)
                        .glassEffect(.regular.interactive(), in: .rect(cornerRadius: 12))

                    Text("日本語")
                        .font(.caption)
                        .foregroundStyle(.white.opacity(0.78))
                    TextField("japanese", text: $viewModel.japanese)
                        .padding(12)
                        .foregroundStyle(.white)
                        .glassEffect(.regular.interactive(), in: .rect(cornerRadius: 12))

                    Toggle(isOn: $viewModel.useNewProject) {
                        Text("新しい単語帳を作成")
                            .foregroundStyle(.white)
                    }
                    .toggleStyle(.switch)
                    .padding(12)
                    .glassEffect(in: .rect(cornerRadius: 12))

                    if viewModel.useNewProject {
                        TextField("単語帳名（任意）", text: $viewModel.newProjectTitle)
                            .padding(12)
                            .foregroundStyle(.white)
                            .glassEffect(.regular.interactive(), in: .rect(cornerRadius: 12))
                    } else {
                        Picker("保存先", selection: Binding(get: {
                            viewModel.selectedProjectId ?? ""
                        }, set: { newValue in
                            viewModel.selectedProjectId = newValue.isEmpty ? nil : newValue
                        })) {
                            ForEach(viewModel.projectOptions) { project in
                                Text(project.title).tag(project.id)
                            }
                        }
                        .pickerStyle(.menu)
                        .tint(.white)
                        .padding(12)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .glassEffect(.regular.interactive(), in: .rect(cornerRadius: 12))
                    }

                    Button {
                        viewModel.save()
                    } label: {
                        Text("この内容で追加")
                            .font(.headline)
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.glassProminent)
                    .disabled(!viewModel.canSave)
                    .opacity(viewModel.canSave ? 1 : 0.6)
                }
                .padding(16)
                .glassEffect(in: .rect(cornerRadius: 20))
            }
        }
        .scrollIndicators(.hidden)
    }
}
