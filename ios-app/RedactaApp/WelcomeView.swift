import SwiftUI

/// First-run welcome (brand). Explains the privacy model and the two fastest ways
/// to use Redacta (Share Sheet, Shortcuts). Shown once, tracked with @AppStorage.
struct WelcomeView: View {
    let onDismiss: () -> Void

    var body: some View {
        VStack(spacing: 0) {
            ScrollView {
                VStack(alignment: .leading, spacing: 28) {
                    VStack(alignment: .leading, spacing: 12) {
                        BrandMark(width: 40)
                        Text("Redact patient data before it reaches AI")
                            .font(BrandFont.sans(26, .bold))
                            .foregroundStyle(Brand.textPrimary)
                            .tracking(-0.4)
                            .fixedSize(horizontal: false, vertical: true)
                        Text("Replace identifiers with tokens, then paste the safe text into ChatGPT or Claude.")
                            .font(BrandFont.sans(15))
                            .foregroundStyle(Brand.textTertiary)
                            .fixedSize(horizontal: false, vertical: true)
                    }

                    VStack(alignment: .leading, spacing: 18) {
                        point("smartphone", "Everything runs on this device",
                              "No network, no accounts, no analytics. Nothing leaves your phone.")
                        point("square.and.arrow.up", "Use it anywhere via Share",
                              "Select text in any app → Share → Redacta → Copy the clean version.")
                        point("wand.and.stars", "Or run a Shortcut",
                              "Say “Redact clipboard with Redacta” to clean copied text hands-free.")
                        point("lock.rotation", "Reverse it when you’re done",
                              "Keep the token map in-session to put real values back into the AI’s reply.")
                    }
                }
                .padding(24)
            }

            VStack(spacing: 0) {
                Rectangle().fill(Brand.hairline).frame(height: 1)
                PrimaryButton(title: "Get started", systemImage: "arrow.right") {
                    onDismiss()
                }
                .padding(20)
            }
        }
        .background(Brand.canvas)
    }

    private func point(_ icon: String, _ title: String, _ body: String) -> some View {
        HStack(alignment: .top, spacing: 14) {
            IconChip(systemImage: iconName(icon))
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(BrandFont.sans(15, .semibold))
                    .foregroundStyle(Brand.textPrimary)
                Text(body)
                    .font(BrandFont.sans(12.5))
                    .foregroundStyle(Brand.textTertiary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }

    /// Maps the Lucide-style names in the copy to SF Symbols.
    private func iconName(_ name: String) -> String {
        switch name {
        case "smartphone": return "iphone"
        default: return name
        }
    }
}

#Preview {
    WelcomeView(onDismiss: {})
}
