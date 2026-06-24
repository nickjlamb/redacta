import SwiftUI

/// In-memory session state — deliberately NOT persisted.
///
/// Holds the most recent redaction's token map so the user can put real values
/// back into an AI reply without copy/pasting JSON. It lives only for the app's
/// lifetime and is wiped on quit, preserving the "nothing is stored" guarantee.
@MainActor
final class Session: ObservableObject {
    /// {token: original_value} from the last redaction in this session.
    @Published var lastTokenMap: [String: String] = [:]

    var hasMap: Bool { !lastTokenMap.isEmpty }

    func record(_ map: [String: String]) {
        if !map.isEmpty { lastTokenMap = map }
    }

    /// Pretty JSON of the last map, for pre-filling the manual paste field.
    var lastTokenMapJSON: String {
        guard let data = try? JSONSerialization.data(
            withJSONObject: lastTokenMap, options: [.prettyPrinted, .sortedKeys]),
            let s = String(data: data, encoding: .utf8) else { return "{}" }
        return s
    }
}
