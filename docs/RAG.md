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

`scripts/rag/sources.json` dopuszcza 28 polskich źródeł: 15 PDF-ów z `assets/offline/pdfs/` (poradniki ogólne, powódź, pożar, wichura, atak z powietrza i siedem transkrypcji filmów) oraz 13 stron gov.pl zapisanych w `src/data/survival/text/` (`"type": "web"`). Ze strony wchodzi tylko sekcja „Ze strony RCB”, dzielona na części według śródtytułów (także tych oznaczonych tylko układem: krótka linia bez kropki przed akapitem lub listą), które trafiają do prefiksu fragmentu; strony gov.pl nie mają roku, bo znana jest tylko data pobrania; załączniki są osobnymi źródłami albo nie nadają się do użycia. `poradnik-burza.pdf`, `poradnik-czad.pdf` i `poradnik-upal.pdf` mają uszkodzoną warstwę tekstową („mBwimy” zamiast „mówimy”), a `poradnik-zima.pdf` to same obrazy, dlatego te tematy pochodzą ze stron gov.pl i transkrypcji. Wersje EN, LT, UA, duplikaty do druku, DOCX i obrazy nie wchodzą do bazy. MuPDF odczytuje tekst z zachowaniem polskich znaków; kontrola odrzuca uszkodzoną ekstrakcję Unicode oraz PDF-y z podmienionymi polskimi literami. Fragmenty zachowują instytucję, rok, SHA-256 oryginału oraz stronę PDF albo adres strony gov.pl. Czyszczenie zachowuje numery alarmowe i ilości zapasów, usuwa stopki oraz spisy treści, także nagłówki z rozstrzelonymi literami. Nagłówek z górnego marginesu trafia do fragmentu raz, jako prefiks; numery stron z marginesów, obrócone etykiety boczne i glify ikon są pomijane. Z transkrypcji znikają znaczniki czasu i opisy ekranu. Do kontroli ekstrakcji służy `.rag-cache/pages.json`.

Embeddingi powstają przez dokładnie ten sam `.pte` i kanoniczny tokenizer co na telefonie. Model dodaje tokeny specjalne, pooling i normalizację L2; narzędzie nie wykonuje ich ponownie. Każdy fragment mieści się w 126 tokenach wejściowych. Dłuższy tekst jest dzielony, z zakładką i pełniejszym fragmentem końcowym.

## Wyszukiwanie i odpowiedzi

OP-SQLite wykonuje dokładny ranking cosine similarity. FTS5 wyszukuje słowa kluczowe z prefiksami dla polskich odmian. Wynik fragmentu to jego podobieństwo plus premia za trafienie słów kluczowych (`keywordBoost`, największa dla najlepszego trafienia BM25). Wcześniejsze reciprocal rank fusion pozwalało słabemu fragmentowi obecnemu na obu listach wyprzedzić najbliższe trafienie semantyczne. Wybór obejmuje do czterech fragmentów z progiem podobieństwa 0,5: najwyżej jeden z jednej strony PDF i najwyżej dwa z jednej sekcji strony gov.pl. Zapytanie wektorowe pobiera z bazy tylko wiersze powyżej progu, bez zapisanych embeddingów. Niższy próg dla fragmentów trafionych słowami kluczowymi sprawdzono i odrzucono: zamykał jedną lukę, a przepuszczał pytania spoza korpusu. Parametry są w `scripts/rag/retrieval.json` i trafiają do manifestu.

Przed wyszukiwaniem `KnowledgeConversation` rozwija wybrane potoczne określenia: „nalot” na „atak z powietrza”, a „syreny” na „syreny alarmowe”. Rozróżnia też nalot na powierzchniach i użycia syren poza alarmowaniem. To ograniczony słownik, nie dowolne przepisywanie pytania przez LLM. FTS łączy słowa operatorem OR, aby brak czasownika z pytania w PDF-ie nie wykluczał trafnego fragmentu; wszystkie wyniki nadal muszą przejść próg semantyczny.

Pytania odsyłające do poprzedniego tematu, np. „A gdzie się schować?”, korzystają z ostatniego samodzielnego pytania, również gdy wcześniejsze wyszukiwanie nie znalazło źródeł. Samo „A jak…” nie wystarcza do dziedziczenia tematu, a „Dlaczego…”, „I co…”, „A gdzie…”, „Czy to…”, „Jak to…” i „Ile tego…” dziedziczą go tylko w pytaniach do czterech słów. Kolejne dopytanie korzysta z tematu i z poprzedniego dopytania, więc „Dlaczego?” po „A gdzie się schować?” szuka obu. „Nowa rozmowa” usuwa temat i historię.

Baza ma gotowy schemat, więc aplikacja nie tworzy tabel i otwiera ją bezpośrednio przez OP-SQLite, ze wskazaniem katalogu: adapter `OPSQLiteVectorStore` otwiera tylko katalog domyślny, a na Androidzie `expo-file-system` może tworzyć pliki wyłącznie w `files/` i `cache/` aplikacji, więc baza leży tam w `files/` (na iOS bez zmian, w Library). Przed rozpoczęciem rozmowy sprawdza liczbę rekordów, indeks słów i zgodność embeddingu kontrolnego. Nie buduje nieużywanego indeksu ANN.

Bielik otrzymuje wyłącznie bieżące źródła oraz do trzech poprzednich par wypowiedzi. Tokenizer modelu mierzy cały prompt; starsze wypowiedzi i dodatkowe źródła są usuwane, aby zostawić 512 tokenów na odpowiedź. KV cache jest resetowany między pytaniami bez ponownego wczytywania wag. Brak trafnych źródeł daje stałą odpowiedź o braku informacji. Cytowania `[n]` są sprawdzane względem faktycznie przekazanych źródeł; numer spoza listy jest usuwany z odpowiedzi, a listy i zakresy typu `[1, 2]` lub `[1-3]` są zamieniane na `[1][2][3]`. Pod odpowiedzią widać tylko źródła faktycznie zacytowane. Runner ExecuTorch nie ma kary za powtórzenia, więc `answer.ts` przerywa generowanie po wykryciu powtórzonego zdania i obcina powtórkę, a także usuwa Markdown, bo czat wyświetla zwykły tekst. Stop przerywa generowanie; przy wyszukiwaniu blokuje jego kontynuację po zakończeniu natywnego embeddingu.

## Walidacja

`rag:verify` uruchamia rzeczywisty model, otwiera wygenerowaną bazę i korzysta z produkcyjnego przygotowania zapytania i `ranking.ts`, bez mocków. Sprawdza pochodzenie polskich danych, strony, checksumy, wektory oraz 44 przypadki kontrolne i 13 pytań spoza korpusu; pytanie spoza korpusu jest odrzucone, gdy produkcyjny wybór nie zwraca żadnego fragmentu. Trafienie to fragment z oczekiwanego dokumentu (`documents`), który sam zawiera jedno ze słów odpowiedzi (`answerTerms`); raport podaje też pozycję trafienia i MRR. Uwzględnia dokładne pytania ze zgłoszenia, pytanie uzupełniające po braku odpowiedzi i zmianę tematu rozmowy. Lista `knownGaps` zawiera pytania, na które korpus odpowiada, ale wyszukiwanie ich jeszcze nie znajduje; są raportowane jako GAP i nie przerywają kontroli. Analogicznie `knownAccepted` zawiera pytania spoza korpusu, dla których jakiś fragment sam przekracza próg podobieństwa. Słowa odpowiedzi i wagę `keywordBoost` dobierano na tym samym zestawie, więc wynik potwierdza brak regresji, a nie jakość na nowych pytaniach. Raport zapisuje w `docs/research/rag-evaluation.json`. To test znajdowania materiału źródłowego; nie ocenia poprawności wszystkich odpowiedzi Bielika.

Sprawdzono zgodność jednego polskiego embeddingu na Pythonie i symulatorze iOS: 384 wartości float32 były identyczne. Natywny libSQL z zainstalowanego OP-SQLite otworzył bazę oraz wykonał ranking wektorów i zapytanie FTS5 na symulatorze. Eksporty iOS i Androida zawierają bazę, `.pte` oraz tokenizer; checksumy plików eksportu zgadzają się z manifestem.

Wynik korpusu: 786 fragmentów, baza 3 936 256 bajtów, trafiony materiał dla 44/44 przypadków kontrolnych (33 na pierwszej pozycji, MRR 0,867), pięć znanych luk, odrzucone 13/13 pytań spoza korpusu i dwa znane błędne przyjęcia. Lint przechodzi; TypeScript zgłasza tylko brak typów dla importów CSS, gdy nie ma generowanego `expo-env.d.ts`. Poniższe kontrole wykonano na poprzedniej bazie (346 fragmentów) i trzeba je powtórzyć: wszystkie 21 kontroli Expo Doctor przeszły. `npx expo run:ios --configuration Release` zakończył się powodzeniem; checksumy bazy, modelu i tokenizera w gotowym `.app` są zgodne z manifestem. Build symulatora zajmuje 571 113 724 bajty, przed pobraniem Bielika; nie jest to rozmiar IPA dla urządzenia.

Po zmianie bazy lub konfiguracji native trzeba ponownie wygenerować i przebudować aplikację. Przed wydaniem pozostaje kontrola całej rozmowy bez sieci, Stop, aktualizacji bazy oraz pamięci i czasu odpowiedzi na docelowym iOS i Androidzie. Sam próg podobieństwa i poprawne numery cytowań nie gwarantują zgodności każdej wygenerowanej wskazówki z treścią poradnika.
