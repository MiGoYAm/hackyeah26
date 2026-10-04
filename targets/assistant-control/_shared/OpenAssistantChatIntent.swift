import AppIntents
import SwiftUI

@available(iOS 18.0, *)
enum AssistantDestination: String, AppEnum {
    case chat

    static let typeDisplayRepresentation = TypeDisplayRepresentation(name: "Asystent")
    static let caseDisplayRepresentations: [AssistantDestination: DisplayRepresentation] = [
        .chat: DisplayRepresentation(title: "Czat")
    ]
}

// WidgetKit requires the intent in both the app and its extension.
@available(iOS 18.0, *)
struct OpenAssistantChatIntent: OpenIntent {
    static let title: LocalizedStringResource = "Otwórz czat asystenta"

    @Parameter(title: "Ekran")
    var target: AssistantDestination

    init() {
        target = .chat
    }

    @MainActor
    func perform() async throws -> some IntentResult {
        // OpenIntent runs in the foreground app. OpenURLIntent requires a
        // universal link; this app already uses an Expo Router URL scheme.
        EnvironmentValues().openURL(URL(string: "myapp:///chat")!)
        return .result()
    }
}
