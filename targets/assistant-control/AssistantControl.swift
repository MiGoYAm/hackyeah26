import AppIntents
import SwiftUI
import WidgetKit

@main
struct AssistantControls: WidgetBundle {
    var body: some Widget {
        AssistantChatControl()
    }
}

struct AssistantChatControl: ControlWidget {
    var body: some ControlWidgetConfiguration {
        StaticControlConfiguration(kind: "com.anonymous.my-app.assistant-chat") {
            ControlWidgetButton(action: OpenAssistantChatIntent()) {
                Label("Asystent", systemImage: "bubble.left.and.bubble.right.fill")
            }
        }
        .displayName("mKryzys")
        .description("Otwórz czat z asystentem bezpieczeństwa.")
    }
}
