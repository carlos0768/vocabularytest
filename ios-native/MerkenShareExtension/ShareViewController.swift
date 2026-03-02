import SwiftUI
import UIKit

final class ShareViewController: UIViewController {
    private var hostingController: UIHostingController<ShareImportRootView>?
    private var viewModel: ShareImportViewModel?

    override func viewDidLoad() {
        super.viewDidLoad()
        configureRootView()
        loadSharedInput()
    }

    private func configureRootView() {
        let service: ShareImportService
        do {
            service = try ShareImportService.makeFromBundle()
        } catch {
            let fallback = UILabel()
            fallback.text = error.localizedDescription
            fallback.textColor = .white
            fallback.textAlignment = .center
            fallback.numberOfLines = 0
            fallback.translatesAutoresizingMaskIntoConstraints = false
            view.backgroundColor = .black
            view.addSubview(fallback)
            NSLayoutConstraint.activate([
                fallback.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 20),
                fallback.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -20),
                fallback.centerYAnchor.constraint(equalTo: view.centerYAnchor)
            ])
            return
        }

        let viewModel = ShareImportViewModel(
            service: service,
            onCancel: { [weak self] in
                self?.extensionContext?.cancelRequest(withError: NSError(domain: "MerkenShareExtension", code: 1))
            },
            onComplete: { [weak self] in
                self?.extensionContext?.completeRequest(returningItems: nil, completionHandler: nil)
            }
        )
        self.viewModel = viewModel

        let root = ShareImportRootView(viewModel: viewModel)
        let hosting = UIHostingController(rootView: root)
        self.hostingController = hosting

        addChild(hosting)
        hosting.view.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(hosting.view)

        NSLayoutConstraint.activate([
            hosting.view.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            hosting.view.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            hosting.view.topAnchor.constraint(equalTo: view.topAnchor),
            hosting.view.bottomAnchor.constraint(equalTo: view.bottomAnchor)
        ])

        hosting.didMove(toParent: self)
    }

    private func loadSharedInput() {
        guard let viewModel else { return }

        Task { [weak self] in
            guard let self else { return }
            let input = await ShareInputExtractor.extract(from: self.extensionContext?.inputItems ?? [])
            await MainActor.run {
                if let input {
                    viewModel.bootstrap(with: input)
                } else {
                    viewModel.phase = .failure("共有テキストを読み取れませんでした。")
                }
            }
        }
    }
}
