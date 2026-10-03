# Plan RAG z polskich PDF-ów

Plan przygotowany 2026-10-03, przed wdrożeniem. Aktualna implementacja i polecenia znajdują się w [docs/RAG.md](../RAG.md). Wdrożenie dodaje także FTS5 do rankingu wektorowego; gotowy plik nosi nazwę `knowledge_pl.db`, a metadane używają `page`, `year` i `section`. Nie tworzymy indeksu ANN, którego adapter nie wykorzystuje.

Chat na stronie głównej będzie wyszukiwał fragmenty lokalnej bazy wiedzy i przekazywał je Bielikowi. Tekst, embeddingi i metadane powstaną przed budowaniem aplikacji. Gotowy plik `assets/offline/rag/knowledge-pl-v1.db` trafi do binarki. Telefon obliczy tylko embedding pytania, bez parsowania PDF-ów i indeksowania korpusu.

## 1. Dane wejściowe

W repo istnieją oryginały w `assets/offline/pdfs/` i ekstrakty w `src/data/survival/text/`. Pierwsza wersja wykorzysta jawny manifest sześciu polskich PDF-ów:

- `poradnik-bezpieczenstwa-2025-pl.pdf`, kanoniczna wersja pionowa.
- `badz-gotowy-pl.pdf`.
- `poradnik-powodz.pdf`.
- `atak-powietrza-instrukcja.pdf`.
- `atak-powietrza-alerty-rodzaje.pdf`.
- `atak-powietrza-slyszysz-alarm.pdf`.

Wykluczamy wersje EN, LT i UA oraz duplikaty poradnika: wersję poziomą, środek i okładkę do druku. DOCX i obrazy pozostają poza pierwszą wersją korpusu opartego na PDF-ach. Manifest zawiera `language: pl`, tytuł, instytucję, datę publikacji, ścieżkę i SHA-256 oryginału. Pozwoli to odtworzyć bazę i zachować pochodzenie treści.

Ponowna ekstrakcja zachowa numery stron PDF. Istniejące Markdowny posłużą do porównania jakości; nie traktujemy samych separatorów jako potwierdzonych numerów stron. Usuniemy nagłówki, stopki, spisy treści, znaki sterujące i dzielenie słów. Zachowamy listy działań, warunki i polskie znaki. Ręcznie sprawdzimy kolejność tekstu w infografikach i kolumnach. Statystyki ekstrakcji wskazują strony z niewielką ilością tekstu w poradniku 2025; sprawdzimy, czy zawierają istotne informacje graficzne, zanim je pominiemy.

## 2. Sprawdzenie zgodności przed budową bazy

Obecna aplikacja używa Expo 57, React Native 0.86.3 i `react-native-executorch` 0.10.4. Adapter `@react-native-rag/executorch` z gałęzi main deklaruje peer dependency `^0.9.0`, więc nie pasuje do obecnej wersji. Użyjemy `react-native-rag` i `@react-native-rag/op-sqlite` oraz własnego adaptera interfejsu `Embeddings` opartego na API ExecuTorch 0.10.4. Bielik i generowanie strumieniowe pozostają w aplikacji. [Źródło deklaracji zależności](https://github.com/software-mansion-labs/react-native-rag/blob/main/packages/executorch/package.json).

Dobierzemy i przypniemy opublikowane wersje pakietów. Obecny adapter SQLite deklaruje `@op-engineering/op-sqlite: ^15.2.7`, dlatego nie zakładamy zgodności z najnowszym głównym wydaniem OP-SQLite. Instalacja w tym repo przez `npx expo install`. Włączymy `op-sqlite.libsql: true` w `package.json`; adapter korzysta z wektorów libSQL. [Pakiet adaptera](https://github.com/software-mansion-labs/react-native-rag/blob/main/packages/op-sqlite/package.json), [konfiguracja libSQL](https://github.com/software-mansion-labs/react-native-rag/blob/main/packages/op-sqlite/README.md).

Pierwszy etap kończy się próbą na iOS i Androidzie: otwarcie przykładowej gotowej bazy, odczyt metadanych, embedding polskiego pytania i poprawny ranking. Nie produkujemy całego korpusu przed potwierdzeniem tej ścieżki.

## 3. Embeddingi i przygotowanie bazy

Kandydat początkowy to `paraphrase-multilingual-MiniLM-L12-v2`, dostępny w zainstalowanym katalogu ExecuTorch. Obsługuje polski i generuje 384-wymiarowe wektory. Wybierzemy konkretny wariant XNNPACK i przypniemy plik modelu oraz tokenizer, zamiast automatycznie wybierać inny backend na każdej platformie. [Karta modelu](https://huggingface.co/sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2), [katalog ExecuTorch](https://github.com/software-mansion/react-native-executorch/blob/main/packages/react-native-executorch/src/models.ts).

Podział na fragmenty według akapitów i list, z limitem tokenizera wybranego eksportu. Karta modelu podaje długość 128 tokenów; początkowo celujemy w około 100 tokenów i overlap około 20, wliczając tytuł sekcji i tokeny specjalne. Dłuższe sekcje dzielimy bez cichego ucinania tekstu. Rozmiary dopasujemy do jakości wyszukiwania, nie do arbitralnej liczby znaków. [Konfiguracja modelu](https://huggingface.co/sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2/raw/main/README.md).

Skrypty w `scripts/rag/` wykonają kolejno ekstrakcję, czyszczenie, podział, embeddingi i zapis bazy. Każdy fragment otrzyma stabilny identyfikator oraz metadane `documentId`, `title`, `pdfPage`, `section`, `language`, `sourcePath` i `publishedAt`. Oddzielny manifest bazy zapisze wersję schematu, checksumy modelu/tokenizera, wymiar wektora, sposób normalizacji i liczbę fragmentów.

Format bazy musi odpowiadać rzeczywistemu schematowi `OPSQLiteVectorStore`: tabela `vectors` z identyfikatorem, tekstem, `F32_BLOB(384)` i JSON metadanych oraz indeks libSQL. Wektory zapiszemy za pomocą kompatybilnego libSQL, a nie dowolnego kodowania BLOB. Zbudujemy bazę poza aplikacją, zamkniemy połączenia i scalimy WAL przed pakowaniem. Wrapper wysyła dwa polecenia DDL w jednym `execute()`, podczas gdy dokumentacja OP-SQLite wskazuje ograniczenie wielu poleceń dla libSQL. Etap zgodności musi potwierdzić działanie `load()` na gotowej bazie; w razie potrzeby rozdzielimy inicjalizację w lokalnym adapterze. [Kod wrappera](https://github.com/software-mansion-labs/react-native-rag/blob/68aad4dbc2caba5c4deda71dad08f14248ca91ce/packages/op-sqlite/src/wrappers/op-sqlite.ts), [API OP-SQLite](https://op-engineering.github.io/op-sqlite/docs/api/).

Warunek zgodności embeddingów: ten sam model, tokenizer, pooling, normalizacja i limit sekwencji podczas budowania bazy oraz zadawania pytań. Najpierw porównamy wektory i ranking dla polskich zdań na komputerze i telefonie. Jeśli eksport `.pte` nie daje zgodności z desktopowym pipeline'em, bazę wygenerujemy tym samym eksportem ExecuTorch w narzędziu przygotowującym dane. Nie zakładamy, że ta sama nazwa modelu zapewnia zgodne wektory.

## 4. Dołączenie bazy do aplikacji

Dodamy `expo-asset` i `expo-file-system`. Plugin `expo-asset` wskaże dokładnie gotowy plik `.db`, bez pakowania całego katalogu z wielojęzycznymi PDF-ami. Expo 57 wspiera osadzanie `.db` przez ten plugin. [Expo Asset 57](https://docs.expo.dev/versions/v57.0.0/sdk/asset/).

Przy pierwszym uruchomieniu skopiujemy bazę z assetu do trwałego katalogu używanego przez wybraną wersję OP-SQLite: domyślnie Library na iOS i katalog baz na Androidzie. Kopia i walidacja muszą zakończyć się przed stworzeniem `OPSQLiteVectorStore`, którego konstruktor otwiera bazę. Ustalimy ścieżkę na obu platformach i potwierdzimy ją w etapie 2. Adapter przyjmuje nazwę bazy, więc nie można zakładać, że wystarczy podać dowolną ścieżkę. `moveAssetsDatabase` dotyczy natywnie dołączonych assetów, nie dowolnego URI Expo; przy ścieżce przez Expo Asset wykonamy kopiowanie do katalogu OP-SQLite przez FileSystem. Utrzymamy jedno połączenie przez życie usługi RAG. Przy aktualizacji użyjemy nowej nazwy pliku i atomowego przełączenia po walidacji, bez nadpisywania otwartej bazy. [Expo FileSystem 57](https://docs.expo.dev/versions/v57.0.0/sdk/filesystem/), [konfiguracja OP-SQLite](https://op-engineering.github.io/op-sqlite/docs/configuration/).

Model embeddingów i tokenizer także dołączymy jako assety, z odpowiednią konfiguracją Metro i rozwiązaniem lokalnych ścieżek. Ich obecność zweryfikujemy w zainstalowanym release bez sieci. Obecny Bielik jest pobierany przy pierwszym uruchomieniu. Osadzenie bazy nie zmienia tego automatycznie; całkowita gotowość chatu offline od pierwszego uruchomienia wymaga dodatkowo osadzenia Bielika, co znacząco zwiększy rozmiar aplikacji.

Nowa biblioteka natywna wymaga przebudowania aplikacji. Konfiguracja przez `app.json`, Metro i config plugins. Walidacja w development build i release na iOS oraz Androidzie. [Dokumentacja development builds](https://docs.expo.dev/develop/development-builds/introduction/).

## 5. Integracja z chatem

Logika w `src/services/rag/` i hook poza `src/app/`. Ekran pozostaje odpowiedzialny za wiadomości, pole tekstowe, status i źródła. Wykorzystamy komponenty RAG osobno, co biblioteka wspiera dla własnej integracji. [README RAG](https://github.com/software-mansion-labs/react-native-rag).

Przepływ jednej wiadomości:

1. Oblicz embedding pytania po polsku i wyszukaj fragmenty z lokalnej bazy.
2. Wybierz początkowo 4-6 wyników, usuń duplikaty i zastosuj próg trafności dobrany na pytaniach kontrolnych. Uwzględnij tytuł, stronę i datę źródła.
3. Przekaż Bielikowi pytanie i oznaczone źródła w limicie kontekstu. Poleć odpowiedź po polsku na podstawie dostarczonych fragmentów oraz jawne wskazanie braku informacji, gdy nie ma trafnego materiału. Treść dokumentów jest materiałem źródłowym, nie instrukcjami dla modelu.
4. Zachowaj streaming i Stop. Zatrzymanie podczas wyszukiwania anuluje dalsze generowanie przez kontrolę identyfikatora żądania, nawet jeśli obliczenia natywne kończą się później.
5. Pokaż pod odpowiedzią tytuły dokumentów i numery stron wyprowadzone z metadanych. Cytowania `[1]` muszą wskazywać rzeczywiście przekazane źródła.

Kontrola historii jest częścią integracji. Obecny `useLLMChatSession` zapisuje przekazane wiadomości w sesji; proste doklejanie wszystkich znalezionych fragmentów do każdej wiadomości zwiększa kontekst. Usługa będzie zarządzać czystą historią rozmowy i ograniczonym kontekstem bieżącego pytania, dobierając publiczne API ExecuTorch 0.10.4 w etapie zgodności. Nie przyjmujemy, że `resetOnTurn` usuwa historię.

Statusy obejmą przygotowanie bazy, wczytanie modeli, wyszukiwanie i generowanie. Brak poprawnej bazy nie uruchomi odpowiedzi udającej działający RAG. Próg trafności ogranicza użycie nietrafnych źródeł, ale sam nie gwarantuje poprawności odpowiedzi.

## 6. Kryteria odbioru

- Baza zawiera wyłącznie sześć polskich źródeł z manifestu i nie zawiera powtórzonych wersji poradnika.
- Każdy wynik prowadzi do istniejącego fragmentu oraz poprawnej strony oryginalnego PDF-u.
- Zestaw 20-30 polskich pytań obejmuje powódź, ewakuację, alarmy i zapasy; dodatkowo pytania spoza korpusu oraz pytania zależne od poprzedniej wypowiedzi.
- Porównanie rankingu desktop/telefon wykrywa niezgodność embeddingów przed wydaniem bazy.
- Release działa bez sieci po zapewnieniu lokalnych modeli; baza jest dostępna także przy pierwszym uruchomieniu i po czyszczeniu cache.
- Sprawdzamy aktualizację wersji bazy, uszkodzony plik, Stop podczas retrieval/generowania, nową rozmowę i budżet historii.
- Mierzymy rozmiar aplikacji, czas inicjalizacji i wyszukiwania oraz zużycie RAM z oboma modelami na docelowych urządzeniach.
- Uruchamiamy `npx expo lint`, `npx tsc --noEmit` i `npx expo-doctor`; istniejący błąd lint w `src/hooks/use-color-scheme.web.ts:11` trzeba rozliczyć przed zakończeniem wdrożenia.

Obecny adapter wykonuje skan i sortowanie wyników cosine similarity. Dla niewielkiego korpusu zaczniemy od pomiarów tej implementacji; optymalizację zapytania dodamy tylko wtedy, gdy pomiary wykażą potrzebę. Szczegóły schematu i zgodności są zapisane w [notatce badawczej](../research/react-native-rag.md).
