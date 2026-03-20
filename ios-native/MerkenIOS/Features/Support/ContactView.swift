import SwiftUI

struct ContactView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.openURL) private var openURL

    var body: some View {
        ZStack {
            AppBackground()

            ScrollView {
                    VStack(alignment: .leading, spacing: 16) {
                        SolidCard {
                            VStack(alignment: .leading, spacing: 16) {
                                Text("MERKENに関するご質問、不具合のご報告、ご要望などがございましたら、以下のメールアドレスまでお気軽にご連絡ください。")
                                    .font(.body)
                                    .foregroundStyle(MerkenTheme.primaryText)
                                    .lineSpacing(4)

                                Button {
                                    openURL(URL(string: "mailto:support@merken.jp")!)
                                } label: {
                                    HStack(spacing: 12) {
                                        Image(systemName: "envelope.fill")
                                            .font(.body)
                                            .foregroundStyle(MerkenTheme.accentBlue)
                                            .frame(width: 40, height: 40)
                                            .background(MerkenTheme.accentBlueLight, in: .circle)

                                        Text("support@merken.jp")
                                            .font(.headline)
                                            .foregroundStyle(MerkenTheme.primaryText)

                                        Spacer()
                                    }
                                    .padding(14)
                                    .background(MerkenTheme.accentBlue.opacity(0.06), in: .rect(cornerRadius: 16))
                                }

                                Text("通常2営業日以内にご返信いたします。")
                                    .font(.caption)
                                    .foregroundStyle(MerkenTheme.mutedText)
                            }
                        }
                    }
                    .padding(.horizontal, 16)
                    .padding(.top, 16)
                    .padding(.bottom, 16)
            }
        }
        .navigationTitle("お問い合わせ")
        .navigationBarTitleDisplayMode(.inline)
    }
}

struct RequestFeedbackView: View {
    @EnvironmentObject private var appState: AppState

    @State private var message = ""
    @State private var isSubmitting = false
    @State private var submitSuccess = false
    @State private var errorMessage: String?

    private let maxLength = 300

    private var endpointURL: URL? {
        guard let raw = Bundle.main.infoDictionary?["CLOUDFLARE_FEEDBACK_ENDPOINT_URL"] as? String else {
            return nil
        }
        let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return nil }
        return URL(string: trimmed)
    }

    private var trimmedMessage: String {
        message.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private var canSubmit: Bool {
        !isSubmitting && !trimmedMessage.isEmpty && trimmedMessage.count <= maxLength && endpointURL != nil
    }

    var body: some View {
        ZStack {
            AppBackground()

            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    SolidCard {
                        VStack(alignment: .leading, spacing: 12) {
                            Text("ほしい機能を一言で送ってください。")
                                .font(.headline)
                                .foregroundStyle(MerkenTheme.primaryText)

                            Text("例: 復習だけ先に開けるボタンがほしい")
                                .font(.caption)
                                .foregroundStyle(MerkenTheme.secondaryText)

                            ZStack(alignment: .topLeading) {
                                RoundedRectangle(cornerRadius: 12)
                                    .fill(MerkenTheme.background)
                                    .overlay(
                                        RoundedRectangle(cornerRadius: 12)
                                            .stroke(MerkenTheme.borderLight, lineWidth: 1)
                                    )

                                TextEditor(text: $message)
                                    .frame(minHeight: 140)
                                    .padding(8)
                                    .scrollContentBackground(.hidden)
                                    .background(Color.clear)
                                    .onChange(of: message) { _ in
                                        if message.count > maxLength {
                                            message = String(message.prefix(maxLength))
                                        }
                                    }

                                if message.isEmpty {
                                    Text("短くでOK（300文字まで）")
                                        .font(.body)
                                        .foregroundStyle(MerkenTheme.mutedText)
                                        .padding(.horizontal, 14)
                                        .padding(.vertical, 16)
                                        .allowsHitTesting(false)
                                }
                            }

                            HStack {
                                if endpointURL == nil {
                                    Text("送信先が未設定です")
                                        .font(.caption)
                                        .foregroundStyle(MerkenTheme.warning)
                                } else {
                                    Text("入力文字数")
                                        .font(.caption)
                                        .foregroundStyle(MerkenTheme.mutedText)
                                }

                                Spacer()

                                Text("\(trimmedMessage.count)/\(maxLength)")
                                    .font(.caption.monospacedDigit())
                                    .foregroundStyle(MerkenTheme.mutedText)
                            }

                            Button {
                                Task {
                                    await submitFeedback()
                                }
                            } label: {
                                HStack {
                                    if isSubmitting {
                                        ProgressView()
                                            .tint(.white)
                                    }
                                    Text(isSubmitting ? "送信中..." : "送る")
                                        .font(.system(size: 15, weight: .bold))
                                }
                                .foregroundStyle(.white)
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 12)
                                .background(canSubmit ? MerkenTheme.accentBlue : MerkenTheme.mutedText, in: .rect(cornerRadius: 10))
                            }
                            .disabled(!canSubmit)
                        }
                    }

                    if submitSuccess {
                        SolidCard {
                            Text("ありがとう。次の改善候補に入れました。")
                                .font(.subheadline)
                                .foregroundStyle(MerkenTheme.primaryText)
                        }
                    }

                    if let errorMessage {
                        SolidCard {
                            Text(errorMessage)
                                .font(.subheadline)
                                .foregroundStyle(MerkenTheme.warning)
                        }
                    }
                }
                .padding(.horizontal, 16)
                .padding(.top, 16)
                .padding(.bottom, 16)
            }
        }
        .navigationTitle("ご要望")
        .navigationBarTitleDisplayMode(.inline)
    }

    private func submitFeedback() async {
        guard let endpointURL else {
            errorMessage = "送信先のURLが未設定です。"
            submitSuccess = false
            return
        }

        let body = FeedbackRequestBody(
            userId: appState.session?.userId,
            message: trimmedMessage,
            page: "ios/request-feedback"
        )

        isSubmitting = true
        errorMessage = nil
        defer { isSubmitting = false }

        do {
            var request = URLRequest(url: endpointURL)
            request.httpMethod = "POST"
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.timeoutInterval = 20
            request.httpBody = try JSONEncoder().encode(body)

            let (_, response) = try await URLSession.shared.data(for: request)
            guard let http = response as? HTTPURLResponse else {
                throw FeedbackSubmitError.invalidResponse
            }
            guard (200 ... 299).contains(http.statusCode) else {
                throw FeedbackSubmitError.badStatus(http.statusCode)
            }

            submitSuccess = true
            message = ""
            MerkenHaptic.success()
        } catch {
            submitSuccess = false
            errorMessage = "送信に失敗しました。時間をおいて再試行してください。"
            MerkenHaptic.error()
        }
    }
}

private struct FeedbackRequestBody: Encodable {
    let userId: String?
    let message: String
    let page: String

    enum CodingKeys: String, CodingKey {
        case userId = "user_id"
        case message
        case page
    }
}

private enum FeedbackSubmitError: Error {
    case invalidResponse
    case badStatus(Int)
}
