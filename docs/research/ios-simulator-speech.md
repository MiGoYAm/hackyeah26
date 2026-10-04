# Rozpoznawanie i synteza mowy w symulatorze iOS

Sprawdzono 2026-10-04.

Istnieją publiczne zgłoszenia awarii obu funkcji w symulatorze, ale znalezione źródła nie potwierdzają przyczyny błędu tej aplikacji.

## Dyktowanie, czyli speech-to-text

Na Apple Developer Forums jest zgłoszenie z sierpnia 2026 dotyczące `SFSpeechRecognizer` w symulatorach iOS 26.4 i 26.5. Autor opisuje niedostępność rozpoznawania `en_US` przy japońskim języku systemu. Po przełączeniu systemu na angielski rozpoznawanie staje się dostępne, ale kończy się błędem `kLSRErrorDomain Code=300`. Autor nie obserwował tych problemów w iOS 26.2 i starszych. Wątek nie ma odpowiedzi Apple. To zgłoszona regresja, nie potwierdzony przez Apple błąd. [Zgłoszenie](https://developer.apple.com/forums/thread/840302)

W tej aplikacji początkowo odnotowano ogólne `not-allowed` dla `pl-PL`. Późniejsza diagnostyka dwóch prób na iOS 26.5 pokazała `audio-capture: Failed to initialize recognizer` oraz `granted` dla mikrofonu i rozpoznawania mowy. Zainstalowany build zawierał obie wymagane deklaracje w Info.plist. Użytkownik potwierdził działanie dyktowania w wyszukiwaniu Ustawień. Nie ma podstaw do stwierdzenia ogólnej awarii dyktowania symulatora ani do przypisania problemu odmowie tych zgód.

## Czytanie tekstu, czyli text-to-speech

Istnieje też historyczne zgłoszenie problemów `AVSpeechSynthesizer` w symulatorze iOS 17 z Xcode 15. Autor opisuje błędy ładowania głosów i brak odtwarzania. Zgłoszenie dotyczy innej wersji systemu i nie dowodzi awarii TTS w iOS 26.5. [Zgłoszenie](https://developer.apple.com/forums/thread/738048)

Obecny projekt zawiera `expo-speech-recognition`, czyli dyktowanie. Nie zawiera `expo-speech`; TTS nie został zaimplementowany ani przetestowany. Stan zależności potwierdza [package.json](../../package.json).

Rozpoznawanie trzeba zweryfikować na fizycznym iPhonie. Wynik z symulatora nie wystarcza do oceny działania na urządzeniu, a znalezione zgłoszenia nie uzasadniają twierdzenia, że wszystkie funkcje mowy są nieobsługiwane w symulatorze.

## Symulator iOS 27

W ukierunkowanym przeszukaniu Apple Developer Forums nie znaleziono zgłoszenia tego samego problemu `SFSpeechRecognizer`, `not-allowed` lub `kLSRErrorDomain Code=300` w symulatorze iOS 27. Zgłoszenie dotyczące iOS 26.4 i 26.5 nie opisuje testu na iOS 27. Nie jest to dowód naprawy. [Zgłoszenie dla iOS 26](https://developer.apple.com/forums/thread/840302)

Lokalny test wykonano na iOS 27.0 (24A434), iPhone 17 Pro, z Xcode 27.0 (27A5237l). Build z `ios.enableSceneSupport` uruchomił aplikację i ścieżkę `myapp:///chat`. Pierwsza próba po udzieleniu zgód zwróciła `audio-capture` z `kAFAssistantErrorDomain 209`; API raportowało `granted` dla obu zgód. Kolejna próba zakończyła się `nomatch`, bez błędu inicjalizacji. Nie zweryfikowano pełnej transkrypcji rzeczywistej wypowiedzi. Obserwacje te nie ustalają przyczyny pierwszego błędu ani nie dowodzą regresji w samym iOS 27.

Sprawdzone informacje o wydaniu iOS 27 nie wymieniają naprawy tego błędu rozpoznawania w symulatorze. Sekcja Dictation opisuje inne zmiany w systemowym dyktowaniu. [Informacje o wydaniu](https://developer.apple.com/documentation/ios-ipados-release-notes/ios-ipados-27-release-notes)

W iOS 27 beta zgłoszono inny problem TTS, odczytywanie wypowiedzi poza kolejnością. Apple DTS potwierdza, że oczekiwane zachowanie polega na zachowaniu kolejki, i zapowiada zbadanie zgłoszenia. Wątek nie wiąże tego błędu z symulatorem ani z odmową rozpoznawania głosu. Nie potwierdza też stanu poprawki w finalnym iOS 27. [Odpowiedź Apple DTS](https://developer.apple.com/forums/thread/834875)

Wniosek: dostępne źródła nie rozstrzygają, czy nasz błąd występuje na symulatorze iOS 27. Potrzebny jest test tej aplikacji na tym konkretnym runtime.
