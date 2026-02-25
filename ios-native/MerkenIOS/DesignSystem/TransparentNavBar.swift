import SwiftUI
import UIKit

/// A background UIViewController that sets its parent navigation bar to fully transparent.
/// Use `.background(TransparentNavBarSetter())` on views that need a see-through nav bar
/// (e.g. cover-image headers where iOS 26's glass effect would white-wash the image).
struct TransparentNavBarSetter: UIViewControllerRepresentable {
    func makeUIViewController(context: Context) -> UIViewController {
        TransparentNavBarVC()
    }

    func updateUIViewController(_ uiViewController: UIViewController, context: Context) {}
}

private final class TransparentNavBarVC: UIViewController {
    override func viewWillAppear(_ animated: Bool) {
        super.viewWillAppear(animated)
        applyTransparentNavBar()
    }

    override func didMove(toParent parent: UIViewController?) {
        super.didMove(toParent: parent)
        applyTransparentNavBar()
    }

    private func applyTransparentNavBar() {
        guard let navBar = navigationController?.navigationBar else { return }
        let appearance = UINavigationBarAppearance()
        appearance.configureWithTransparentBackground()
        appearance.shadowColor = .clear
        appearance.backgroundColor = .clear
        navBar.standardAppearance = appearance
        navBar.scrollEdgeAppearance = appearance
        navBar.compactAppearance = appearance
        navBar.isTranslucent = true
    }
}

/// Restore the default navigation bar appearance when leaving a transparent-nav-bar screen.
struct DefaultNavBarSetter: UIViewControllerRepresentable {
    func makeUIViewController(context: Context) -> UIViewController {
        DefaultNavBarVC()
    }

    func updateUIViewController(_ uiViewController: UIViewController, context: Context) {}
}

private final class DefaultNavBarVC: UIViewController {
    override func viewWillAppear(_ animated: Bool) {
        super.viewWillAppear(animated)
        restoreNavBar()
    }

    private func restoreNavBar() {
        guard let navBar = navigationController?.navigationBar else { return }
        let appearance = UINavigationBarAppearance()
        appearance.configureWithDefaultBackground()
        navBar.standardAppearance = appearance
        navBar.scrollEdgeAppearance = nil
        navBar.compactAppearance = nil
    }
}
