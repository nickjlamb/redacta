import SwiftUI

enum Metrics {
    /// Screen content side padding (Direction A).
    static let sidePadding: CGFloat = 22
    /// Space each screen reserves at the bottom for the floating tab bar.
    static let tabBarReserve: CGFloat = 64
}

extension View {
    /// Reserve room at the bottom for the floating `BrandTabBar`, applied *inside*
    /// a screen's NavigationStack so non-scrolling content clears the bar.
    func aboveTabBar() -> some View {
        safeAreaInset(edge: .bottom, spacing: 0) {
            Color.clear.frame(height: Metrics.tabBarReserve)
        }
    }
}

/// Standard header row: brandmark on the left; appearance toggle + info button
/// on the right.
struct ScreenHeader: View {
    var onInfo: () -> Void
    var body: some View {
        HStack {
            BrandMark()
            Spacer()
            HStack(spacing: 10) {
                AppearanceToggleButton()
                InfoCircleButton(action: onInfo)
            }
        }
    }
}

/// Large screen title (33/700) with optional trailing accessory (e.g. mode pill).
struct ScreenTitle<Trailing: View>: View {
    let text: String
    @ViewBuilder var trailing: () -> Trailing

    init(_ text: String, @ViewBuilder trailing: @escaping () -> Trailing = { EmptyView() }) {
        self.text = text
        self.trailing = trailing
    }

    var body: some View {
        HStack(alignment: .firstTextBaseline) {
            Text(text)
                .font(BrandFont.sans(33, .bold))
                .foregroundStyle(Brand.textPrimary)
                .tracking(-0.6)
            Spacer()
            trailing()
        }
    }
}
