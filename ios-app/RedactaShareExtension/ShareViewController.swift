import UIKit
import SwiftUI
import UniformTypeIdentifiers

/// Principal class for the Share Extension (set via NSExtensionPrincipalClass in
/// Info.plist — no storyboard). It pulls the shared text out of the extension
/// context, then hands off to a SwiftUI view that runs the on-device engine.
final class ShareViewController: UIViewController {

    override func viewDidLoad() {
        super.viewDidLoad()
        extractSharedText { [weak self] text in
            self?.present(text: text)
        }
    }

    private func present(text: String?) {
        let root = ShareRootView(
            inputText: text ?? "",
            extractionFailed: text == nil,
            onClose: { [weak self] in self?.complete() }
        )
        let host = UIHostingController(rootView: root)
        addChild(host)
        host.view.frame = view.bounds
        host.view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        view.addSubview(host.view)
        host.didMove(toParent: self)
    }

    private func complete() {
        extensionContext?.completeRequest(returningItems: [], completionHandler: nil)
    }

    // MARK: - Pull text out of the share context

    private func extractSharedText(completion: @escaping (String?) -> Void) {
        guard
            let item = extensionContext?.inputItems.first as? NSExtensionItem,
            let providers = item.attachments, !providers.isEmpty
        else {
            // Some apps put the selection in the item's attributedContentText.
            let fallback = (extensionContext?.inputItems.first as? NSExtensionItem)?
                .attributedContentText?.string
            completion(fallback)
            return
        }

        let textType = UTType.plainText.identifier
        let urlType = UTType.url.identifier

        func finish(_ value: String?) {
            DispatchQueue.main.async { completion(value) }
        }

        if let provider = providers.first(where: { $0.hasItemConformingToTypeIdentifier(textType) }) {
            provider.loadItem(forTypeIdentifier: textType, options: nil) { data, _ in
                finish((data as? String) ?? (data as? NSAttributedString)?.string)
            }
        } else if let provider = providers.first(where: { $0.hasItemConformingToTypeIdentifier(urlType) }) {
            provider.loadItem(forTypeIdentifier: urlType, options: nil) { data, _ in
                finish((data as? URL)?.absoluteString ?? (data as? String))
            }
        } else {
            finish((extensionContext?.inputItems.first as? NSExtensionItem)?
                .attributedContentText?.string)
        }
    }
}
