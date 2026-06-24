import SwiftUI

/// Shared results card: redacted text, a one-line report, residual warnings, the
/// in-session token map, and copy actions. Used by both the container app and
/// the Share Extension so the redaction reveal is identical everywhere.
struct ResultsView: View {
    let result: RedactionResult
    /// Called when the user copies; lets the host show a toast / confirmation.
    var onCopied: ((String) -> Void)? = nil

    @State private var showTokenMap = false

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            summaryRow

            // Redacted text
            VStack(alignment: .leading, spacing: 8) {
                Text("Safe to paste")
                    .font(.caption).foregroundStyle(.secondary)
                TokenisedText(text: result.text)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(12)
                    .background(Color(.secondarySystemBackground))
                    .clipShape(RoundedRectangle(cornerRadius: 12))
                Button {
                    UIPasteboard.general.string = result.text
                    onCopied?("Redacted text copied")
                } label: {
                    Label("Copy redacted text", systemImage: "doc.on.doc")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .tint(Theme.accent)
            }

            if !result.residuals.isEmpty {
                residualWarning
            }

            tokenMapSection
        }
    }

    // MARK: Pieces

    private var summaryRow: some View {
        HStack(spacing: 10) {
            Image(systemName: result.changed ? "checkmark.shield.fill" : "shield")
                .foregroundStyle(result.changed ? Theme.safe : .secondary)
                .font(.title3)
            Text(result.summary)
                .font(.subheadline.weight(.medium))
            Spacer()
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background((result.changed ? Theme.safe : Color.gray).opacity(0.12))
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }

    private var residualWarning: some View {
        VStack(alignment: .leading, spacing: 6) {
            Label("Check these by hand", systemImage: "exclamationmark.triangle.fill")
                .font(.caption.weight(.semibold))
                .foregroundStyle(Theme.warn)
            ForEach(result.residuals) { r in
                Text("• \(r.label): \(r.sample)")
                    .font(.caption.monospaced())
                    .foregroundStyle(.secondary)
            }
            Text("The engine flags possible leftovers — a second pair of eyes, not a guarantee.")
                .font(.caption2).foregroundStyle(.tertiary)
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Theme.warn.opacity(0.10))
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }

    @ViewBuilder
    private var tokenMapSection: some View {
        if !result.tokenMap.isEmpty {
            DisclosureGroup(isExpanded: $showTokenMap) {
                VStack(alignment: .leading, spacing: 6) {
                    ForEach(result.tokenMap.sorted(by: { $0.key < $1.key }), id: \.key) { token, value in
                        HStack(alignment: .top, spacing: 8) {
                            Text(token).foregroundStyle(Theme.token)
                            Text("→").foregroundStyle(.tertiary)
                            Text(value).foregroundStyle(.primary)
                        }
                        .font(.caption.monospaced())
                        .frame(maxWidth: .infinity, alignment: .leading)
                    }
                    Button {
                        UIPasteboard.general.string = tokenMapJSON
                        onCopied?("Token map copied")
                    } label: {
                        Label("Copy token map (JSON)", systemImage: "key")
                    }
                    .font(.caption)
                    .padding(.top, 4)

                    Text("Keep this to re-identify AI output later. It is never stored by the app — copy it now or it is gone when you leave.")
                        .font(.caption2).foregroundStyle(.tertiary)
                }
                .padding(.top, 8)
            } label: {
                Label("Token map (\(result.tokenMap.count))", systemImage: "lock.rotation")
                    .font(.subheadline)
            }
            .tint(Theme.accent)
        }
    }

    private var tokenMapJSON: String {
        guard let data = try? JSONSerialization.data(
            withJSONObject: result.tokenMap, options: [.prettyPrinted, .sortedKeys]),
            let s = String(data: data, encoding: .utf8) else { return "{}" }
        return s
    }
}
