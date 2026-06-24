import Foundation
import JavaScriptCore

/// On-device redaction engine.
///
/// Loads the shared TypeScript engine (compiled to `redacta.bundle.js`) into a
/// JavaScriptCore context and exposes a small, typed Swift API. There is **no
/// network entitlement and no persistence** — text and token maps live only in
/// memory for the lifetime of the call / session. This is the same engine that
/// powers the Redacta skill, MCP server, CLI and FigJam/Miro plugins.
public final class RedactaEngine {

    /// Redaction modes, matching the engine's `Category` union.
    public enum Mode: String, CaseIterable, Identifiable {
        case clinical
        case general
        case safeharbor

        public var id: String { rawValue }

        public var label: String {
            switch self {
            case .clinical:   return "Clinical"
            case .general:    return "General PII"
            case .safeharbor: return "HIPAA Safe Harbor"
            }
        }
    }

    /// Shared instance — the JSContext is cheap to keep alive and avoids
    /// re-parsing the bundle on every share.
    public static let shared = try! RedactaEngine()

    private let context: JSContext
    private let api: JSValue

    public init() throws {
        guard
            let url = Bundle(for: RedactaEngine.self)
                .url(forResource: "redacta.bundle", withExtension: "js"),
            let source = try? String(contentsOf: url, encoding: .utf8)
        else {
            throw RedactaError.bundleMissing
        }

        guard let context = JSContext() else {
            throw RedactaError.engineLoadFailed("JSContext could not be created")
        }
        self.context = context

        var thrown: String?
        context.exceptionHandler = { _, value in
            thrown = value?.toString() ?? "unknown JS exception"
        }

        context.evaluateScript(source, withSourceURL: url)
        if let thrown { throw RedactaError.engineLoadFailed(thrown) }

        guard
            let api = context.objectForKeyedSubscript("Redacta"),
            !api.isUndefined
        else {
            throw RedactaError.engineLoadFailed("globalThis.Redacta was not defined by the bundle")
        }
        self.api = api
    }

    // MARK: - Public API

    /// Redact `text` using the given modes (defaults to clinical).
    public func redact(_ text: String, modes: [Mode] = [.clinical]) throws -> RedactionResult {
        let csv = modes.map(\.rawValue).joined(separator: ",")
        guard
            let fn = api.objectForKeyedSubscript("redact"),
            let result = fn.call(withArguments: [text, csv]),
            !result.isUndefined, !result.isNull
        else {
            throw RedactaError.callFailed("redact() returned no value")
        }
        return try Self.decode(result)
    }

    /// Re-identify: put original values back using a token map.
    public func reinstate(_ text: String, tokenMap: [String: String]) throws -> String {
        guard
            let fn = api.objectForKeyedSubscript("reinstate"),
            let result = fn.call(withArguments: [text, tokenMap]),
            let out = result.objectForKeyedSubscript("text")?.toString()
        else {
            throw RedactaError.callFailed("reinstate() returned no value")
        }
        return out
    }

    /// Re-scan already-redacted text for possible leftovers.
    public func selfCheck(_ text: String) throws -> [ResidualFinding] {
        guard
            let fn = api.objectForKeyedSubscript("selfCheck"),
            let result = fn.call(withArguments: [text])
        else {
            throw RedactaError.callFailed("selfCheck() returned no value")
        }
        return Self.decodeResiduals(result)
    }

    public var engineVersion: String {
        api.objectForKeyedSubscript("version")?.toString() ?? "unknown"
    }

    // MARK: - Decoding

    private static func decode(_ value: JSValue) throws -> RedactionResult {
        guard let text = value.objectForKeyedSubscript("text")?.toString() else {
            throw RedactaError.callFailed("malformed result: missing text")
        }
        let changed = value.objectForKeyedSubscript("changed")?.toBool() ?? false
        let report = (value.objectForKeyedSubscript("report")?.toDictionary() as? [String: Any] ?? [:])
            .reduce(into: [String: Int]()) { acc, kv in
                if let n = kv.value as? Int { acc[kv.key] = n }
                else if let n = kv.value as? NSNumber { acc[kv.key] = n.intValue }
            }
        let tokenMap = (value.objectForKeyedSubscript("tokenMap")?.toDictionary() as? [String: Any] ?? [:])
            .reduce(into: [String: String]()) { acc, kv in
                acc[kv.key] = kv.value as? String ?? "\(kv.value)"
            }
        let residuals = decodeResiduals(value.objectForKeyedSubscript("residuals"))
        return RedactionResult(
            text: text, changed: changed, report: report,
            tokenMap: tokenMap, residuals: residuals
        )
    }

    private static func decodeResiduals(_ value: JSValue?) -> [ResidualFinding] {
        guard let arr = value?.toArray() as? [[String: Any]] else { return [] }
        return arr.compactMap { dict in
            guard let label = dict["label"] as? String,
                  let sample = dict["sample"] as? String else { return nil }
            return ResidualFinding(label: label, sample: sample)
        }
    }
}
