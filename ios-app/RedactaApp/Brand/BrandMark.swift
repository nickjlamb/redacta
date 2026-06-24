import SwiftUI

/// PharmaTools brandmark: four stacked rounded bars of decreasing width — which
/// doubles as a "redacted lines" motif. Geometry from the design system
/// (viewBox 0 0 80 64; bar height 8, radius 4).
struct BrandMark: View {
    var color: Color = Brand.blue
    var width: CGFloat = 30

    private let bars: [(y: CGFloat, w: CGFloat)] = [(6, 68), (20, 56), (34, 44), (48, 28)]

    var body: some View {
        Canvas { ctx, size in
            let sx = size.width / 80
            let sy = size.height / 64
            for bar in bars {
                let rect = CGRect(x: 0, y: bar.y * sy, width: bar.w * sx, height: 8 * sy)
                ctx.fill(Path(roundedRect: rect, cornerRadius: 4 * min(sx, sy)),
                         with: .color(color))
            }
        }
        .frame(width: width, height: width * 64 / 80)
        .accessibilityHidden(true)
    }
}
