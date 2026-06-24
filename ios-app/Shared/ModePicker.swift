import SwiftUI

/// Selected redaction mode, bound to the App Group so the app and the Share
/// Extension stay in sync. Backed by a String so `@AppStorage` can persist it.
@propertyWrapper
struct ModeStorage: DynamicProperty {
    @AppStorage(SharedSettings.modeKey, store: SharedSettings.store)
    private var raw: String = RedactaEngine.Mode.clinical.rawValue

    var wrappedValue: RedactaEngine.Mode {
        get { RedactaEngine.Mode(rawValue: raw) ?? .clinical }
        nonmutating set { raw = newValue.rawValue }
    }

    var projectedValue: Binding<RedactaEngine.Mode> {
        Binding(get: { wrappedValue }, set: { wrappedValue = $0 })
    }
}
