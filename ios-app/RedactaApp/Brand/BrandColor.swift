import SwiftUI
import UIKit

extension Color {
    /// Hex initializer, e.g. Color(hex: 0x2036F5).
    init(hex: UInt32) {
        self.init(
            .sRGB,
            red:   Double((hex >> 16) & 0xFF) / 255,
            green: Double((hex >> 8) & 0xFF) / 255,
            blue:  Double(hex & 0xFF) / 255,
            opacity: 1
        )
    }

    /// Adapts between light and dark appearances (follows the system setting).
    init(light: UInt32, dark: UInt32) {
        self = Color(uiColor: UIColor { trait in
            trait.userInterfaceStyle == .dark ? UIColor(rgb: dark) : UIColor(rgb: light)
        })
    }
}

private extension UIColor {
    convenience init(rgb: UInt32) {
        self.init(
            red:   CGFloat((rgb >> 16) & 0xFF) / 255,
            green: CGFloat((rgb >> 8) & 0xFF) / 255,
            blue:  CGFloat(rgb & 0xFF) / 255,
            alpha: 1
        )
    }
}

/// PharmaTools.AI design-system colors (Direction A), light + dark.
/// Blue = actions, violet = the redaction/AI/token moment, cyan = the on-device note.
enum Brand {
    // Brand / actions
    static let blue        = Color(light: 0x2036F5, dark: 0x5468FF)
    static let navyInk     = Color(light: 0x1A2A8C, dark: 0xAAB4FF)
    static let blueSoft    = Color(light: 0xEEF1FF, dark: 0x1E2552)

    // Violet — redaction / AI / token moment
    static let violet700   = Color(light: 0x5A36B0, dark: 0xCBB4FF)
    static let violet500   = Color(light: 0x8958FE, dark: 0xAC8CFF)
    static let violet50    = Color(light: 0xF4EEFF, dark: 0x271E40)
    static let violet100   = Color(light: 0xE4D6FF, dark: 0x3D2F63)
    static let aiPanel     = Color(light: 0xF8F4FF, dark: 0x1C1633)

    // Cyan — on-device trust
    static let cyan700     = Color(light: 0x1F8AB5, dark: 0x63C9EE)
    static let cyan50      = Color(light: 0xECFAFF, dark: 0x0E2630)
    static let cyan100     = Color(light: 0xCFF2FF, dark: 0x1E3F4F)
    static let cyan500     = Color(light: 0x46CDFF, dark: 0x46CDFF)

    // Success
    static let successText   = Color(light: 0x0F5A3C, dark: 0x86E2B4)
    static let successBg     = Color(light: 0xE4F8EF, dark: 0x12281E)
    static let successBorder = Color(light: 0xBFEBD6, dark: 0x25503B)

    // Text
    static let textPrimary   = Color(light: 0x0B0F1C, dark: 0xF3F5FB)
    static let textBody      = Color(light: 0x2A3247, dark: 0xD5DBEA)
    static let textSecondary = Color(light: 0x404A60, dark: 0xB2BACE)
    static let textTertiary  = Color(light: 0x5F6B82, dark: 0x95A0B6)
    static let textMuted     = Color(light: 0x8B96AC, dark: 0x727E96)
    static let placeholder   = Color(light: 0xB6C0D1, dark: 0x565F73)

    // Surfaces
    static let canvas        = Color(light: 0xFFFFFF, dark: 0x161C2B)
    static let inputFill     = Color(light: 0xFAFBFF, dark: 0x1C2434)
    static let subtleSurface = Color(light: 0xF4F6FB, dark: 0x0E1320)
    static let hairline      = Color(light: 0xE9EDF6, dark: 0x2A3346)
    static let inputBorder   = Color(light: 0xD5DCE9, dark: 0x39435A)
}
