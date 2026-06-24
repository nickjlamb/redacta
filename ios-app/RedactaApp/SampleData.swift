import Foundation

/// Synthetic, clearly-fake clinical note for demos and first-run.
///
/// Contains NO real patient data — invented name, a valid-format-but-fictional
/// NHS number, and placeholder contact details — so it's safe to ship and to
/// show on camera. It exercises several identifier types at once, which makes
/// the redaction reveal land.
enum SampleData {
    static let clinicalNote = """
    Patient: John Smith, DOB 12/03/1981, NHS No 943 476 5919.
    Address: 14 Elm Road, Leeds, LS1 4DY. Tel 07700 900123.
    Email: john.smith@example.com.
    Seen in clinic by Dr Patel. Mother Jane Smith (next of kin) present.
    Discussed results; routine follow-up arranged in 6 weeks.
    """
}
