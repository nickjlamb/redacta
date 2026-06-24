import SwiftUI

/// Share Sheet surface, in the PharmaTools brand (Direction A). Redacts the
/// shared text on appear; the user can switch mode, copy the safe text, and copy
/// the token map. Everything runs on-device.
struct ShareRootView: View {
    let inputText: String
    let extractionFailed: Bool
    let onClose: () -> Void

    @ModeStorage private var mode
    @ObservedObject private var appearanceStore = AppearanceStore.shared
    @State private var result: RedactionResult?
    @State private var errorMessage: String?
    @State private var toast: String?

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    HStack { BrandMark(); Spacer() }
                    OnDeviceChip()
                    BrandSegmented(selection: $mode)

                    if let result {
                        resultBody(result)
                    } else if let errorMessage {
                        Label(errorMessage, systemImage: "exclamationmark.triangle")
                            .font(BrandFont.sans(14))
                            .foregroundStyle(Brand.textSecondary)
                            .padding(.top, 8)
                    } else {
                        ProgressView()
                            .frame(maxWidth: .infinity, minHeight: 120)
                    }
                }
                .padding(Metrics.sidePadding)
            }
            .background(Brand.canvas)
            .navigationTitle("Redacta")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done", action: onClose).foregroundStyle(Brand.blue)
                }
            }
            .overlay(alignment: .bottom) { toastView }
            .tint(Brand.blue)
        }
        .preferredColorScheme(appearanceStore.appearance.colorScheme)
        .task { redact() }
        .onChange(of: mode) { _ in redact() }
    }

    // MARK: Result

    @ViewBuilder
    private func resultBody(_ result: RedactionResult) -> some View {
        let count = result.report.values.reduce(0, +)

        HStack(alignment: .top, spacing: 10) {
            Image(systemName: "checkmark.circle.fill")
                .font(.system(size: 19)).foregroundStyle(Brand.violet500)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 2) {
                Text("\(count) identifier\(count == 1 ? "" : "s") redacted")
                    .font(BrandFont.sans(14.5, .semibold)).foregroundStyle(Brand.textPrimary)
                Text("Safe to paste into any AI assistant.")
                    .font(BrandFont.sans(12.5)).foregroundStyle(Brand.textTertiary)
            }
            Spacer()
        }
        .padding(14)
        .background(RoundedRectangle(cornerRadius: 16).fill(Brand.aiPanel))
        .overlay(RoundedRectangle(cornerRadius: 16).stroke(Brand.violet100, lineWidth: 1))
        .accessibilityElement(children: .combine)

        TokenizedText(text: result.text)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(16)
            .background(RoundedRectangle(cornerRadius: 16).fill(Brand.inputFill))
            .overlay(RoundedRectangle(cornerRadius: 16).stroke(Brand.hairline, lineWidth: 1))
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("Redacted text. \(result.text)")

        PrimaryButton(title: "Copy redacted text", systemImage: "doc.on.doc") {
            UIPasteboard.general.string = result.text
            flash("Redacted text copied")
        }
        if !result.tokenMap.isEmpty {
            SecondaryButton(title: "Copy token map", systemImage: "list.bullet") {
                UIPasteboard.general.string = tokenMapJSON(result.tokenMap)
                flash("Token map copied")
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

    private func redact() {
        errorMessage = nil
        if extractionFailed || inputText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            result = nil
            errorMessage = "No selectable text was shared. Select text (not an image) and try again."
            return
        }
        do {
            result = try RedactaEngine.shared.redact(inputText, modes: [mode])
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func tokenMapJSON(_ map: [String: String]) -> String {
        guard let data = try? JSONSerialization.data(
            withJSONObject: map, options: [.prettyPrinted, .sortedKeys]),
            let s = String(data: data, encoding: .utf8) else { return "{}" }
        return s
    }

    private func flash(_ msg: String) {
        Haptics.success()
        withAnimation { toast = msg }
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.6) {
            withAnimation { if toast == msg { toast = nil } }
        }
    }
}
