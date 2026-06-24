import SwiftUI

/// App shell (Direction A): four screens behind a floating custom brand tab bar.
/// Screens stay alive across switches (opacity) so per-tab state is preserved.
/// The tab bar floats above the screens (persisting across pushes); each screen
/// reserves room for it with `.aboveTabBar()` from inside its own NavigationStack.
struct RootView: View {
    @AppStorage("redacta.hasSeenWelcome") private var hasSeenWelcome = false
    @ObservedObject private var appearanceStore = AppearanceStore.shared
    @State private var tab: BrandTab = .redact

    var body: some View {
        ZStack(alignment: .bottom) {
            ZStack {
                RedactScreen().opacity(tab == .redact ? 1 : 0)
                    .allowsHitTesting(tab == .redact)
                ScanScreen().opacity(tab == .scan ? 1 : 0)
                    .allowsHitTesting(tab == .scan)
                ReinstateScreen().opacity(tab == .reinstate ? 1 : 0)
                    .allowsHitTesting(tab == .reinstate)
                SettingsScreen().opacity(tab == .settings ? 1 : 0)
                    .allowsHitTesting(tab == .settings)
            }

            BrandTabBar(selection: $tab)
        }
        .background(Brand.canvas.ignoresSafeArea())
        .preferredColorScheme(appearanceStore.appearance.colorScheme)
        .sheet(isPresented: .constant(!hasSeenWelcome)) {
            WelcomeView { hasSeenWelcome = true }
                .interactiveDismissDisabled()
        }
    }
}
