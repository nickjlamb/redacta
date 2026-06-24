import Foundation

/// One leftover the self-check flagged for human review (not a confirmed identifier).
public struct ResidualFinding: Identifiable, Hashable {
    public let id = UUID()
    public let label: String
    public let sample: String
}

/// The result of one redaction pass — mirrors the JS engine's facade output.
public struct RedactionResult {
    /// The tokenised, safe-to-paste text.
    public let text: String
    /// Whether anything actually changed.
    public let changed: Bool
    /// {token_type: count_of_distinct_values}, e.g. ["NHS_NUMBER": 1].
    public let report: [String: Int]
    /// {token: original_value} — sensitive; held in-session only, never persisted.
    public let tokenMap: [String: String]
    /// Possible leftovers the engine wants a human to double-check.
    public let residuals: [ResidualFinding]

    /// A human-readable one-liner, e.g. "4 identifiers replaced (2 names, 1 NHS number, 1 email)".
    public var summary: String {
        let total = report.values.reduce(0, +)
        if total == 0 { return "No identifiers found" }
        let parts = report
            .sorted { $0.key < $1.key }
            .map { "\($0.value) \(Self.pretty($0.key, count: $0.value))" }
        let noun = total == 1 ? "identifier" : "identifiers"
        return "\(total) \(noun) replaced (\(parts.joined(separator: ", ")))"
    }

    private static func pretty(_ token: String, count: Int) -> String {
        let base = token.lowercased().replacingOccurrences(of: "_", with: " ")
        if base.hasSuffix("y") && count != 1 {
            return String(base.dropLast()) + "ies"
        }
        return count == 1 ? base : base + "s"
    }
}

/// Errors the engine can surface to the UI.
public enum RedactaError: LocalizedError {
    case bundleMissing
    case engineLoadFailed(String)
    case callFailed(String)

    public var errorDescription: String? {
        switch self {
        case .bundleMissing:
            return "Redaction engine resource (redacta.bundle.js) is missing from the app bundle."
        case .engineLoadFailed(let m):
            return "Could not initialise the redaction engine: \(m)"
        case .callFailed(let m):
            return "Redaction failed: \(m)"
        }
    }
}
