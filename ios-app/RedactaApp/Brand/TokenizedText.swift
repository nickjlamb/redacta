import SwiftUI

/// A single token pill, e.g. [NAME_1].
struct TokenPill: View {
    let text: String
    var body: some View {
        Text(text)
            .font(BrandFont.mono(11.5))
            .foregroundStyle(Brand.violet700)
            .padding(.vertical, 1)
            .padding(.horizontal, 6)
            .background(RoundedRectangle(cornerRadius: 6).fill(Brand.violet50))
            .overlay(RoundedRectangle(cornerRadius: 6).stroke(Brand.violet100, lineWidth: 1))
    }
}

/// Renders redacted text as flowing mono text where `[TOKEN_1]` spans become
/// violet pills — the visual redaction "reveal". Whitespace-delimited words wrap;
/// punctuation attached to a token stays tight to its pill.
struct TokenizedText: View {
    let text: String

    private static let tokenRegex = try! NSRegularExpression(pattern: "\\[[A-Z_]+_\\d+\\]")

    var body: some View {
        FlowLayout(hSpacing: 5, vSpacing: 7) {
            ForEach(Array(items.enumerated()), id: \.offset) { _, item in
                itemView(item)
            }
        }
    }

    /// Whitespace-delimited chunks; each may contain tokens + punctuation.
    private var items: [String] {
        text.split(whereSeparator: { $0 == " " || $0 == "\n" || $0 == "\t" }).map(String.init)
    }

    @ViewBuilder
    private func itemView(_ item: String) -> some View {
        let runs = split(item)
        HStack(spacing: 0) {
            ForEach(Array(runs.enumerated()), id: \.offset) { _, run in
                if run.isToken {
                    TokenPill(text: run.text)
                } else {
                    Text(run.text)
                        .font(BrandFont.mono(13))
                        .foregroundStyle(Brand.textBody)
                }
            }
        }
    }

    private struct Run { let text: String; let isToken: Bool }

    /// Split one chunk into alternating literal / token runs.
    private func split(_ chunk: String) -> [Run] {
        let ns = chunk as NSString
        let matches = Self.tokenRegex.matches(in: chunk, range: NSRange(location: 0, length: ns.length))
        guard !matches.isEmpty else { return [Run(text: chunk, isToken: false)] }

        var runs: [Run] = []
        var cursor = 0
        for m in matches {
            if m.range.location > cursor {
                runs.append(Run(text: ns.substring(with: NSRange(location: cursor, length: m.range.location - cursor)),
                                isToken: false))
            }
            runs.append(Run(text: ns.substring(with: m.range), isToken: true))
            cursor = m.range.location + m.range.length
        }
        if cursor < ns.length {
            runs.append(Run(text: ns.substring(from: cursor), isToken: false))
        }
        return runs
    }
}

/// Simple wrapping flow layout (iOS 16+ Layout). Lays subviews left-to-right,
/// wrapping to the next line when the row width is exceeded.
struct FlowLayout: Layout {
    var hSpacing: CGFloat = 5
    var vSpacing: CGFloat = 7

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout Void) -> CGSize {
        let maxWidth = proposal.width ?? .infinity
        let rows = rows(maxWidth: maxWidth, subviews: subviews)
        let width = proposal.width ?? rows.map(\.width).max() ?? 0
        let height = rows.reduce(0) { $0 + $1.height } + CGFloat(max(0, rows.count - 1)) * vSpacing
        return CGSize(width: width, height: height)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout Void) {
        let rows = rows(maxWidth: bounds.width, subviews: subviews)
        var y = bounds.minY
        for row in rows {
            var x = bounds.minX
            for index in row.indices {
                let size = subviews[index].sizeThatFits(.unspecified)
                subviews[index].place(
                    at: CGPoint(x: x, y: y + (row.height - size.height) / 2),
                    proposal: ProposedViewSize(size)
                )
                x += size.width + hSpacing
            }
            y += row.height + vSpacing
        }
    }

    private struct Row { var indices: [Int] = []; var width: CGFloat = 0; var height: CGFloat = 0 }

    private func rows(maxWidth: CGFloat, subviews: Subviews) -> [Row] {
        var rows: [Row] = []
        var current = Row()
        for index in subviews.indices {
            let size = subviews[index].sizeThatFits(.unspecified)
            let projected = current.width == 0 ? size.width : current.width + hSpacing + size.width
            if projected > maxWidth, !current.indices.isEmpty {
                rows.append(current)
                current = Row()
                current.indices = [index]
                current.width = size.width
                current.height = size.height
            } else {
                current.indices.append(index)
                current.width = current.width == 0 ? size.width : current.width + hSpacing + size.width
                current.height = max(current.height, size.height)
            }
        }
        if !current.indices.isEmpty { rows.append(current) }
        return rows
    }
}
