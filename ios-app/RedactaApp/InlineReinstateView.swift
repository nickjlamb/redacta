import SwiftUI

/// The second half of the round trip, inline on the Redact result. Paste the
/// AI's reply and restore the real values using the token map that's already in
/// memory from the redaction just performed — no copy/pasting JSON, nothing
/// stored.
struct InlineReinstateView: View {
    let tokenMap: [String: String]
    var onCopied: ((String) -> Void)? = nil

    @State private var reply: String = ""
    @State private var restored: String?
    @State private var expanded = false

    private let engine = RedactaEngine.shared

    var body: some View {
        DisclosureGroup(isExpanded: $expanded) {
            VStack(alignment: .leading, spacing: 10) {
                Text("Paste the AI's reply to put the real values back. Uses this redaction's token map — nothing is stored.")
                    .font(.caption).foregroundStyle(.secondary)

                HStack {
                    Spacer()
                    Button("Paste") {
                        if let s = UIPasteboard.general.string { reply = s }
                    }.font(.caption)
                }

                TextEditor(text: $reply)
                    .font(Theme.mono)
                    .frame(minHeight: 110)
                    .padding(8)
                    .background(Color(.secondarySystemBackground))
                    .clipShape(RoundedRectangle(cornerRadius: 12))
                    .overlay(alignment: .topLeading) {
                        if reply.isEmpty {
                            Text("Paste the response that still contains [NAME_1], [NHS_NUMBER_1]…")
                                .font(Theme.mono).foregroundStyle(.tertiary)
                                .padding(16).allowsHitTesting(false)
                        }
                    }

                Button {
                    restored = try? engine.reinstate(reply, tokenMap: tokenMap)
                } label: {
                    Label("Restore real values", systemImage: "arrow.uturn.backward")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.bordered)
                .tint(Theme.accent)
                .disabled(reply.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)

                if let restored {
                    Text("Restored")
                        .font(.caption).foregroundStyle(.secondary)
                    Text(restored)
                        .font(Theme.mono)
                        .textSelection(.enabled)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(12)
                        .background(Color(.secondarySystemBackground))
                        .clipShape(RoundedRectangle(cornerRadius: 12))
                    Button {
                        UIPasteboard.general.string = restored
                        onCopied?("Restored text copied")
                    } label: {
                        Label("Copy restored text", systemImage: "doc.on.doc")
                    }
                    .font(.caption)
                }
            }
            .padding(.top, 8)
        } label: {
            Label("Reinstate the AI's reply", systemImage: "arrow.uturn.backward.circle")
                .font(.subheadline)
        }
        .tint(Theme.accent)
    }
}
