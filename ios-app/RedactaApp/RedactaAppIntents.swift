// App Intents / Shortcuts support.
//
// Compiling any AppIntent into the app triggers Xcode's "AppIntentsSSUTraining"
// phase (Siri phrase training). If that phase misbehaves, define the compile
// flag REDACTA_NO_SHORTCUTS (Build Settings → Swift Compiler - Custom Flags →
// Active Compilation Conditions) to drop the whole feature and unblock the
// build. The app + Share Extension are unaffected; you only lose the Shortcuts
// actions until it's removed.
#if !REDACTA_NO_SHORTCUTS
import AppIntents
import UIKit

/// Mode parameter for Shortcuts. Mirrors RedactaEngine.Mode.
enum RedactModeAppEnum: String, AppEnum {
    case clinical
    case general
    case safeharbor

    static var typeDisplayRepresentation = TypeDisplayRepresentation(name: "Redaction Mode")

    static var caseDisplayRepresentations: [RedactModeAppEnum: DisplayRepresentation] = [
        .clinical: "Clinical",
        .general: "General PII",
        .safeharbor: "HIPAA Safe Harbor",
    ]

    var engineMode: RedactaEngine.Mode {
        RedactaEngine.Mode(rawValue: rawValue) ?? .clinical
    }
}

/// Redact a supplied string and return the safe version. Runs entirely on-device.
struct RedactTextIntent: AppIntent {
    static var title: LocalizedStringResource = "Redact Text"
    static var description = IntentDescription(
        "Replace patient identifiers in text with tokens, on-device. Returns the redacted text.")
    static var openAppWhenRun = false

    @Parameter(title: "Text")
    var text: String

    @Parameter(title: "Mode", default: .clinical)
    var mode: RedactModeAppEnum

    static var parameterSummary: some ParameterSummary {
        Summary("Redact \(\.$text) using \(\.$mode)")
    }

    func perform() async throws -> some IntentResult & ReturnsValue<String> & ProvidesDialog {
        let result = try RedactaEngine.shared.redact(text, modes: [mode.engineMode])
        return .result(value: result.text, dialog: IntentDialog(stringLiteral: result.summary))
    }
}

/// Redact whatever is on the clipboard and write the safe version back to it —
/// the "redact clipboard and copy" automation the concept calls out.
struct RedactClipboardIntent: AppIntent {
    static var title: LocalizedStringResource = "Redact Clipboard"
    static var description = IntentDescription(
        "Redact the text currently on the clipboard and copy the safe version back, on-device.")
    static var openAppWhenRun = false

    @Parameter(title: "Mode", default: .clinical)
    var mode: RedactModeAppEnum

    static var parameterSummary: some ParameterSummary {
        Summary("Redact the clipboard using \(\.$mode)")
    }

    @MainActor
    func perform() async throws -> some IntentResult & ReturnsValue<String> & ProvidesDialog {
        guard let input = UIPasteboard.general.string, !input.isEmpty else {
            return .result(value: "", dialog: "The clipboard has no text to redact.")
        }
        let result = try RedactaEngine.shared.redact(input, modes: [mode.engineMode])
        UIPasteboard.general.string = result.text
        let dialog = result.changed
            ? "\(result.summary). Safe text copied to the clipboard."
            : "No identifiers found. Clipboard left unchanged."
        return .result(value: result.text, dialog: IntentDialog(stringLiteral: dialog))
    }
}

/// Surfaces the intents in Shortcuts and Spotlight with spoken phrases.
/// Only the main app registers shortcuts (the widget reuses the intents but must
/// not declare its own provider), so this is excluded from the widget target via
/// the REDACTA_WIDGET compilation condition.
#if !REDACTA_WIDGET
struct RedactaShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: RedactClipboardIntent(),
            phrases: [
                "Redact clipboard with \(.applicationName)",
                "Redact my clipboard with \(.applicationName)",
                "Clean the clipboard with \(.applicationName)",
            ],
            shortTitle: "Redact Clipboard",
            systemImageName: "doc.on.clipboard"
        )
        AppShortcut(
            intent: RedactTextIntent(),
            phrases: [
                "Redact text with \(.applicationName)",
            ],
            shortTitle: "Redact Text",
            systemImageName: "wand.and.stars"
        )
    }
}
#endif
#endif
