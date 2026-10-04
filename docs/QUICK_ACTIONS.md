# Przycisk asystenta na iOS

Na iOS 18 lub nowszym przycisk "mKryzys" można dodać
w miejsce latarki lub aparatu na ekranie blokady oraz do Centrum sterowania.
Otwiera czat przez `myapp:///chat` i od razu uruchamia dyktowanie po polsku.
Dyktowanie uruchamia się także przy zwykłym starcie aplikacji. Można robić
przerwy i dopowiadać kolejne fragmenty. Pytanie wysyła się dopiero po naciśnięciu
"Wyślij"; przycisk zatrzymuje mikrofon i wysyła widoczny tekst. Jeśli model jeszcze
się ładuje, tekst pozostaje do ręcznego wysłania po jego gotowości. Otwarcie aplikacji wymaga uwierzytelnienia
telefonu, jeśli iOS go zażąda. Model działa w aplikacji.

Przy pierwszym dyktowaniu system pyta o dostęp do mikrofonu i rozpoznawania
mowy. Warto udzielić zgód przed użyciem w sytuacji awaryjnej. Przycisk
"Zakończ dyktowanie" tylko zatrzymuje nasłuch. "Dopowiedz" wznawia go,
zachowując dotychczasowy tekst. "Wolę pisać" zatrzymuje mikrofon i pozwala
poprawić lub wpisać pytanie.
Wyjście z ekranu albo przejście aplikacji w tło zatrzymuje nasłuchiwanie.

Dyktowanie używa `expo-speech-recognition` na iOS i Androidzie. Systemowe
rozpoznawanie mowy może wymagać internetu, zależnie od telefonu i dostępności
polskiego modelu. Lokalny model odpowiedzi nadal działa bez internetu.
Dokumentacja: [Expo Speech Recognition](https://github.com/jamsch/expo-speech-recognition).

## Sprawdzenie dyktowania na telefonie

Po przyznaniu zgód uruchom aplikację zwyczajnie i sprawdź automatyczny nasłuch.
Otwórz też asystenta przyciskiem, powiedz pytanie po polsku i zrób pauzę.
Tekst powinien pozostać w edytorze; dopowiedz kolejny fragment i naciśnij "Wyślij".
Powtórz otwarcie, gdy aplikacja jest już uruchomiona. Sprawdź również
"Wolę pisać" podczas dyktowania oraz zatrzymanie mikrofonu po zablokowaniu telefonu.

Build iOS i automatyczny start z `myapp:///chat` sprawdzono na symulatorach
iPhone 17 Pro z iOS 26.5 i 27.0. Na iOS 26.5 API potwierdzało obie zgody,
ale rozpoznawanie kończyło się `Failed to initialize recognizer`. Użytkownik
potwierdził, że dyktowanie w wyszukiwaniu Ustawień działało na tym samym systemie.
Na świeżej instalacji iOS 27 pierwsza próba po udzieleniu zgód zwróciła
`kAFAssistantErrorDomain 209`; kolejna zakończyła się zdarzeniem `nomatch`.
Użytkownik później potwierdził działanie dyktowania. Emulator Androida nie był dostępny.

## Dodawanie przycisku

Po zainstalowaniu nowego buildu przytrzymaj ekran blokady, wybierz Dostosuj,
a następnie Ekran blokady. Usuń latarkę lub aparat przyciskiem minus,
naciśnij plus i wybierz "mKryzys".

W Centrum sterowania wejdź w edycję, wybierz Dodaj narzędzie sterowania
i znajdź "mKryzys".

## Implementacja i build

Przycisk używa `ControlWidgetButton` i `OpenIntent`. Swift znajduje się
w `targets/assistant-control/`. Config plugin `@bacons/apple-targets`
generuje rozszerzenie `com.anonymous.my-app.AssistantControl` podczas prebuild
i deklaruje je dla podpisywania EAS. Katalog `_shared` dołącza intent
do aplikacji i rozszerzenia. Rozszerzenie wymaga iOS 18, aplikacja nadal iOS 17.
Nie edytuj wygenerowanego katalogu `ios/`.

Wymagany jest nowy build natywny. Expo Go oraz aktualizacja samego JS
nie wystarczą. Plugin `expo-speech-recognition` w `app.json` dodaje zgody
mikrofonu i rozpoznawania mowy. Build EAS: `npx eas-cli@latest build --platform ios --profile preview`.

Uruchomienie na iOS 27 wymaga obsługi scen. W konfiguracji
`expo-build-properties` włączono `ios.enableSceneSupport`, a wygenerowany build
ma `UIApplicationSceneManifest`. [Dokumentacja Expo SDK 57](https://docs.expo.dev/versions/v57.0.0/sdk/build-properties/).

Dokumentacja: [Apple Controls](https://developer.apple.com/documentation/widgetkit/creating-controls-to-perform-actions-across-the-system)
i [Expo Apple Targets](https://github.com/EvanBacon/expo-apple-targets).
