import SwiftUI
import UIKit

/// Brand typography: Poppins (sans) + JetBrains Mono (mono).
///
/// Sizes are anchored to the design but declared `relativeTo:` a text style, so
/// they scale with the user's Dynamic Type setting (accessibility). If a TTF is
/// missing the system font is used — still scaled.
enum BrandFont {
    static func sans(_ size: CGFloat, _ weight: Font.Weight = .regular) -> Font {
        .custom(poppinsName(weight), size: size, relativeTo: textStyle(for: size))
    }

    static func mono(_ size: CGFloat, _ weight: Font.Weight = .regular) -> Font {
        let name = weight.isMediumOrBolder ? "JetBrainsMono-Medium" : "JetBrainsMono-Regular"
        return .custom(name, size: size, relativeTo: textStyle(for: size))
    }

    private static func poppinsName(_ weight: Font.Weight) -> String {
        switch weight {
        case .bold, .heavy, .black: return "Poppins-Bold"
        case .semibold:             return "Poppins-SemiBold"
        case .medium:               return "Poppins-Medium"
        case .light, .thin:         return "Poppins-Light"
        default:                    return "Poppins-Regular"
        }
    }

    /// Nearest text style, so Dynamic Type scales each size sensibly.
    private static func textStyle(for size: CGFloat) -> Font.TextStyle {
        switch size {
        case 30...:    return .largeTitle
        case 24..<30:  return .title
        case 21..<24:  return .title2
        case 19..<21:  return .title3
        case 16.5..<19: return .body
        case 15..<16.5: return .callout
        case 13.5..<15: return .subheadline
        case 13..<13.5: return .footnote
        case 12..<13:  return .caption
        default:       return .caption2
        }
    }
}

private extension Font.Weight {
    var isMediumOrBolder: Bool {
        switch self {
        case .medium, .semibold, .bold, .heavy, .black: return true
        default: return false
        }
    }
}
