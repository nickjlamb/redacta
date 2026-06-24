import Foundation

/// Tiny shared-settings store backed by the App Group, so the container app and
/// the Share Extension agree on the selected mode. v1 ships clinical-only; the
/// mode switch is wired here so v1.1 can expose it without re-plumbing.
///
/// IMPORTANT: only non-sensitive preferences live here. No patient text and no
/// token maps are ever written to disk — that is a deliberate v1 constraint
/// ("Data Not Collected").
public enum SharedSettings {
    /// Must match the App Group in both targets' entitlements.
    public static let appGroup = "group.com.medcopywriter.redacta"

    /// The App Group defaults suite. Exposed so SwiftUI views can bind directly
    /// with `@AppStorage(SharedSettings.modeKey, store: SharedSettings.store)`.
    public static var store: UserDefaults {
        UserDefaults(suiteName: appGroup) ?? .standard
    }

    /// Key for the selected mode's raw value (a `RedactaEngine.Mode.rawValue`).
    public static let modeKey = "redacta.mode"

    /// Key for the appearance preference (system / light / dark).
    public static let appearanceKey = "redacta.appearance"

    public static var mode: RedactaEngine.Mode {
        get {
            guard let raw = store.string(forKey: modeKey),
                  let m = RedactaEngine.Mode(rawValue: raw) else { return .clinical }
            return m
        }
        set { store.set(newValue.rawValue, forKey: modeKey) }
    }

    /// Write the default mode into the App Group on first launch, so the group
    /// container plist exists before any view reads it. Materialising it this way
    /// silences the benign "Couldn't read values in CFPrefsPlistSource …
    /// Contents Need Refresh" console line. Call once, early, at app launch.
    public static func prime() {
        if store.string(forKey: modeKey) == nil {
            store.set(mode.rawValue, forKey: modeKey)
        }
    }
}
