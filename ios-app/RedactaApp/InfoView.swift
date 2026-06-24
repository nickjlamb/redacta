import SwiftUI

// MARK: - Editable config

private enum Links {
    static let supportEmail = "support@pharmatools.ai"
    static let privacyPolicy = URL(string: "https://www.pharmatools.ai/privacy-policy")!
    static let termsOfUse = URL(string: "https://www.pharmatools.ai/terms")!
    static let pharmaTools = URL(string: "https://www.pharmatools.ai")!
}

/// One cross-promoted app.
private struct OtherApp: Identifiable {
    let id = UUID()
    let name: String
    let blurb: String
    /// Asset-catalog image name (an .imageset). Falls back to `symbol` if absent.
    let image: String
    let symbol: String
    let tint: Color
    let url: URL

    static let all: [OtherApp] = [
        OtherApp(
            name: "Patiently AI",
            blurb: "Turn complex medical notes into patient-friendly explanations in seconds",
            image: "PatientlyAI",
            symbol: "stethoscope",
            tint: Color(red: 0.18, green: 0.62, blue: 0.55),
            url: URL(string: "https://apps.apple.com/us/app/patiently-ai-simplify-notes/id6739538685")!
        ),
        OtherApp(
            name: "PosterLens",
            blurb: "Scan and chat with scientific posters at conferences",
            image: "PosterLens",
            symbol: "camera.viewfinder",
            tint: Color(red: 0.95, green: 0.55, blue: 0.20),
            url: URL(string: "https://apps.apple.com/us/app/posterlens-research-scanner/id6745453368")!
        ),
        OtherApp(
            name: "MedCheckr ABPI",
            blurb: "Ensure your pharmaceutical claims comply with the ABPI Code of Practice instantly",
            image: "MedCheckrABPI",
            symbol: "checkmark.shield.fill",
            tint: Color(red: 0.20, green: 0.48, blue: 0.95),
            url: URL(string: "https://apps.apple.com/us/app/medcheckr-abpi/id6741887343")!
        ),
        OtherApp(
            name: "TrialGen",
            blurb: "Need the perfect name for your clinical trial? Try TrialGen!",
            image: "TrialGen",
            symbol: "list.clipboard.fill",
            tint: Color(red: 0.22, green: 0.72, blue: 0.46),
            url: URL(string: "https://apps.apple.com/us/app/trialgen-trial-name-generator/id6743369813")!
        ),
        OtherApp(
            name: "HushMap",
            blurb: "Find sensory-friendly quiet spaces near you",
            image: "HushMap",
            symbol: "mappin.and.ellipse",
            tint: Color(red: 0.42, green: 0.40, blue: 0.85),
            url: URL(string: "https://apps.apple.com/us/app/hushmap/id6748575846")!
        ),
    ]
}

/// "About Redacta" modal: support, legal, and other PharmaTools apps.
struct InfoView: View {
    let onClose: () -> Void

    @AppStorage("redacta.hasSeenWelcome") private var hasSeenWelcome = false
    @Environment(\.openURL) private var openURL

    var body: some View {
        NavigationStack {
            Form {
                redactaSection
                supportSection
                appsSection
                aboutSection
                footer
            }
            .navigationTitle("About Redacta")
            .navigationBarTitleDisplayMode(.inline)
            .tint(Brand.blue)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done", action: onClose).foregroundStyle(Brand.blue)
                }
            }
        }
    }

    // MARK: Sections

    private var redactaSection: some View {
        Section {
            HStack(spacing: 12) {
                Image("RedactaIcon")
                    .resizable()
                    .scaledToFill()
                    .frame(width: 44, height: 44)
                    .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                VStack(alignment: .leading, spacing: 2) {
                    Text("Redacta")
                        .font(BrandFont.sans(17, .semibold))
                        .foregroundStyle(Brand.textPrimary)
                    Text("On-device redaction — nothing leaves your phone.")
                        .font(BrandFont.sans(12))
                        .foregroundStyle(Brand.textTertiary)
                }
            }
            .padding(.vertical, 4)
        }
    }

    private var supportSection: some View {
        Section("Support & Legal") {
            Button {
                if let url = URL(string: "mailto:\(Links.supportEmail)") { openURL(url) }
            } label: {
                row("envelope", "Contact Support", trailing: Links.supportEmail)
            }
            Button { openURL(Links.privacyPolicy) } label: {
                row("lock.shield", "Privacy Policy", chevron: true)
            }
            Button { openURL(Links.termsOfUse) } label: {
                row("doc.text", "Terms of Use", chevron: true)
            }
            Button { hasSeenWelcome = false; onClose() } label: {
                row("arrow.clockwise", "Reset Onboarding")
            }
        }
        .tint(.primary)
    }

    private var appsSection: some View {
        Section("More from PharmaTools.AI") {
            ForEach(OtherApp.all) { app in
                Button { openURL(app.url) } label: { appRow(app) }
            }
        }
        .tint(.primary)
    }

    private var aboutSection: some View {
        Section {
            LabeledContent("Version", value: appVersion)
        } header: {
            Text("About")
        } footer: {
            Text("Redacta uses one engine across iOS, the Claude skill, MCP server, CLI and design-tool plugins.")
        }
    }

    private var appVersion: String {
        let v = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "1.0"
        let b = Bundle.main.infoDictionary?["CFBundleVersion"] as? String ?? "1"
        return "\(v) (\(b))"
    }

    private var footer: some View {
        Section {
            Button { openURL(Links.pharmaTools) } label: {
                Text("PharmaTools.AI")
                    .font(BrandFont.sans(14, .semibold))
                    .foregroundStyle(Brand.blue)
                    .frame(maxWidth: .infinity)
            }
            Text("© 2026 PharmaTools.AI")
                .font(.caption).foregroundStyle(.tertiary)
                .frame(maxWidth: .infinity)
        }
        .listRowBackground(Color.clear)
    }

    // MARK: Row builders

    private func row(_ icon: String, _ title: String, trailing: String? = nil, chevron: Bool = false) -> some View {
        HStack {
            Image(systemName: icon).foregroundStyle(Brand.blue).frame(width: 26)
            Text(title)
            Spacer()
            if let trailing {
                Text(trailing).font(.caption).foregroundStyle(.secondary)
            }
            if chevron {
                Image(systemName: "chevron.right").font(.caption).foregroundStyle(.tertiary)
            }
        }
    }

    private func appRow(_ app: OtherApp) -> some View {
        HStack(spacing: 12) {
            appIcon(app)
                .frame(width: 38, height: 38)
                .clipShape(RoundedRectangle(cornerRadius: 9, style: .continuous))
            VStack(alignment: .leading, spacing: 2) {
                Text(app.name).font(.subheadline.weight(.semibold))
                Text(app.blurb).font(.caption).foregroundStyle(.secondary)
            }
            Spacer()
            Image(systemName: "arrow.up.right.square")
                .foregroundStyle(.tertiary)
        }
        .padding(.vertical, 2)
    }

    /// Real app icon if the imageset has artwork; otherwise a tinted SF Symbol.
    @ViewBuilder
    private func appIcon(_ app: OtherApp) -> some View {
        if UIImage(named: app.image) != nil {
            Image(app.image).resizable().scaledToFill()
        } else {
            RoundedRectangle(cornerRadius: 9, style: .continuous)
                .fill(app.tint)
                .overlay(Image(systemName: app.symbol).foregroundStyle(.white))
        }
    }
}

// MARK: - Reusable toolbar button

/// Adds a top-right info button that presents the About modal. One source of
/// truth so every screen shows the same control.
private struct AboutToolbarButton: ViewModifier {
    @State private var show = false

    func body(content: Content) -> some View {
        content
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button { show = true } label: {
                        Image(systemName: "info.circle")
                    }
                    .accessibilityLabel("About Redacta")
                }
            }
            .sheet(isPresented: $show) {
                InfoView { show = false }
            }
    }
}

extension View {
    /// Adds the standard "About Redacta" info button to a screen's navigation bar.
    func aboutToolbarButton() -> some View {
        modifier(AboutToolbarButton())
    }
}

#Preview {
    InfoView(onClose: {})
}
