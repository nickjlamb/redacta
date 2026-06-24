import SwiftUI
import UIKit

/// Resign the first responder, closing the keyboard from anywhere.
func hideKeyboard() {
    UIApplication.shared.sendAction(
        #selector(UIResponder.resignFirstResponder),
        to: nil, from: nil, for: nil
    )
}

extension View {
    /// Adds a "Done" button above the keyboard so it can always be dismissed —
    /// otherwise the keyboard sits over the tab bar with no way to close it.
    func keyboardDoneButton() -> some View {
        toolbar {
            ToolbarItemGroup(placement: .keyboard) {
                Spacer()
                Button("Done") { hideKeyboard() }
            }
        }
    }

    /// Dismisses the keyboard when the user taps empty space in this view.
    /// Buttons and text fields still handle their own taps first.
    func dismissKeyboardOnTap() -> some View {
        contentShape(Rectangle())
            .onTapGesture { hideKeyboard() }
    }
}
