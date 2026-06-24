import WidgetKit
import SwiftUI
import AppIntents

@main
struct RedactaWidgetBundle: WidgetBundle {
    var body: some Widget {
        RedactClipboardWidget()
    }
}

/// A Home/Lock Screen tile that redacts the clipboard in place on tap, reusing
/// the app's RedactClipboardIntent. Interactive widgets require iOS 17+.
struct RedactClipboardWidget: Widget {
    let kind = "RedactClipboardWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: Provider()) { _ in
            RedactClipboardWidgetView()
                .containerBackground(Brand.blue, for: .widget)
        }
        .configurationDisplayName("Redact Clipboard")
        .description("Redact patient identifiers in your clipboard, on-device.")
        .supportedFamilies([.systemSmall])
    }
}

private struct Entry: TimelineEntry { let date: Date }

private struct Provider: TimelineProvider {
    func placeholder(in context: Context) -> Entry { Entry(date: .now) }
    func getSnapshot(in context: Context, completion: @escaping (Entry) -> Void) {
        completion(Entry(date: .now))
    }
    func getTimeline(in context: Context, completion: @escaping (Timeline<Entry>) -> Void) {
        completion(Timeline(entries: [Entry(date: .now)], policy: .never))
    }
}

private struct RedactClipboardWidgetView: View {
    var body: some View {
        Button(intent: RedactClipboardIntent()) {
            VStack(alignment: .leading, spacing: 0) {
                BrandMark(color: .white, width: 34)
                Spacer(minLength: 8)
                Text("Redact clipboard")
                    .font(BrandFont.sans(15, .semibold))
                    .foregroundStyle(.white)
                Text("On-device · tap to clean")
                    .font(BrandFont.sans(11))
                    .foregroundStyle(.white.opacity(0.85))
                    .fixedSize(horizontal: false, vertical: true)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
        }
        .buttonStyle(.plain)
    }
}
