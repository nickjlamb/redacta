import SwiftUI

/// Minimal shared styling so the app and the Share Extension look like one product.
enum Theme {
    static let accent = Color(red: 0.36, green: 0.20, blue: 0.78)   // Redacta violet
    static let safe = Color(red: 0.10, green: 0.60, blue: 0.36)     // "clean" green
    static let warn = Color(red: 0.80, green: 0.45, blue: 0.05)     // residual amber
    static let token = Color(red: 0.36, green: 0.20, blue: 0.78)
    static let mono = Font.system(.body, design: .monospaced)
}

/// Renders redacted text with `[TOKEN_1]` spans tinted, so the redaction is
/// visible at a glance (the "reveal" that makes the demo shareable).
struct TokenisedText: View {
    let text: String

    var body: some View {
        Text(attributed)
            .font(Theme.mono)
            .textSelection(.enabled)
    }

    private var attributed: AttributedString {
        var result = AttributedString(text)
        // Match [UPPER_SNAKE_123] tokens.
        guard let regex = try? NSRegularExpression(pattern: "\\[[A-Z_]+_\\d+\\]") else {
            return result
        }
        let ns = text as NSString
        for match in regex.matches(in: text, range: NSRange(location: 0, length: ns.length)) {
            if let range = Range(match.range, in: text),
               let lo = AttributedString.Index(range.lowerBound, within: result),
               let hi = AttributedString.Index(range.upperBound, within: result) {
                result[lo..<hi].foregroundColor = Theme.token
                result[lo..<hi].font = Theme.mono.bold()
            }
        }
        return result
    }
}
