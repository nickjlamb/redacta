import SwiftUI

/// Redact tab — result state. Shows the safe text with token pills, the count,
/// and actions to copy it or save the token map for reinstating.
struct RedactResultScreen: View {
    let result: RedactionResult
    let mode: RedactaEngine.Mode
    let onClose: () -> Void

    @State private var toast: String?

    var body: some View {
        VStack(spacing: 16) {
            header

            VStack(alignment: .leading, spacing: 14) {
                successBanner

                Eyebrow(text: "Redacted text")

                ScrollView {
                    TokenizedText(text: result.text)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .accessibilityElement(children: .ignore)
                        .accessibilityLabel("Redacted text. \(result.text)")
                }
                .frame(maxHeight: .infinity)
                .padding(16)
                .background(RoundedRectangle(cornerRadius: 16).fill(Brand.inputFill))
                .overlay(RoundedRectangle(cornerRadius: 16).stroke(Brand.hairline, lineWidth: 1))
            }

            VStack(spacing: 10) {
                PrimaryButton(title: "Copy redacted text", systemImage: "doc.on.doc") {
                    UIPasteboard.general.string = result.text
                    flash("Redacted text copied")
                }
                SecondaryButton(title: "Save token map for reinstating", systemImage: "list.bullet") {
                    UIPasteboard.general.string = tokenMapJSON
                    flash("Token map copied")
                }
                Text("Keep the token map to put real values back into the AI's reply.")
                    .font(BrandFont.sans(11.5))
                    .foregroundStyle(Brand.textMuted)
                    .multilineTextAlignment(.center)
                    .frame(maxWidth: .infinity)
            }
        }
        .padding(.horizontal, Metrics.sidePadding)
        .padding(.top, 6)
        .padding(.bottom, 10)
        .background(Brand.canvas)
        .aboveTabBar()
        .toolbar(.hidden, for: .navigationBar)
        .overlay(alignment: .bottom) { toastView }
    }

    // MARK: Pieces

    private var header: some View {
        HStack(spacing: 8) {
            Button(action: onClose) {
                Image(systemName: "chevron.left")
                    .font(.system(size: 19, weight: .semibold))
                    .foregroundStyle(Brand.blue)
            }
            .buttonStyle(BrandPressStyle())
            Text("Redacted")
                .font(BrandFont.sans(22, .bold))
                .foregroundStyle(Brand.textPrimary)
            Spacer()
            Text(mode.shortLabel)
                .font(BrandFont.sans(11, .semibold))
                .foregroundStyle(Brand.textTertiary)
                .padding(.vertical, 5)
                .padding(.horizontal, 11)
                .background(Capsule().fill(Brand.subtleSurface))
        }
    }

    private var successBanner: some View {
        HStack(alignment: .top, spacing: 10) {
            Image(systemName: "checkmark.circle.fill")
                .font(.system(size: 19))
                .foregroundStyle(Brand.violet500)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 2) {
                Text("\(identifierCount) identifier\(identifierCount == 1 ? "" : "s") redacted")
                    .font(BrandFont.sans(14.5, .semibold))
                    .foregroundStyle(Brand.textPrimary)
                Text("Safe to paste into any AI assistant.")
                    .font(BrandFont.sans(12.5))
                    .foregroundStyle(Brand.textTertiary)
            }
            Spacer()
        }
        .padding(14)
        .background(RoundedRectangle(cornerRadius: 16).fill(Brand.aiPanel))
        .overlay(RoundedRectangle(cornerRadius: 16).stroke(Brand.violet100, lineWidth: 1))
        .accessibilityElement(children: .combine)
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

    // MARK: Data

    private var identifierCount: Int { result.report.values.reduce(0, +) }

    private var tokenMapJSON: String {
        guard let data = try? JSONSerialization.data(
            withJSONObject: result.tokenMap, options: [.prettyPrinted, .sortedKeys]),
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
