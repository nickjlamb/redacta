import SwiftUI
import PhotosUI

/// Scan tab — capture/choose a document photo, OCR it on-device, then redact and
/// push the Redacted result.
struct ScanScreen: View {
    @EnvironmentObject private var session: Session
    @ModeStorage private var mode
    @State private var pickerItem: PhotosPickerItem?
    @State private var result: RedactionResult?
    @State private var showResult = false
    @State private var showCamera = false
    @State private var showInfo = false
    @State private var recognizing = false
    @State private var errorText: String?

    private let engine = RedactaEngine.shared

    var body: some View {
        NavigationStack {
            VStack(spacing: 16) {
                ScreenHeader { showInfo = true }

                VStack(alignment: .leading, spacing: 12) {
                    ScreenTitle("Scan")
                    Text("Photograph a letter, extract the text, redact it.")
                        .font(BrandFont.sans(17, .medium))
                        .foregroundStyle(Brand.textPrimary)
                        .fixedSize(horizontal: false, vertical: true)
                    OnDeviceChip(text: "Recognition on-device · the image never leaves your phone")
                }

                HStack(spacing: 12) {
                    PrimaryButton(title: "Camera", systemImage: "camera",
                                  enabled: UIImagePickerController.cameraAvailable) {
                        showCamera = true
                    }
                    PhotosPicker(selection: $pickerItem, matching: .images) {
                        HStack(spacing: 8) {
                            Image(systemName: "photo")
                            Text("Choose photo")
                        }
                        .font(BrandFont.sans(15, .semibold))
                        .foregroundStyle(Brand.blue)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 15)
                        .background(RoundedRectangle(cornerRadius: 14).fill(Brand.blueSoft))
                    }
                    .buttonStyle(BrandPressStyle())
                }

                ScanDropZone(recognizing: recognizing, error: errorText)
            }
            .padding(.horizontal, Metrics.sidePadding)
            .padding(.top, 6)
            .padding(.bottom, 10)
            .background(Brand.canvas)
            .aboveTabBar()
            .toolbar(.hidden, for: .navigationBar)
            .navigationDestination(isPresented: $showResult) {
                if let result {
                    RedactResultScreen(result: result, mode: mode) { showResult = false }
                }
            }
            .fullScreenCover(isPresented: $showCamera) {
                CameraPicker { handle(image: $0) }.ignoresSafeArea()
            }
            .sheet(isPresented: $showInfo) { InfoView { showInfo = false } }
            .onChange(of: pickerItem) { item in
                guard let item else { return }
                Task { await loadFromLibrary(item) }
            }
        }
    }

    // MARK: Actions

    private func loadFromLibrary(_ item: PhotosPickerItem) async {
        do {
            if let data = try await item.loadTransferable(type: Data.self),
               let image = UIImage(data: data) {
                handle(image: image)
            } else {
                errorText = "That photo couldn't be loaded."
            }
        } catch {
            errorText = error.localizedDescription
        }
    }

    private func handle(image: UIImage) {
        errorText = nil
        recognizing = true
        Task {
            do {
                let text = try await OCRService.recognizeText(in: image)
                let r = try engine.redact(text, modes: [mode])
                await MainActor.run {
                    recognizing = false
                    result = r
                    session.record(r.tokenMap)
                    showResult = true
                    Haptics.success()
                }
            } catch {
                await MainActor.run {
                    recognizing = false
                    errorText = error.localizedDescription
                    Haptics.warning()
                }
            }
        }
    }
}

/// Dashed empty/drop zone with the corner-bracket + document illustration.
struct ScanDropZone: View {
    var recognizing: Bool
    var error: String?

    var body: some View {
        VStack(spacing: 14) {
            if recognizing {
                ProgressView()
                Text("Reading text…")
                    .font(BrandFont.sans(14.5, .semibold))
                    .foregroundStyle(Brand.textSecondary)
            } else {
                ZStack {
                    CornerBrackets().stroke(Brand.placeholder, lineWidth: 2)
                        .frame(width: 120, height: 120)
                    docCard
                }
                .accessibilityHidden(true)
                VStack(spacing: 4) {
                    Text(error ?? "Point at a letter or report")
                        .font(BrandFont.sans(14.5, .semibold))
                        .foregroundStyle(error == nil ? Brand.textSecondary : Brand.violet700)
                        .multilineTextAlignment(.center)
                    Text("Works with discharge summaries, referral letters and lab reports.")
                        .font(BrandFont.sans(12.5))
                        .foregroundStyle(Brand.textMuted)
                        .multilineTextAlignment(.center)
                }
                .padding(.horizontal, 24)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(
            RoundedRectangle(cornerRadius: 20)
                .fill(Brand.inputFill)
                .overlay(
                    RoundedRectangle(cornerRadius: 20)
                        .strokeBorder(Brand.inputBorder,
                                      style: StrokeStyle(lineWidth: 2, dash: [7, 6]))
                )
        )
    }

    private var docCard: some View {
        VStack(alignment: .leading, spacing: 5) {
            ForEach(0..<3, id: \.self) { i in
                Capsule().fill(Brand.placeholder.opacity(0.6))
                    .frame(width: i == 2 ? 22 : 34, height: 3)
            }
        }
        .padding(12)
        .frame(width: 56, height: 68, alignment: .topLeading)
        .background(RoundedRectangle(cornerRadius: 8).fill(Brand.canvas))
        .shadow(color: Color(hex: 0x0B0F1C).opacity(0.06), radius: 4, y: 2)
    }
}

/// Four L-shaped corner brackets framing the document illustration.
struct CornerBrackets: Shape {
    var len: CGFloat = 26
    func path(in rect: CGRect) -> Path {
        var p = Path()
        let l = len
        // top-left
        p.move(to: CGPoint(x: rect.minX, y: rect.minY + l)); p.addLine(to: CGPoint(x: rect.minX, y: rect.minY)); p.addLine(to: CGPoint(x: rect.minX + l, y: rect.minY))
        // top-right
        p.move(to: CGPoint(x: rect.maxX - l, y: rect.minY)); p.addLine(to: CGPoint(x: rect.maxX, y: rect.minY)); p.addLine(to: CGPoint(x: rect.maxX, y: rect.minY + l))
        // bottom-right
        p.move(to: CGPoint(x: rect.maxX, y: rect.maxY - l)); p.addLine(to: CGPoint(x: rect.maxX, y: rect.maxY)); p.addLine(to: CGPoint(x: rect.maxX - l, y: rect.maxY))
        // bottom-left
        p.move(to: CGPoint(x: rect.minX + l, y: rect.maxY)); p.addLine(to: CGPoint(x: rect.minX, y: rect.maxY)); p.addLine(to: CGPoint(x: rect.minX, y: rect.maxY - l))
        return p
    }
}
