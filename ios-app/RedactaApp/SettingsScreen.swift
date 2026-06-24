import SwiftUI

/// Settings tab — default mode, privacy facts, automation, About. Subtle-surface
/// background with white group cards (Direction A).
struct SettingsScreen: View {
    @ModeStorage private var mode
    @State private var showAbout = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 22) {
                HStack {
                    Text("Settings")
                        .font(BrandFont.sans(33, .bold))
                        .foregroundStyle(Brand.textPrimary)
                        .tracking(-0.6)
                    Spacer()
                    HStack(spacing: 10) {
                        AppearanceToggleButton()
                        InfoCircleButton { showAbout = true }
                    }
                }
                .padding(.top, 4)

                section("Default mode") {
                    VStack(alignment: .leading, spacing: 12) {
                        BrandSegmented(selection: $mode)
                        Text(mode.brandDescription)
                            .font(BrandFont.sans(13))
                            .foregroundStyle(Brand.textTertiary)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    .groupCard()
                }

                section("Redact from any app") {
                    shareSheetText
                        .groupCard()
                }

                section("Shortcuts & automation") {
                    shortcutsText
                        .groupCard()
                }

                section("Privacy") {
                    VStack(spacing: 0) {
                        privacyRow("iphone", "Runs entirely on this device", first: true)
                        privacyRow("wifi.slash", "No network — nothing leaves your phone")
                        privacyRow("person.crop.circle.badge.xmark", "No accounts, no analytics")
                        privacyRow("externaldrive.badge.xmark", "Token maps are never stored")
                    }
                    .groupCard(padding: 0)
                }
            }
            .padding(.horizontal, Metrics.sidePadding)
            .padding(.bottom, 12)
        }
        .background(Brand.subtleSurface.ignoresSafeArea())
        .aboveTabBar()
        .sheet(isPresented: $showAbout) { InfoView { showAbout = false } }
    }

    // MARK: Sections

    private func section<Content: View>(_ title: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Eyebrow(text: title)
            content()
        }
    }

    private func privacyRow(_ icon: String, _ label: String, first: Bool = false) -> some View {
        VStack(spacing: 0) {
            if !first { Rectangle().fill(Brand.subtleSurface).frame(height: 1) }
            HStack(spacing: 12) {
                IconChip(systemImage: icon)
                Text(label)
                    .font(BrandFont.sans(14.5, .medium))
                    .foregroundStyle(Brand.textPrimary)
                    .fixedSize(horizontal: false, vertical: true)
                Spacer()
            }
            .padding(14)
        }
    }

    private var shareSheetText: some View {
        (
            Text("Select text in any app — Mail, Safari, Notes — then tap ")
            + Text("Share → Redacta").font(BrandFont.sans(14, .semibold))
            + Text(" to redact it without leaving that app.")
        )
        .font(BrandFont.sans(14))
        .foregroundStyle(Brand.textSecondary)
        .frame(maxWidth: .infinity, alignment: .leading)
        .fixedSize(horizontal: false, vertical: true)
    }

    private var shortcutsText: some View {
        (
            Text("Add the ")
            + Text("Redact Clipboard").font(BrandFont.sans(14, .semibold))
            + Text(" action in Shortcuts, or say ")
            + Text("“Redact clipboard with Redacta”").foregroundColor(Brand.blue)
            + Text(", to clean copied text without opening the app.")
        )
        .font(BrandFont.sans(14))
        .foregroundStyle(Brand.textSecondary)
        .frame(maxWidth: .infinity, alignment: .leading)
        .fixedSize(horizontal: false, vertical: true)
    }

}

private extension View {
    /// White settings group card (radius 18, soft shadow).
    func groupCard(padding: CGFloat = 14) -> some View {
        self
            .padding(padding)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(RoundedRectangle(cornerRadius: 18).fill(Brand.canvas))
            .shadow(color: Color(hex: 0x0B0F1C).opacity(0.05), radius: 3, y: 2)
    }
}
