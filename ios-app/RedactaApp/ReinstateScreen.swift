import SwiftUI

/// Reinstate tab — paste the AI's reply (with tokens) and the token map, then
/// merge real values back in. Nothing is persisted.
struct ReinstateScreen: View {
    @EnvironmentObject private var session: Session
    @State private var replyText = ""
    @State private var tokenMapText = ""
    @State private var restored: String?
    @State private var errorText: String?
    @State private var showInfo = false
    @State private var toast: String?

    private let engine = RedactaEngine.shared

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 16) {
                    ScreenHeader { showInfo = true }

                    VStack(alignment: .leading, spacing: 6) {
                        ScreenTitle("Reinstate")
                        Text("Put real values back into AI output.")
                            .font(BrandFont.sans(17, .medium))
                            .foregroundStyle(Brand.textPrimary)
                        Text("Paste the reply and the token map you kept. Nothing is stored.")
                            .font(BrandFont.sans(13.5))
                            .foregroundStyle(Brand.textTertiary)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)

                    field(label: "AI reply (with tokens)", trailing: { pasteAction($replyText) }) {
                        BrandTextEditor(
                            text: $replyText,
                            placeholder: "Paste the AI's response containing [NAME_1], [NHS_NUMBER_1]…",
                            fixedHeight: 170
                        )
                    }

                    field(label: "Token map (JSON)", trailing: { tokenMapActions }) {
                        BrandTextEditor(
                            text: $tokenMapText,
                            placeholder: "{ \"[NAME_1]\": \"John Smith\", … }",
                            fixedHeight: 118
                        )
                    }

                    PrimaryButton(title: "Reinstate", systemImage: "arrow.uturn.backward",
                                  enabled: bothFilled) {
                        reinstate()
                    }

                    if let errorText {
                        Text(errorText)
                            .font(BrandFont.sans(12.5))
                            .foregroundStyle(Brand.violet700)
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }

                    if let restored {
                        restoredCard(restored)
                    }
                }
                .padding(.horizontal, Metrics.sidePadding)
                .padding(.top, 6)
                .padding(.bottom, 12)
                .dismissKeyboardOnTap()
            }
            .background(Brand.canvas)
            .aboveTabBar()
            .scrollDismissesKeyboard(.immediately)
            .toolbar(.hidden, for: .navigationBar)
            .keyboardDoneButton()
            .overlay(alignment: .bottom) { toastView }
            .sheet(isPresented: $showInfo) { InfoView { showInfo = false } }
        }
    }

    // MARK: Field scaffold

    private func field<Trailing: View, Content: View>(
        label: String,
        @ViewBuilder trailing: () -> Trailing,
        @ViewBuilder content: () -> Content
    ) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text(label)
                    .font(BrandFont.sans(13, .medium))
                    .foregroundStyle(Brand.textTertiary)
                Spacer()
                trailing()
            }
            content()
        }
    }

    private func pasteAction(_ binding: Binding<String>) -> some View {
        InlineAction(title: "Paste") {
            if let s = UIPasteboard.general.string { binding.wrappedValue = s }
        }
    }

    @ViewBuilder
    private var tokenMapActions: some View {
        HStack(spacing: 14) {
            if session.hasMap {
                InlineAction(title: "Use last") { tokenMapText = session.lastTokenMapJSON }
            }
            pasteAction($tokenMapText)
        }
    }

    private func restoredCard(_ text: String) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Eyebrow(text: "Restored")
            ScrollView {
                Text(text)
                    .font(BrandFont.mono(13))
                    .foregroundStyle(Brand.textBody)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .textSelection(.enabled)
            }
            .frame(maxHeight: 180)
            .padding(14)
            .background(RoundedRectangle(cornerRadius: 16).fill(Brand.aiPanel))
            .overlay(RoundedRectangle(cornerRadius: 16).stroke(Brand.violet100, lineWidth: 1))
            SecondaryButton(title: "Copy restored text", systemImage: "doc.on.doc") {
                UIPasteboard.general.string = text
                flash("Restored text copied")
            }
        }
    }

    @ViewBuilder
    private var toastView: some View {
        if let toast {
            HStack(spacing: 6) {
                Image(systemName: "checkmark.circle.fill")
                Text(toast).font(BrandFont.sans(12.5, .semibold))
            }
            .foregroundStyle(Brand.successText)
            .padding(.vertical, 7).padding(.horizontal, 13)
            .background(Capsule().fill(Brand.successBg))
            .overlay(Capsule().stroke(Brand.successBorder, lineWidth: 1))
            .padding(.bottom, 16)
            .transition(.move(edge: .bottom).combined(with: .opacity))
        }
    }

    // MARK: Logic

    private var bothFilled: Bool {
        !replyText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty &&
        !tokenMapText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    private func reinstate() {
        errorText = nil
        restored = nil
        hideKeyboard()

        guard let data = tokenMapText.data(using: .utf8),
              let parsed = try? JSONSerialization.jsonObject(with: data),
              let map = parsed as? [String: String], !map.isEmpty else {
            errorText = "That doesn't look like a valid token map. Expecting JSON like { \"[NAME_1]\": \"John Smith\" }."
            Haptics.warning()
            return
        }
        let tokenPattern = #"^\[[A-Z_]+_\d+\]$"#
        guard map.keys.allSatisfy({ $0.range(of: tokenPattern, options: .regularExpression) != nil }) else {
            errorText = "Some keys aren't valid tokens (expected e.g. [NAME_1])."
            Haptics.warning()
            return
        }
        do {
            restored = try engine.reinstate(replyText, tokenMap: map)
            Haptics.success()
        } catch {
            errorText = error.localizedDescription
            Haptics.warning()
        }
    }

    private func flash(_ msg: String) {
        Haptics.success()
        withAnimation { toast = msg }
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.6) {
            withAnimation { if toast == msg { toast = nil } }
        }
    }
}
