import SwiftUI

struct ShareImportRootView: View {
    @StateObject private var viewModel: ShareImportViewModel

    init(viewModel: ShareImportViewModel) {
        _viewModel = StateObject(wrappedValue: viewModel)
    }

    private let backgroundColor = Color(red: 0.97, green: 0.97, blue: 0.98)
    private let surfaceColor = Color.white
    private let borderColor = Color.black.opacity(0.08)
    private let secondaryTextColor = Color(red: 0.44, green: 0.46, blue: 0.52)
    private let accentColor = Color.black
    private let successColor = Color(red: 0.10, green: 0.68, blue: 0.34)
    private let warningColor = Color(red: 0.87, green: 0.52, blue: 0.13)

    var body: some View {
        ZStack {
            backgroundColor
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
        VStack(spacing: 14) {
            sectionCard {
                VStack(spacing: 12) {
                    Text("MERKEN")
                        .font(.system(size: 22, weight: .black))
                        .tracking(1.2)
                        .foregroundStyle(.black)

                    ProgressView()
                        .tint(accentColor)
                        .scaleEffect(1.08)

                    Text("共有内容を確認中")
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundStyle(.black)
                }
                .frame(maxWidth: .infinity)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .padding(.horizontal, 8)
    }

    private var loginRequiredView: some View {
        VStack(spacing: 16) {
            Spacer()

            sectionCard {
                VStack(spacing: 12) {
                    Text("ログインが必要です")
                        .font(.system(size: 20, weight: .bold))
                        .foregroundStyle(.black)

                    Text("Merkenアプリでログインしたあとに、もう一度共有してください。")
                        .font(.system(size: 14, weight: .medium))
                        .foregroundStyle(secondaryTextColor)
                        .multilineTextAlignment(.center)

                    primaryButton(title: "閉じる", color: accentColor) {
                        viewModel.close()
                    }
                }
            }

            Spacer()
        }
    }

    private var savingView: some View {
        VStack(spacing: 14) {
            ProgressView()
                .tint(accentColor)
                .scaleEffect(1.08)
            Text("単語を追加中")
                .font(.system(size: 16, weight: .semibold))
                .foregroundStyle(.black)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private func successView(message: String) -> some View {
        VStack(spacing: 16) {
            Spacer()

            sectionCard {
                VStack(spacing: 12) {
                    Text("追加完了")
                        .font(.system(size: 20, weight: .bold))
                        .foregroundStyle(.black)

                    Text(message)
                        .font(.system(size: 14, weight: .medium))
                        .foregroundStyle(secondaryTextColor)
                        .multilineTextAlignment(.center)

                    primaryButton(title: "閉じる", color: successColor) {
                        viewModel.finishAfterSuccess()
                    }
                }
            }

            Spacer()
        }
    }

    private func failureView(message: String) -> some View {
        VStack(spacing: 16) {
            Spacer()

            sectionCard {
                VStack(spacing: 12) {
                    Text("エラー")
                        .font(.system(size: 20, weight: .bold))
                        .foregroundStyle(.black)

                    Text(message)
                        .font(.system(size: 14, weight: .medium))
                        .foregroundStyle(secondaryTextColor)
                        .multilineTextAlignment(.center)

                    HStack(spacing: 10) {
                        secondaryButton(title: "閉じる") {
                            viewModel.close()
                        }

                        primaryButton(title: "再試行", color: accentColor) {
                            viewModel.retry()
                        }
                    }
                }
            }

            Spacer()
        }
    }

    private var editingView: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                headerSection

                if !viewModel.warnings.isEmpty {
                    sectionCard {
                        VStack(alignment: .leading, spacing: 8) {
                            Text("確認")
                                .font(.system(size: 13, weight: .bold))
                                .foregroundStyle(warningColor)
                            ForEach(viewModel.warnings, id: \.self) { warning in
                                Text("• \(warning)")
                                    .font(.system(size: 13, weight: .medium))
                                    .foregroundStyle(.black.opacity(0.76))
                            }
                        }
                    }
                }

                sectionCard {
                    VStack(alignment: .leading, spacing: 10) {
                        sectionLabel("共有テキスト")
                        Text(viewModel.sourceText)
                            .font(.system(size: 13, weight: .medium))
                            .foregroundStyle(secondaryTextColor)
                            .lineLimit(3)
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }
                }

                sectionCard {
                    VStack(alignment: .leading, spacing: 12) {
                        sectionLabel("英語")
                        textField(
                            "english",
                            text: $viewModel.english,
                            autocapitalization: .never,
                            disableAutocorrection: true
                        )

                        sectionLabel("日本語")
                        textField("japanese", text: $viewModel.japanese)

                        Toggle(isOn: $viewModel.useNewProject) {
                            Text("新しい単語帳を作成")
                                .font(.system(size: 14, weight: .semibold))
                                .foregroundStyle(.black)
                        }
                        .toggleStyle(.switch)

                        if viewModel.useNewProject {
                            textField("単語帳名（任意）", text: $viewModel.newProjectTitle)
                        } else {
                            pickerField
                        }
                    }
                }

                primaryButton(title: "この内容で追加", color: accentColor) {
                    viewModel.save()
                }
                .disabled(!viewModel.canSave)
                .opacity(viewModel.canSave ? 1 : 0.58)
            }
            .padding(.vertical, 6)
        }
        .scrollIndicators(.hidden)
    }

    private var headerSection: some View {
        sectionCard {
            HStack(alignment: .top, spacing: 12) {
                VStack(alignment: .leading, spacing: 6) {
                    Text("MERKEN")
                        .font(.system(size: 24, weight: .black))
                        .foregroundStyle(.black)
                    Text("Google翻訳などの共有内容を、そのまま単語帳へ追加できます。")
                        .font(.system(size: 13, weight: .medium))
                        .foregroundStyle(secondaryTextColor)
                        .lineSpacing(2)
                }

                Spacer(minLength: 0)

                Button {
                    viewModel.close()
                } label: {
                    Image(systemName: "xmark")
                        .font(.system(size: 15, weight: .bold))
                        .foregroundStyle(.black)
                        .frame(width: 36, height: 36)
                        .background(Color.black.opacity(0.04), in: Circle())
                }
                .buttonStyle(.plain)
            }
        }
    }

    private var pickerField: some View {
        Menu {
            ForEach(viewModel.projectOptions) { project in
                Button(project.title) {
                    viewModel.selectedProjectId = project.id
                }
            }
        } label: {
            HStack {
                Text(
                    viewModel.projectOptions.first(where: { $0.id == viewModel.selectedProjectId })?.title
                    ?? "保存先を選択"
                )
                .font(.system(size: 15, weight: .medium))
                .foregroundStyle(viewModel.selectedProjectId == nil ? secondaryTextColor : .black)

                Spacer()

                Image(systemName: "chevron.down")
                    .font(.system(size: 11, weight: .bold))
                    .foregroundStyle(secondaryTextColor)
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 14)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color.black.opacity(0.035), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        }
    }

    private func textField(
        _ title: String,
        text: Binding<String>,
        autocapitalization: TextInputAutocapitalization = .sentences,
        disableAutocorrection: Bool = false
    ) -> some View {
        TextField(title, text: text)
            .textInputAutocapitalization(autocapitalization)
            .autocorrectionDisabled(disableAutocorrection)
            .font(.system(size: 15, weight: .medium))
            .padding(.horizontal, 14)
            .padding(.vertical, 14)
            .background(Color.black.opacity(0.035), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .stroke(borderColor, lineWidth: 1)
            )
    }

    private func sectionLabel(_ title: String) -> some View {
        Text(title)
            .font(.system(size: 12, weight: .bold))
            .foregroundStyle(secondaryTextColor)
    }

    private func sectionCard<Content: View>(@ViewBuilder content: () -> Content) -> some View {
        content()
            .padding(18)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(surfaceColor, in: RoundedRectangle(cornerRadius: 24, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 24, style: .continuous)
                    .stroke(borderColor, lineWidth: 1)
            )
            .shadow(color: Color.black.opacity(0.06), radius: 18, x: 0, y: 8)
    }

    private func primaryButton(title: String, color: Color, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(title)
                .font(.system(size: 16, weight: .bold))
                .foregroundStyle(.white)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 16)
                .background(color, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        }
        .buttonStyle(.plain)
    }

    private func secondaryButton(title: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(title)
                .font(.system(size: 16, weight: .bold))
                .foregroundStyle(.black)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 16)
                .background(surfaceColor, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
                .overlay(
                    RoundedRectangle(cornerRadius: 18, style: .continuous)
                        .stroke(borderColor, lineWidth: 1)
                )
        }
        .buttonStyle(.plain)
    }
}
