import SwiftUI

enum BrandTab: String, CaseIterable, Identifiable {
    case redact, scan, reinstate, settings
    var id: String { rawValue }

    var title: String {
        switch self {
        case .redact:    return "Redact"
        case .scan:      return "Scan"
        case .reinstate: return "Reinstate"
        case .settings:  return "Settings"
        }
    }

    var icon: String {
        switch self {
        case .redact:    return "wand.and.stars"
        case .scan:      return "doc.viewfinder"
        case .reinstate: return "arrow.uturn.backward"
        case .settings:  return "gearshape"
        }
    }
}

/// Custom bottom tab bar: white with a hairline top border; the active item's
/// icon sits in a blue-soft pill, with a blue label. Matches Direction A.
struct BrandTabBar: View {
    @Binding var selection: BrandTab

    var body: some View {
        HStack(spacing: 0) {
            ForEach(BrandTab.allCases) { tab in
                let active = tab == selection
                Button {
                    if selection != tab { Haptics.selection() }
                    withAnimation(.easeOut(duration: 0.2)) { selection = tab }
                } label: {
                    VStack(spacing: 4) {
                        Image(systemName: tab.icon)
                            .font(.system(size: 20, weight: .regular))
                            .frame(width: 58, height: 30)
                            .background {
                                if active { Capsule().fill(Brand.blueSoft) }
                            }
                        Text(tab.title)
                            .font(BrandFont.sans(10, .semibold))
                    }
                    .foregroundStyle(active ? Brand.blue : Brand.textMuted)
                    .frame(maxWidth: .infinity)
                }
                .buttonStyle(.plain)
                .accessibilityElement(children: .ignore)
                .accessibilityLabel(tab.title)
                .accessibilityAddTraits(active ? [.isButton, .isSelected] : .isButton)
            }
        }
        .padding(.top, 9)
        .padding(.horizontal, 12)
        .padding(.bottom, 6)
        .background(Brand.canvas.ignoresSafeArea(edges: .bottom))
        .overlay(alignment: .top) {
            Rectangle().fill(Brand.hairline).frame(height: 1)
        }
        .ignoresSafeArea(.keyboard, edges: .bottom)
    }
}
