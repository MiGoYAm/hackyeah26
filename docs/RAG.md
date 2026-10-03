# Lokalny RAG

Chat na `/` korzysta z `react-native-rag`, adaptera OP-SQLite/libSQL i Bielika przez ExecuTorch 0.10.4. Baza z tekstem, embeddingami i indeksem FTS5 jest gotowym assetem aplikacji. Telefon nie parsuje PDF-ów ani nie indeksuje dokumentów.

## Uruchomienie

```bash
npm ci
npm run rag:download
npx expo prebuild
npm run ios
```

Wymagany jest natywny build. Expo Go i wersja przeglądarkowa nie uruchamiają tych modeli. Konfigurację natywną generuje Expo z `app.json` i `package.json`; katalogi `ios/` i `android/` pozostają generowane.

Gotowe `knowledge_pl.db` oraz `manifest.json` są artefaktami do przechowywania w repo. Model embeddingów i tokenizer są ignorowane przez Git ze względu na rozmiar; `rag:download` odtwarza je z przypiętej rewizji Hugging Face i sprawdza SHA-256. Hook `eas-build-post-install` wykonuje to również podczas EAS Build. Przy pierwszym uruchomieniu aplikacja kopiuje assety do trwałych katalogów. Nazwa lokalnej bazy zawiera jej checksumę, więc zmiana korpusu nie nadpisuje otwartej poprzedniej wersji.

Model embeddingów zajmuje 470 258 816 bajtów, tokenizer 9 080 880 bajtów, a rozmiar bazy podaje manifest. Wszystkie trzy pliki trafiają do natywnego bundle'a. Bielik pozostaje pobierany przy pierwszym uruchomieniu, tak jak wcześniej; po pobraniu lokalnych modeli chat działa offline.

## Odtworzenie bazy

Potrzebny jest `uv`, Node.js 24+ i środowisko obsługujące przypięte koła Python. Pipeline sprawdzono na macOS arm64. `run_python.sh` przygotowuje osobne środowisko Python 3.14; zapis libSQL korzysta z Python 3.13, ponieważ jego koło nie obsługuje 3.14.

```bash
npm run rag:build
npm run rag:verify
npx expo lint
npx tsc --noEmit
npx expo-doctor
```

`scripts/rag/sources.json` dopuszcza sześć polskich PDF-ów z `assets/offline/pdfs/`. Wersje EN, LT, UA, duplikaty do druku, DOCX i obrazy nie wchodzą do bazy. MuPDF odczytuje tekst z zachowaniem polskich znaków; kontrola odrzuca uszkodzoną ekstrakcję Unicode. Fragmenty zachowują instytucję, rok, stronę PDF i SHA-256 oryginału. Czyszczenie zachowuje numery alarmowe i ilości zapasów, usuwa stopki oraz spisy treści, także nagłówki z rozstrzelonymi literami. Do kontroli ekstrakcji służy `.rag-cache/pages.json`.

Embeddingi powstają przez dokładnie ten sam `.pte` i kanoniczny tokenizer co na telefonie. Model dodaje tokeny specjalne, pooling i normalizację L2; narzędzie nie wykonuje ich ponownie. Każdy fragment mieści się w 126 tokenach wejściowych. Dłuższy tekst jest dzielony, z zakładką i pełniejszym fragmentem końcowym.

## Wyszukiwanie i odpowiedzi

OP-SQLite wykonuje dokładny ranking cosine similarity. FTS5 wyszukuje słowa kluczowe z prefiksami dla polskich odmian. Reciprocal rank fusion łączy oba rankingi; wybór obejmuje do czterech różnych stron, z progiem podobieństwa 0,5. Parametry są w `scripts/rag/retrieval.json` i trafiają do manifestu.

Przed wyszukiwaniem `KnowledgeConversation` rozwija wybrane potoczne określenia: „nalot” na „atak z powietrza”, a „syreny” na „syreny alarmowe”. Rozróżnia też nalot na powierzchniach i użycia syren poza alarmowaniem. To ograniczony słownik, nie dowolne przepisywanie pytania przez LLM. FTS łączy słowa operatorem OR, aby brak czasownika z pytania w PDF-ie nie wykluczał trafnego fragmentu; wszystkie wyniki nadal muszą przejść próg semantyczny.

Pytania odsyłające do poprzedniego tematu, np. „A gdzie się schować?”, korzystają z ostatniego samodzielnego pytania, również gdy wcześniejsze wyszukiwanie nie znalazło źródeł. Samo „A jak…” nie wystarcza do dziedziczenia tematu, a „Dlaczego…”, „I co…” i „A gdzie…” dziedziczą go tylko w pytaniach do czterech słów. „Nowa rozmowa” usuwa temat i historię.

Baza ma gotowy schemat, więc aplikacja nie wywołuje `OPSQLiteVectorStore.load()` z nieobsługiwanym przez libSQL wielopoleceniowym DDL. Przed rozpoczęciem rozmowy sprawdza liczbę rekordów, indeks słów i zgodność embeddingu kontrolnego. Nie buduje nieużywanego indeksu ANN.

Bielik otrzymuje wyłącznie bieżące źródła oraz do trzech poprzednich par wypowiedzi. Tokenizer modelu mierzy cały prompt; starsze wypowiedzi i dodatkowe źródła są usuwane, aby zostawić 512 tokenów na odpowiedź. KV cache jest resetowany między pytaniami bez ponownego wczytywania wag. Brak trafnych źródeł daje stałą odpowiedź o braku informacji. Cytowania `[n]` są sprawdzane względem faktycznie przekazanych źródeł; numer spoza listy jest usuwany z odpowiedzi. Runner ExecuTorch nie ma kary za powtórzenia, więc `answer.ts` przerywa generowanie po wykryciu powtórzonego zdania i obcina powtórkę, a także usuwa Markdown, bo czat wyświetla zwykły tekst. Stop przerywa generowanie; przy wyszukiwaniu blokuje jego kontynuację po zakończeniu natywnego embeddingu.

## Walidacja

`rag:verify` uruchamia rzeczywisty model, otwiera wygenerowaną bazę i korzysta z produkcyjnego przygotowania zapytania i `ranking.ts`, bez mocków. Sprawdza pochodzenie polskich danych, strony, checksumy, wektory oraz 27 przypadków kontrolnych i dziewięć pytań spoza korpusu. Uwzględnia dokładne pytania ze zgłoszenia, pytanie uzupełniające po braku odpowiedzi i zmianę tematu rozmowy. Raport zapisuje w `docs/research/rag-evaluation.json`. To test znajdowania materiału źródłowego; nie ocenia poprawności wszystkich odpowiedzi Bielika.

Sprawdzono zgodność jednego polskiego embeddingu na Pythonie i symulatorze iOS: 384 wartości float32 były identyczne. Natywny libSQL z zainstalowanego OP-SQLite otworzył bazę oraz wykonał ranking wektorów i zapytanie FTS5 na symulatorze. Eksporty iOS i Androida zawierają bazę, `.pte` oraz tokenizer; checksumy plików eksportu zgadzają się z manifestem.

Wynik korpusu: 346 fragmentów, baza 1 744 896 bajtów, trafiony materiał dla 27/27 przypadków kontrolnych i odrzucone 9/9 pytań spoza korpusu. Lint, TypeScript i wszystkie 21 kontroli Expo Doctor przeszły. `npx expo run:ios --configuration Release` zakończył się powodzeniem; checksumy bazy, modelu i tokenizera w gotowym `.app` są zgodne z manifestem. Build symulatora zajmuje 571 113 724 bajty, przed pobraniem Bielika; nie jest to rozmiar IPA dla urządzenia.

Po zmianie bazy lub konfiguracji native trzeba ponownie wygenerować i przebudować aplikację. Przed wydaniem pozostaje kontrola całej rozmowy bez sieci, Stop, aktualizacji bazy oraz pamięci i czasu odpowiedzi na docelowym iOS i Androidzie. Sam próg podobieństwa i poprawne numery cytowań nie gwarantują zgodności każdej wygenerowanej wskazówki z treścią poradnika.
