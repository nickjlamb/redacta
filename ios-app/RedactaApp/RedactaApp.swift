import SwiftUI

@main
struct RedactaApp: App {
    @StateObject private var session = Session()

    init() {
        // Materialise the App Group container early to quiet the benign
        // CFPrefs "Contents Need Refresh" console log.
        SharedSettings.prime()
    }

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(session)
        }
    }
}
