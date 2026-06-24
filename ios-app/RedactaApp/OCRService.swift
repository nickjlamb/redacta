import Foundation
@preconcurrency import Vision
import UIKit

/// On-device text recognition via Apple's Vision framework.
///
/// Vision runs entirely locally — no network — so the "nothing leaves your
/// phone" guarantee holds for the photo → safe-text flow as well. The extracted
/// text is then handed to the same Redacta engine as every other surface.
enum OCRService {

    enum OCRError: LocalizedError {
        case badImage
        case noText

        var errorDescription: String? {
            switch self {
            case .badImage: return "That image couldn't be read."
            case .noText:   return "No text was found in the image."
            }
        }
    }

    /// Recognise text in an image. Returns lines joined with newlines.
    static func recognizeText(in image: UIImage) async throws -> String {
        guard let cgImage = image.cgImage else { throw OCRError.badImage }
        let orientation = image.cgImagePropertyOrientation

        let text: String = try await withCheckedThrowingContinuation { continuation in
            // Build the request and handler INSIDE the background closure so the
            // non-Sendable Vision objects are never captured across the
            // concurrency boundary — only the (Sendable) cgImage and orientation.
            DispatchQueue.global(qos: .userInitiated).async {
                let request = VNRecognizeTextRequest { request, error in
                    if let error {
                        continuation.resume(throwing: error)
                        return
                    }
                    let observations = request.results as? [VNRecognizedTextObservation] ?? []
                    let lines = observations.compactMap { $0.topCandidates(1).first?.string }
                    continuation.resume(returning: lines.joined(separator: "\n"))
                }
                request.recognitionLevel = .accurate
                request.usesLanguageCorrection = true

                let handler = VNImageRequestHandler(
                    cgImage: cgImage,
                    orientation: orientation,
                    options: [:]
                )
                do {
                    try handler.perform([request])
                } catch {
                    continuation.resume(throwing: error)
                }
            }
        }

        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { throw OCRError.noText }
        return trimmed
    }
}

private extension UIImage {
    /// Map UIImage orientation to the CGImagePropertyOrientation Vision expects,
    /// so photos taken in any orientation OCR correctly.
    var cgImagePropertyOrientation: CGImagePropertyOrientation {
        switch imageOrientation {
        case .up: return .up
        case .down: return .down
        case .left: return .left
        case .right: return .right
        case .upMirrored: return .upMirrored
        case .downMirrored: return .downMirrored
        case .leftMirrored: return .leftMirrored
        case .rightMirrored: return .rightMirrored
        @unknown default: return .up
        }
    }
}
