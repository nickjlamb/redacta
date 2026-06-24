import SwiftUI

// MARK: - Mode labels & descriptions (brand copy)

extension RedactaEngine.Mode {
    /// Short label for the segmented control.
    var shortLabel: String {
        switch self {
        case .clinical:   return "Clinical"
        case .general:    return "General PII"
        case .safeharbor: return "HIPAA"
        }
    }

    /// One-line description shown under the segmented control.
    var brandDescription: String {
        switch self {
        case .clinical:
            return "Clinical identifiers — NHS numbers, names, dates of birth and record IDs."
        case .general:
            return "General PII — emails, phone numbers, postcodes, cards and addresses."
        case .safeharbor:
            return "Strictest — all 18 HIPAA Safe Harbor identifiers, including every date and age."
        }
    }
}

// MARK: - Eyebrow

struct Eyebrow: View {
    let text: String
    var body: some View {
        Text(text.uppercased())
            .font(BrandFont.sans(11, .semibold))
            .tracking(0.8)
            .foregroundStyle(Brand.textMuted)
    }
}

// MARK: - On-device trust chip

struct OnDeviceChip: View {
    var text: String = "On-device · nothing leaves your phone"
    var body: some View {
        HStack(spacing: 6) {
            Image(systemName: "shield")
                .font(.system(size: 11, weight: .semibold))
                .accessibilityHidden(true)
            Text(text)
                .font(BrandFont.sans(12, .semibold))
        }
        .foregroundStyle(Brand.cyan700)
        .padding(.vertical, 5)
        .padding(.horizontal, 11)
        .background(Capsule().fill(Brand.cyan50))
        .overlay(Capsule().stroke(Brand.cyan100, lineWidth: 1))
        .fixedSize(horizontal: false, vertical: true)
        .accessibilityElement(children: .combine)
    }
}

// MARK: - Segmented mode control

struct BrandSegmented: View {
    @Binding var selection: RedactaEngine.Mode
    @Namespace private var ns

    var body: some View {
        HStack(spacing: 0) {
            ForEach(RedactaEngine.Mode.allCases) { mode in
                let active = mode == selection
                Text(mode.shortLabel)
                    .font(BrandFont.sans(14, active ? .semibold : .medium))
                    .foregroundStyle(active ? Brand.blue : Brand.textTertiary)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 9)
                    .background {
                        if active {
                            Capsule()
                                .fill(Brand.canvas)
                                .shadow(color: Color(hex: 0x0B0F1C).opacity(0.12), radius: 1.5, y: 1)
                                .matchedGeometryEffect(id: "thumb", in: ns)
                        }
                    }
                    .contentShape(Rectangle())
                    .onTapGesture {
                        if selection != mode { Haptics.selection() }
                        withAnimation(.easeOut(duration: 0.2)) { selection = mode }
                    }
                    .accessibilityElement(children: .ignore)
                    .accessibilityLabel(mode.shortLabel)
                    .accessibilityHint("Redaction mode")
                    .accessibilityAddTraits(active ? [.isButton, .isSelected] : .isButton)
            }
        }
        .padding(4)
        .background(Capsule().fill(Brand.subtleSurface))
    }
}

// MARK: - Buttons

/// Pressed state: slight darken + 1px down-nudge, per the spec.
struct BrandPressStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .brightness(configuration.isPressed ? -0.04 : 0)
            .offset(y: configuration.isPressed ? 1 : 0)
            .animation(.easeOut(duration: 0.12), value: configuration.isPressed)
    }
}

/// Full-width primary action button (blue → grey when disabled).
struct PrimaryButton: View {
    let title: String
    var systemImage: String
    var enabled: Bool = true
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 8) {
                Image(systemName: systemImage)
                Text(title)
            }
            .font(BrandFont.sans(16, .semibold))
            .foregroundStyle(enabled ? Color.white : Brand.placeholder)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 17)
            .background(RoundedRectangle(cornerRadius: 14).fill(enabled ? Brand.blue : Brand.hairline))
            .shadow(color: enabled ? Brand.blue.opacity(0.28) : .clear, radius: 10, y: 8)
        }
        .buttonStyle(BrandPressStyle())
        .disabled(!enabled)
    }
}

/// Full-width outline button (navy ink text).
struct SecondaryButton: View {
    let title: String
    var systemImage: String
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 8) {
                Image(systemName: systemImage)
                Text(title)
            }
            .font(BrandFont.sans(14, .semibold))
            .foregroundStyle(Brand.navyInk)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 15)
            .background(RoundedRectangle(cornerRadius: 14).fill(Brand.canvas))
            .overlay(RoundedRectangle(cornerRadius: 14).stroke(Brand.inputBorder, lineWidth: 1))
        }
        .buttonStyle(BrandPressStyle())
    }
}

/// Soft-fill button (blue text on blue-soft) — e.g. "Choose photo".
struct SoftButton: View {
    let title: String
    var systemImage: String
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 8) {
                Image(systemName: systemImage)
                Text(title)
            }
            .font(BrandFont.sans(15, .semibold))
            .foregroundStyle(Brand.blue)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 15)
            .background(RoundedRectangle(cornerRadius: 14).fill(Brand.blueSoft))
        }
        .buttonStyle(BrandPressStyle())
    }
}

// MARK: - Card surface

extension View {
    /// White content card: hairline border, rounded, soft rest shadow.
    func brandCard(padding: CGFloat = 14, radius: CGFloat = 16) -> some View {
        self
            .padding(padding)
            .background(RoundedRectangle(cornerRadius: radius).fill(Brand.canvas))
            .overlay(RoundedRectangle(cornerRadius: radius).stroke(Brand.hairline, lineWidth: 1))
            .shadow(color: Color(hex: 0x0B0F1C).opacity(0.05), radius: 3, y: 2)
    }
}

// MARK: - Text input

struct BrandTextEditor: View {
    @Binding var text: String
    var placeholder: String
    /// nil = grow to fill available space.
    var fixedHeight: CGFloat? = nil

    var body: some View {
        ZStack(alignment: .topLeading) {
            if text.isEmpty {
                Text(placeholder)
                    .font(BrandFont.mono(14))
                    .foregroundStyle(Brand.placeholder)
                    .padding(.horizontal, 16)
                    .padding(.vertical, 16)
                    .allowsHitTesting(false)
            }
            TextEditor(text: $text)
                .font(BrandFont.mono(14))
                .foregroundStyle(Brand.textBody)
                .scrollContentBackground(.hidden)
                .padding(.horizontal, 11)
                .padding(.vertical, 9)
        }
        .frame(maxWidth: .infinity)
        .frame(minHeight: fixedHeight, maxHeight: fixedHeight ?? .infinity)
        .background(RoundedRectangle(cornerRadius: 16).fill(Brand.inputFill))
        .overlay(RoundedRectangle(cornerRadius: 16).stroke(Brand.inputBorder, lineWidth: 1))
    }
}

/// Small inline text action (e.g. "Paste", "Try an example"). Blue by default;
/// pass a muted tint for secondary actions like "Clear".
struct InlineAction: View {
    let title: String
    var tint: Color = Brand.blue
    let action: () -> Void
    var body: some View {
        Button(action: action) {
            Text(title).font(BrandFont.sans(13, .semibold)).foregroundStyle(tint)
        }
        .buttonStyle(BrandPressStyle())
    }
}

// MARK: - Violet icon chip (Settings rows)

struct IconChip: View {
    let systemImage: String
    var body: some View {
        RoundedRectangle(cornerRadius: 10, style: .continuous)
            .fill(Brand.violet50)
            .frame(width: 34, height: 34)
            .overlay(
                Image(systemName: systemImage)
                    .font(.system(size: 16, weight: .regular))
                    .foregroundStyle(Brand.violet500)
            )
    }
}

// MARK: - Circular info button

struct InfoCircleButton: View {
    let action: () -> Void
    var body: some View {
        Button(action: action) {
            Image(systemName: "info.circle")
                .font(.system(size: 17, weight: .regular))
                .foregroundStyle(Brand.blue)
                .frame(width: 38, height: 38)
                .background(Circle().fill(Brand.canvas))
                .shadow(color: Color(hex: 0x0B0F1C).opacity(0.10), radius: 4, y: 2)
        }
        .buttonStyle(BrandPressStyle())
        .accessibilityLabel("About Redacta")
    }
}
