import SwiftUI

/// App appearance preference, persisted in the App Group so the app and the
/// Share Extension agree. Two-state light/dark toggle.
enum Appearance: String, CaseIterable {
    case light, dark

    var colorScheme: ColorScheme {
        switch self {
        case .light: return .light
        case .dark:  return .dark
        }
    }

    /// The other appearance (for the toggle).
    var toggled: Appearance { self == .light ? .dark : .light }

    var icon: String {
        switch self {
        case .light: return "sun.max.fill"
        case .dark:  return "moon.fill"
        }
    }

    var label: String {
        switch self {
        case .light: return "Light"
        case .dark:  return "Dark"
        }
    }
}

/// Single shared source of truth for appearance. A singleton ObservableObject so
/// every observing view (toggle button, root, share sheet) updates together —
/// avoiding the unreliable cross-instance notifications of @AppStorage with a
/// custom suite. Persists to the App Group.
final class AppearanceStore: ObservableObject {
    static let shared = AppearanceStore()

    @Published var appearance: Appearance {
        didSet {
            SharedSettings.store.set(appearance.rawValue, forKey: SharedSettings.appearanceKey)
        }
    }

    private init() {
        let raw = SharedSettings.store.string(forKey: SharedSettings.appearanceKey)
            ?? Appearance.light.rawValue
        appearance = Appearance(rawValue: raw) ?? .light
    }
}

/// Circular header button that cycles System → Light → Dark.
struct AppearanceToggleButton: View {
    @ObservedObject private var store = AppearanceStore.shared

    var body: some View {
        Button {
            Haptics.tap()
            withAnimation(.easeInOut(duration: 0.2)) { store.appearance = store.appearance.toggled }
        } label: {
            Image(systemName: store.appearance.icon)
                .font(.system(size: 16, weight: .regular))
                .foregroundStyle(Brand.blue)
                .frame(width: 38, height: 38)
                .background(Circle().fill(Brand.canvas))
                .shadow(color: Color(hex: 0x0B0F1C).opacity(0.10), radius: 4, y: 2)
        }
        .buttonStyle(BrandPressStyle())
        .accessibilityLabel("Appearance: \(store.appearance.label)")
        .accessibilityHint("Switches between system, light and dark")
    }
}
