# Przycisk asystenta na iOS

Na iOS 18 lub nowszym przycisk "Asystent bezpieczeństwa" można dodać
w miejsce latarki lub aparatu na ekranie blokady oraz do Centrum sterowania.
Otwiera czat przez `myapp:///chat`. Otwarcie aplikacji wymaga uwierzytelnienia
telefonu, jeśli iOS go zażąda. Model działa w aplikacji.

## Dodawanie przycisku

Po zainstalowaniu nowego buildu przytrzymaj ekran blokady, wybierz Dostosuj,
a następnie Ekran blokady. Usuń latarkę lub aparat przyciskiem minus,
naciśnij plus i wybierz "Asystent bezpieczeństwa".

W Centrum sterowania wejdź w edycję, wybierz Dodaj narzędzie sterowania
i znajdź "Asystent bezpieczeństwa".

## Implementacja i build

Przycisk używa `ControlWidgetButton` i `OpenIntent`. Swift znajduje się
w `targets/assistant-control/`. Config plugin `@bacons/apple-targets`
generuje rozszerzenie `com.anonymous.my-app.AssistantControl` podczas prebuild
i deklaruje je dla podpisywania EAS. Katalog `_shared` dołącza intent
do aplikacji i rozszerzenia. Rozszerzenie wymaga iOS 18, aplikacja nadal iOS 17.
Nie edytuj wygenerowanego katalogu `ios/`.

Wymagany jest nowy build natywny. Expo Go oraz aktualizacja samego JS
nie wystarczą. Build EAS: `npx eas-cli@latest build --platform ios --profile preview`.

Dokumentacja: [Apple Controls](https://developer.apple.com/documentation/widgetkit/creating-controls-to-perform-actions-across-the-system)
i [Expo Apple Targets](https://github.com/EvanBacon/expo-apple-targets).
