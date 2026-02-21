import SwiftUI
import SwiftData
import OSLog

@main
struct MerkenIOSApp: App {
    @StateObject private var appState: AppState
    private let modelContainer: ModelContainer

    init() {
        let container = AppContainer.make()
        _appState = StateObject(wrappedValue: container.appState)
        self.modelContainer = container.modelContainer
#if DEBUG
        MainThreadStallMonitor.shared.start()
#endif
    }

    var body: some Scene {
        WindowGroup {
            RootTabView()
                .environmentObject(appState)
                .modelContainer(modelContainer)
                .preferredColorScheme(.dark)
                .task {
                    await appState.bootstrap()
                }
        }
    }
}

final class MainThreadStallMonitor {
    static let shared = MainThreadStallMonitor()

    private let queue = DispatchQueue(label: "merken.main-thread-stall-monitor")
    private let logger = Logger(subsystem: "MerkenIOS", category: "MainThreadStall")
    private var timer: DispatchSourceTimer?
    private var running = false

    private init() {}

    func start(
        interval: TimeInterval = 1.0,
        threshold: TimeInterval = 0.35
    ) {
        guard !running else { return }
        running = true

        let timer = DispatchSource.makeTimerSource(queue: queue)
        timer.schedule(deadline: .now() + 1, repeating: interval)
        timer.setEventHandler { [weak self] in
            guard let self else { return }
            let started = CACurrentMediaTime()
            DispatchQueue.main.async {
                let elapsed = CACurrentMediaTime() - started
                if elapsed > threshold {
                    self.logger.error("Main thread stall detected: \(elapsed, privacy: .public)s")
                }
            }
        }
        timer.resume()
        self.timer = timer
    }
}
