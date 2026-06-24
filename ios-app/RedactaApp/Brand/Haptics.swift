import UIKit

/// Thin wrapper over UIKit feedback generators, used for key moments only so the
/// haptics stay meaningful (not noisy).
enum Haptics {
    /// A light tap — small confirmations (e.g. appearance toggle).
    static func tap() {
        UIImpactFeedbackGenerator(style: .light).impactOccurred()
    }

    /// Selection change — segmented mode, tab switches.
    static func selection() {
        UISelectionFeedbackGenerator().selectionChanged()
    }

    /// Success — redaction done, copy, reinstate.
    static func success() {
        UINotificationFeedbackGenerator().notificationOccurred(.success)
    }

    /// Warning — invalid input (e.g. a malformed token map).
    static func warning() {
        UINotificationFeedbackGenerator().notificationOccurred(.warning)
    }
}
