import SwiftUI

/// Redact tab — empty state. Paste/scan clinical text, pick a mode, run redaction,
/// then push to the Redacted result.
struct RedactScreen: View {
    @EnvironmentObject private var session: Session
    @ModeStorage private var mode
    @State private var input: String = ""
    @State private var result: RedactionResult?
    @State private var showResult = false
    @State private var showInfo = false
    @State private var errorText: String?

    private let engine = RedactaEngine.shared

    var body: some View {
        NavigationStack {
            VStack(spacing: 16) {
                ScreenHeader { showInfo = true }

                VStack(alignment: .leading, spacing: 12) {
                    ScreenTitle("Redacta")
                    Text("Redact patient identifiers before text reaches AI.")
                        .font(BrandFont.sans(17, .medium))
                        .foregroundStyle(Brand.textPrimary)
                        .fixedSize(horizontal: false, vertical: true)
                    OnDeviceChip()
                    BrandSegmented(selection: $mode)
                        .padding(.top, 4)
                    Text(mode.brandDescription)
                        .font(BrandFont.sans(13))
                        .foregroundStyle(Brand.textTertiary)
                        .fixedSize(horizontal: false, vertical: true)
                }

                HStack(spacing: 16) {
                    Text("Clinical text")
                        .font(BrandFont.sans(13, .medium))
                        .foregroundStyle(Brand.textTertiary)
                    Spacer()
                    if input.isEmpty {
                        InlineAction(title: "Try an example") {
                            input = SampleData.clinicalNote
                        }
                    } else {
                        InlineAction(title: "Clear", tint: Brand.textMuted) {
                            input = ""
                            errorText = nil
                        }
                    }
                    InlineAction(title: "Paste") {
                        if let s = UIPasteboard.general.string { input = s }
                    }
                }
                .padding(.top, 4)

                BrandTextEditor(
                    text: $input,
                    placeholder: "e.g. Patient John Smith, NHS 943 476 5919, DOB 12/03/1981…"
                )

                if let errorText {
                    Label(errorText, systemImage: "exclamationmark.triangle.fill")
                        .font(BrandFont.sans(13))
                        .foregroundStyle(Brand.violet700)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }

                PrimaryButton(title: "Redact", systemImage: "wand.and.stars",
                              enabled: !trimmedEmpty) {
                    redact()
                }
            }
            .padding(.horizontal, Metrics.sidePadding)
            .padding(.top, 6)
            .padding(.bottom, 10)
            .background(Brand.canvas)
            .aboveTabBar()
            .toolbar(.hidden, for: .navigationBar)
            .scrollDismissesKeyboard(.interactively)
            .navigationDestination(isPresented: $showResult) {
                if let result {
                    RedactResultScreen(result: result, mode: mode) { showResult = false }
                }
            }
            .sheet(isPresented: $showInfo) { InfoView { showInfo = false } }
            .keyboardDoneButton()
        }
    }

    private var trimmedEmpty: Bool {
        input.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    private func redact() {
        guard !trimmedEmpty else { return }
        errorText = nil
        do {
            let r = try engine.redact(input, modes: [mode])
            result = r
            session.record(r.tokenMap)
            hideKeyboard()
            showResult = true
            Haptics.success()
        } catch {
            // Engine is deterministic and local; failures are unexpected.
            result = nil
            errorText = "Redaction couldn't run. Please try again. (\(error.localizedDescription))"
            Haptics.warning()
        }
    }
}
