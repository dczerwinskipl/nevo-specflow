---
id: ideas.specflow-ui.screens.specification-creation
type: product
title: Specification creation, Documents and Session UX redesign
status: draft
scope: specflow
areas:
  - ui
tags:
  - specification
  - session
  - creation
  - worktree
  - mock
read_when:
  - reviewing Specification creation and manual or AI preparation
  - implementing the owner-approved Create and Documents UX in the bounded demo
summary: >
  Owner-approved Create and Documents contract: workflow-led single-column creation,
  first-session configuration, branch/worktree choice, preview-first documents in larger Secondary,
  and folder-context inline file operations through bounded Runtime demo capabilities.
related:
  - ideas.specflow-ui.screens.specs-overview
  - ideas.specflow-ui.navigation-route-model
  - product.specflow.ui.interaction-model
  - product.specflow.ui.ai-session-ux
  - design-system.principles.system-boundary
---

# Create i Documents — aktualny kontrakt UX

**Bieżąca iteracja: Visual Direction v7 oraz osobno dodatkowe uwagi właściciela z 19 października.**
Poniższe decyzje zastępują sprzeczne szczegóły v5/v6; wyniki v5 pozostają historycznym dowodem
tamtej wersji, nie akceptacją nowej kompozycji. Implementacja i weryfikacja v7 są w toku.

## Visual Direction v7 — uzgodniona kompozycja Create

Źródło kierunku: [handover v7](../../../../work/ux/specification-creation-v7/input/HANDOVER-VISUAL-DIRECTION-v7.md)
i załączony interaktywny prototyp. V7 zastępuje v6, zachowując decyzje flow Create z v4.
[Projekt UX](../../../../work/product-demo/owner-v7/DESIGN.md) zawiera mapę stanów i źródeł;
[decyzje DS](../../../../work/product-demo/owner-v7/DS-DECISIONS.md) przypisują konkretne receptury i właścicieli.
Nie traktujemy tego jako kosmetyki ani kopiowania stylów prototypu.

- Start odpowiada na wybór metody: jeden dominujący tytuł, dwie równorzędne całe powierzchnie
  komend, ikona po lewej tytułu i krótka różnicująca konsekwencja. Wide dwie równe kolumny,
  wysokość według rzeczywistej treści; narrow naturalny stack. Bez zagnieżdżonych przycisków.
- Create używa istniejącego `AppContentContainer size="narrow"` (760px), istniejących gutterów
  i rytmu DS. Formularz ma jedną kolumnę, bez prawego summary. Siatki zależą od rzeczywistej
  szerokości content, używają istniejących progów DS; providerzy 1/2/3 kolumny, bez nowych magicznych breakpointów.
- Archetype Summary jest rozpoznawalnym regionem: jedna akcentowana semantyczna ikona,
  prominentny rzeczywisty opis celu z katalogu, uporządkowane 0..N etapów i rezultat w postaci
  liczby wymaganych/sugerowanych dokumentów. Nazwy plików są osiągalne przez jawne szczegóły
  tylko do odczytu. Nie powielamy nazwy z Selecta jako dodatkowego dominującego tytułu.
  Brak metadata jest brakiem danych, nie zerem; nie wymyślamy celu, kategorii ani trzech etapów.
- Provider jest informacyjną powierzchnią wyboru z trzema stabilnymi torami: oryginalny znak,
  elastyczna nazwa/metoda/status oraz zarezerwowany skrajny check. Metadane zaczynają się pod
  nazwą. Selected nie przesuwa geometrii; niedostępny zachowuje czytelną nazwę i przyczynę.
  Demo availability nie oznacza uwierzytelnienia. Profil i quota pochodzą wyłącznie z kontraktu.
- Claude renderuje oryginalny kolor SVG `#D97757`, bez maski/tintu/filter; Codex pozostaje
  monochromatyczny zgodnie z assetem i motywem. Wspólny `SessionProviderIcon` obsługuje Create,
  Sessions i Tasks; unknown ma neutralny znak i rzeczywistą czytelną nazwę. Selekcja nie barwi logo.
- Wybory wielowierszowe używają współdzielonej receptury choice surface Nevo UI, nie lokalnej
  imitacji Button/RadioGroup. Produkt zachowuje semantykę komendy Start i natywnego radio providera.
  Istniejące tokeny `title-sm` dla sentence-case legend/nagłówków formy to jawne doprecyzowanie
  tego formularza; nie zmieniamy globalnego `section-label` ani palety.
- Model i wspierany Effort pozostają Select, Tryb pracy kompaktowym segmentem przy kilku
  wspieranych opcjach; pojedynczy tryb jest informacją, brak effort nie udaje martwego selecta.
  Zmiany providera nie zerują tytułu/workflow/Git. Gałąź pozostaje radio, Worktree checkboxem,
  z dotychczasowymi legalnymi domyślnymi wyborami i jedną linią rezultatu.
- Guard korzysta ze współdzielonego AlertDialog i semantycznych akcji `Kontynuuj` /
  `Porzuć konfigurację`, bez override wnętrza footera/kontrolek. Menu weryfikujemy względem
  dopuszczonych operacji, bez przebudowy Documents w ramach samego v7.

Obecny kontrakt demo zna quota wyłącznie `unknown`. Znane liczbowe/wielookresowe limity są
zależnością brakującego dokładnego kontraktu, a nie pozwoleniem na wygenerowanie danych.
Weryfikator ocenia wszystkie A01–A26 i S01–S18 z osobnym dowodem i statusem PASS/FAIL/BLOCKED/
NOT VERIFIED. Zrzuty before/after mają pochodzić także z rzeczywiście uruchomionego produktu
mobile/tablet/desktop; Storybook i zielone testy nie zastępują tego dowodu. P1 v5 i problem
tabletowego workspace zachowują osobny status; kompozycja v7 nie oznacza ich naprawy.

## Dodatkowe uwagi właściciela — osobny zakres korekt

[Handoff UX](../../../../work/product-demo/owner-v7/USER-ADDENDUM.md) doprecyzowuje poniższe
przypadki. To nowe upoważnienie do ograniczonych korekt Documents/nawigacji, nie nowy Editor Workspace.

| ID  | Obowiązująca decyzja i warunek weryfikacji                                                                                                                                                                                                                        |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| N01 | Specs list ma ograniczoną szerokość istniejącym content-width DS zamiast ultrawide listy; bez dokładania sidebara.                                                                                                                                                |
| N02 | Pusta historia ma prawdziwy EmptyState; loading/unavailable/error są rozróżnione.                                                                                                                                                                                 |
| N03 | Grupowanie Tasks wymaga śledzenia rzeczywistych danych demo i mapowania; nie wymyślamy grup w UI. Pełny przykład ma pokazywać istniejące grupy, jeśli są wspierane.                                                                                               |
| N04 | Podgląd dokumentu ma jawną promocję do pełnego dokumentu istniejącym wzorcem; nie jest to browser Fullscreen API.                                                                                                                                                 |
| N05 | Wide Documents bez wyboru zachowuje mniejsze Primary i znaczący placeholder Secondary; narrow nadal lista → istniejący Stack.                                                                                                                                     |
| N06 | Łączniki drzewa są wyśrodkowane względem chevronów i torów wcięć; demo zawiera rzeczywisty wielopoziomowy przykład. Uniwersalny TreeView to przyszły osobny zakres.                                                                                               |
| N07 | **Domyślnie Podgląd, zawsze jedna ikona:** `Edytuj dokument` (ołówek) / `Pokaż podgląd` (oko). Bez segmentu na każdej szerokości. Zachowujemy draft, zapis i guard; ta decyzja zastępuje edit-first i adaptacyjny segmented z v5.                                 |
| N08 | Status braku informacji o specyfikacji jest zwykłym sentence-case tekstem DS i opisuje brakującą informację, nie alarmowym nagłówkiem o niezrozumiałym kontekście.                                                                                                |
| N09 | Ten sam URL po F5 i po nawigacji musi zbiegać do tej samej tożsamości, menu i capabilities. Nie opieramy faktów tylko na cache poprzedniej strony; potrzebna istniejąca lekka projekcja albo jawnie uzgodniona read-only integracja metadata, bez zgadywania Git. |
| N10 | Nawigacja bez wybranej specyfikacji ma krótki placeholder wyboru, bez fałszywych aktywnych linków.                                                                                                                                                                |
| N11 | Sesje z prawidłowym celem są klikalnymi linkami; Zadania prowadzą do istniejącego obszaru zadań w Work danej specyfikacji. Nie wymyślamy globalnej strony Tasks ani aktywnego martwego linku.                                                                     |

**Stan 2026-10-19: korekty v5 wdrożone w demo, z niezależnym review kodu i wyglądu w opisanym zakresie.**
Aktualne dowody: [weryfikacja v5](../../../../work/product-demo/owner-v5/VERIFICATION.md),
[review kodu](../../../../work/product-demo/owner-v5/QUALITY-REVIEW.md) i
[review wizualne](../../../../work/product-demo/owner-v5/VISUAL-REVIEW.md).
Końcowy niezależny przebieg Chromium: 47/47; osobno sprawdzono żywe API oraz build pod IP.
Rzeczywisty zoom 200%, fizyczny Android/AT i pełny ręczny spacer pozostają niezweryfikowane;
pierwotnego problemu History nie odtworzono i nie deklarujemy jego naprawy.
Zrzuty 1708/1710/1712 wykazały odstępstwa od istniejącego Nevo: powroty, właściciela paddingu
i przewijania, stan niedostępnego worktree oraz kompozycję edytora. Właściciel zlecił porównanie
całego przepływu z istniejącymi ekranami i interakcjami, także poza tymi przykładami.
Poprzednie PASS komponentów/API i ograniczony render review pozostają dowodami tych testów,
ale **nie zastępują audytu spójności produktu**. UX designer opracował 18 ustaleń, UI implementer
wykonał korekty, a niezależni reviewerzy sprawdzili ich wyniki względem referencyjnych ekranów.
Ówczesna uwaga właściciela wymagała akcji Edycja/Podgląd w jednej kompaktowej linii;
zastąpiła ją późniejsza decyzja N07 powyżej. Korekty v5 poniżej zostały sprawdzone
w kodzie, renderach oraz połączonych testach Chromium z rzeczywistym routerem/shellem i usługami
fixture. Osobne HTTP potwierdza działające demo Runtime przez IP. Pełny ręczny spacer i fizyczna
klawiatura/systemowy Back Androida pozostają niezweryfikowane, bez pozornego pełnego PASS.
Dowody poprzedniej iteracji v4: [weryfikacja korekty](../../../../work/product-demo/owner-v4/CONSISTENCY-VERIFICATION.md).

## Korekta v5 — przyjęte granice i kryteria

Handover v5 jest wejściem do krytycznej oceny, nie poleceniem skopiowania wszystkich rozwiązań.
Poniższe doprecyzowania zastępują sprzeczne szczegóły v4; pozostały przepływ pozostaje aktualny.
Wyniki testów v4 nie zaliczają zmienionych scenariuszy v5. Uzasadnienia i rozdzielenie właścicieli:
[ocena UX](../../../../work/product-demo/owner-v5/DECISIONS.md) i
[audyt techniczny](../../../../work/product-demo/owner-v5/TECHNICAL-TRIAGE.md).

- Po błędzie Create zachowujemy wartości i tożsamość operacji. Jeśli użytkownik pozostał przy
  wysłanej akcji, ujawniamy feedback i ponowienie w istniejącym scrollu. Długi błąd pokazuje
  początek i umożliwia dotarcie do akcji. Nie przechwytujemy scrolla użytkownika, który odszedł
  od akcji. Nieznany wynik wymaga ustalenia wyniku, a nie nowego Create.
- Nagłówek dostosowuje prezentację ścieżki do szerokości własnego regionu, nie tylko całego
  workspace. Pełna ścieżka pozostaje dostępna. Back/Close zachowują znaczenie istniejącego Stack.
  Zamknięty lub nieobecny Secondary nie rezerwuje pustej kolumny; nie chowamy automatycznie
  znaczących stanów loading/error ani nie zmieniamy globalnie kontraktu `fit=content`.
- Guard porzucenia używa semantycznej akcji destrukcyjnej i czytelnej akcji kontynuacji,
  z bezpiecznym początkowym focusem. Drawer oraz guard wymagają sprawdzenia rzeczywistej
  kolejności modali, anulowania i powrotu focusa; nie zmieniamy footerów wszystkich dialogów
  wyłącznie na podstawie tego konsumenta.
- Menu wirtualnego korzenia zawiera przydatne operacje dodawania/importu, bez pozornego
  rename/move/delete korzenia. Ograniczenia wymaganych dokumentów są zwięzłe i dostępne.
  Tymczasowo niedostępnych, znaczących akcji nie usuwamy bez wyjaśnienia.
- Historyczna adaptacja v5 kontrolera trybu została zastąpiona przez N07: domyślnie podgląd,
  jedna opisana ikona przejścia między podglądem i edycją przy każdej szerokości.
- Opis workflow zaczyna się od celu, rozróżnia wymagane i sugerowane dokumenty oraz pokazuje
  rzeczywiste 0..N etapów z API. Bez stałych trzech kroków, powtórzonego nagłówka typu i nowej
  dekoracyjnej karty. Konfiguracja agenta pozostaje pełna; wspólny status demo pokazujemy raz,
  a różnice profilu/dostępu/limitu tylko jako rzeczywiste, przydatne fakty.
- Brak effort jest informacją o capability zamiast martwego selecta. Zmiana modelu zachowuje
  wspierany poprzedni tryb; w przeciwnym razie wybiera wspierany domyślny Agent albo wymaga
  jawnego wyboru. Nie wybieramy po cichu Ask i nie przypisujemy trybom nieistniejących uprawnień.
- Hierarchię i gęstość poprawiamy istniejącymi rolami tekstu i recepturami DS, bez lokalnej
  palety, nowych statusów i panelu podsumowania. Informacja o nietrwałości demo ma jedno
  właściwe miejsce, dostępne także z Documents; nie staje się zadaniem w drzewie.

Weryfikacja obejmuje połączone ścieżki, przed/po w tych samych stanach, rzeczywiste szerokości
regionów, 320–430 px, tablet po obu stronach progu split, desktop i zoom 200%, krótkie/długie
błędy, menu przy krawędziach, Drawer→guard i capabilities modeli. Zmiany współdzielone wymagają
porównania innych konsumentów Nevo. Activity History oraz opisany pas tabletowy wymagają
reprodukcji; brak dowodu nie oznacza naprawy. Wymienionych w handoverze nowych screenshotów
nie znaleziono w załącznikach. Fizyczny Android i pełna ręczna akceptacja pozostają osobnymi
granicami dowodów. Produkcyjne CLI/Engine, realne Git/worktree i wykonanie agenta pozostają poza zakresem.

**Decyzja właściciela: 2026-10-18.** Przyjęto dostarczony UX v4 i zlecono aktualizację specyfikacji,
implementację w rzeczywistej aplikacji demo oraz niezależne pętle review/poprawek. Ten dokument
jest jednym bieżącym kontraktem. Zastępuje starsze decyzje o drzewie/importowaniu plików przed
Create, podglądzie jako domyślnym wejściu do dokumentu oraz globalnych akcjach dodawania.
Nie należy zachowywać dawnych stanów, linków ani kształtu ekranu wyłącznie dlatego, że istnieją
w implementacji.

Źródło intencji: [handover właściciela v4](../../../../work/ux/specification-creation-v5/input/owner-v4/HANDOVER-create-spec-and-documents-v4.md).
[Przegląd pakietu](../../../../work/ux/specification-creation-v5/OWNER-V4-REVIEW.md) rozróżnia
hierarchię prototypu od jego błędów. HTML i screenshoty są wzorem zadania/kompozycji, nie źródłem
CSS, nowych headerów, nawigacji mobile ani nieomylną implementacją zachowania. Nevo UI pozostaje
właścicielem wyglądu kontrolek i App Shell. Poprzednie screenshoty/testy nie zaliczają aktualnego UX.

## Cel, zakres i ścieżka

Użytkownik wybiera sposób przygotowania specyfikacji, nazywa zmianę i wybiera workflow/typ.
Workflow określa wymagane artefakty oraz przebieg; sugerowane dokumenty można dodać później.
Szablon nowej specyfikacji jest neutralnym szkieletem, nie gotowymi wymaganiami niezwiązanymi
z tytułem użytkownika. Realistyczne przykłady SSO należą do danych demonstracyjnych/przykładów,
nie do domyślnej treści każdego nowego dokumentu. Nie implikuje to generowania AI lub nowego silnika szablonów.
Wybór agenta dotyczy wyłącznie pierwszej sesji. Specyfikacja może później obejmować wiele sesji
z różnymi wykonawcami. Dokumenty należą do istniejącej specyfikacji, nie do sesji.

```text
Specs → Nowa specyfikacja → Z agentem / Samodzielnie
→ nazwa + workflow + [konfiguracja pierwszej sesji] + gałąź/worktree
→ Create
  → potwierdzony sukces: Session placeholder / Documents + toast
  → błąd: zachowany formularz
  → nieznany wynik: ustalenie wyniku bez drugiego Create
  → spec istnieje, sesja nie: Documents tej specyfikacji + ponowienie tylko sesji
Documents → folder ••• → operacja → potwierdzenie Runtime → aktualne drzewo
Dokument edytowalny → Podgląd → ikona Edytuj / Pokaż podgląd → ten sam aktualny szkic
```

Obecny zakres techniczny to **demo Runtime w pamięci procesu**, za istniejącym produktowym API.
Nie wykonujemy realnego Git/worktree, provider execution ani trwałych operacji projektu.
Właściciel utrzymał produkcyjny backend jako późniejszy etap, a potrzebne nowe capabilities
planujemy i implementujemy teraz wyłącznie w ograniczonym demo; nie wymagamy ponownej zgody na
ten sam zakres. Projektowe `dataMode` nie może otrzymać atrapy tych capabilities.

## Pierwszy odczyt i regiony

| Powierzchnia        | Pytania użytkownika i hierarchia                               | Kompozycja                                                                                       |
| ------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Wejście Create      | Jak chcę pracować?                                             | Dwie duże karty na pełnej stronie; żadnego Secondary ani formularza w modalu.                    |
| Konfiguracja Create | Co tworzę? Co wymaga workflow? Z kim zacznę? Na jakiej gałęzi? | Jedna kolumna Primary; opis workflow, konfiguracja pierwszej sesji tylko w AI, gałąź i worktree. |
| Documents           | Gdzie jest plik? Co edytuję? Czy mam niezapisane zmiany?       | Mniejszy Primary z drzewem, większy Secondary z jedną aktywną treścią.                           |
| Session             | Z kim pracuję? Co chcę ustalić? Gdzie sprawdzę kontekst?       | Istniejący placeholder sesji w Primary, jeden composer, ogólny Kontekst w Secondary.             |

Nie wypełniamy wolnego miejsca dodatkowymi metadanymi. Header, breadcrumb i tożsamość dokumentu
nie scrollują z treścią. Body nie ma przypadkowego drugiego scrolla; regiony/editor mają jednego
właściciela przewijania. Proporcje i breakpointy pochodzą z AppWorkspace, nie z CSS prototypu.

### Spójność z istniejącą aplikacją

- Wzór nawigacji produktowej: `ApplicationLocationIdentity` / `ApplicationContextLine`
  z `ApplicationLocation.tsx`, używany w `FullTaskWorkspace` i `SpecificationSurface`.
  Wzór Back/Close kontekstowego dokumentu: host istniejącego Secondary Stack.
  Nie dodawać powrotu w footerze ani akcji Back w overflow obok już obecnego powrotu.
  Wide pokazuje rodzica trasy w breadcrumbach (np. Specyfikacje → spec → Sesje → sesja),
  bez kompensującego linku Back w treści. Narrow korzysta z istniejącego kontekstowego powrotu.
  Lokalny krok zmiany sposobu Create może mieć kontekstowy powrót także na wide, bo nie jest trasą.
- Powrót z konfiguracji Create prowadzi do wyboru sposobu i zachowuje dane; wyjście
  z wyboru sposobu prowadzi do Specs. Kolejna sesja oraz pełny placeholder wracają do
  listy sesji właścicielskiej specyfikacji, z właściwą etykietą celu.
  Lokalny krok używa tej samej prezentacji kontekstowego powrotu, bez literalnych strzałek w tekście.
- Nawigacja zachowuje wejściowe `collection` także dla wyboru dokumentu, promocji z kontekstu
  sesji i powrotu. Tylko nowo utworzona specyfikacja świadomie trafia do Current.
- Loading/error/retry pozostają w standardowym Workspace z jego headerem i powrotem;
  nie zastępują całego ekranu samotnym paragrafem lub Alertem. Błąd odświeżenia nie kasuje szkicu.
- Opuszczenie zmienionej konfiguracji używa dostępnego wzorca DS Dialog, nie `window.confirm`.
  Guard chroni znaczące zmiany konfiguracji, także model/tryb/gałąź bez wpisanego tytułu oraz
  konfigurację kolejnej sesji. Anulowanie zachowuje dane/focus; pending i nieznany wynik nadal
  blokują zmianę operacji, również przed unload.
- Scroll viewport pozostaje bez zewnętrznego paddingu; padding ma jeden właściciel treści.
  `AppWorkspaceBody scroll=area` nie dostaje jednocześnie paddingu root przez className
  i domyślnego paddingu content. Nie naprawiać tego ujemnymi marginesami ani dodatkowym wrapperem.
- Na narrow wejście w formularz nie otwiera automatycznie klawiatury. Focus trafia na
  nagłówek/kontekst; po świadomym dotknięciu pola prawidłowy scroll musi nadal działać
  przy zmniejszonej wysokości. Test krótkiego viewportu nie zastępuje testu fizycznej klawiatury.

Dowody porównawcze obejmują niezmienione referencyjne rendery Task/Specification/scroll oraz
rzeczywiste połączone ekrany z routerem i usługami testowymi. Sam fixture edytora lub nawigacja
z placeholderem „Projekt” nie może zaliczyć zgodności całego procesu.

## Create

### Wejście i zachowanie szkicu

- Pierwszym krokiem są dwie całkowicie aktywne karty **Z agentem** i **Samodzielnie**.
  Wide: równe kolumny 1:1 i wysokość wynikająca z najwyższej treści w rzędzie, bez fixed height.
  Narrow: pionowo, ikona obok etykiety, zgodne z DS hit target i focus. Bez segmentów/radio/select.
- Po wyborze pojawia się formularz **Nazwa → Workflow → początkowa sesja (tylko AI) → Gałąź i worktree**.
  Desktop i mobile są jednokolumnowe. **Brak Secondary**, podsumowania po prawej, drzewa planowanych
  plików, uploadu, wyboru opcjonalnych plików i mutacji dokumentów przed Create.
- **Wróć do wyboru sposobu** zachowuje nazwę, wybrany workflow, konfigurację gałęzi/worktree
  i ostatnią konfigurację agenta. Wartości AI nie wpływają na tworzenie ręczne. Nie wysyłamy promptu
  z formularza; pierwsza wiadomość powstaje dopiero w composerze otwartej sesji.

### Workflow i artefakty

Jest jeden select/combobox workflow/typu w Primary, ten sam w obu ścieżkach. Obejmuje nazwę,
krótki opis, rzeczywiście znany przebieg oraz tekstowe **Wymagane** i **Proponowane później**.
Nie ma checkboxów przy plikach ani fikcyjnych sugerowanych dokumentów w drzewie po Create.
Utworzenie materializuje dokumenty wymagane wybranego workflow. Późniejsze sugestie pozostają
sugestiami do chwili świadomego dodania dokumentu.

Dane są własnością katalogu Runtime, a nie tablicy zaszytej w ekranie. Obecny katalog archetypów
nie jest automatycznie pełnym read modelem workflow: demo wymaga jawnej projekcji identyfikatora,
opisu, znanych etapów, required paths i sugestii oraz wersji. Można użyć oznaczonych fixture demo,
bez deklarowania realnej konfiguracji projektu. Produkcyjny workflow read model i sekwencja
wykonania pozostają brakującą zależnością. Brak/stale/error katalogu nie oznacza pustego workflow:
brak uprawnienia do Create, zrozumiała przyczyna i ponowienie bez utraty szkicu.

### Początkowa sesja agenta

- Nagłówek wyjaśnia **Początkowa sesja agenta**, nie właściciela specyfikacji. Rozpoznawalne
  istniejące ikony Codex/Claude, nazwa wykonawcy i profil. Karty providerów: grid 2 kolumny
  przy dostępnej szerokości, 3 tylko przy rzeczywistym katalogu i odpowiednio szerokim Primary;
  na narrow jedna kolumna. Nie dodajemy sztucznego trzeciego wykonawcy.
- Model to świadomy select bez wymuszonego automatycznego wyboru; effort jako select obok,
  poniżej na narrow. Ask/Edit/Agent to jedna selekcja segmentowa zgodna z capabilities modelu.
  Nie ukrywamy bez słowa wspieranej opcji. Niewspierana wartość ma disabled z powodem;
  brak effort jest opisany jako brak capability. Zmiana modelu/wykonawcy usuwa niezgodne wartości.
- API/subskrypcja, profil, dostępność i quota wynikają wyłącznie z potwierdzonego źródła.
  Nieznane połączenie nie jest arbitralnie API ani subskrypcją. Nieznany limit to jawne
  **Brak danych o limicie**; znany ma jednostkę i okno pomiaru. Nie przenosimy przykładowych
  kwot, jakości modeli, cen ani wersji z HTML do produktu. Demo fixture jest jawnie fixture,
  nie rzeczywistym kontem. Pobieranie rzeczywistych quota pozostaje poza zakresem.
- Niedostępny wykonawca/stale katalog blokuje nieważną konfigurację z przyczyną. Nie zmieniamy
  po cichu providera. Otwarcie sesji tylko alokuje idle placeholder: bez automatycznego turnu.

### Gałąź i worktree

Sekcja **Gałąź i worktree** pozostaje wspólna. Pierwsza i domyślnie zaznaczona opcja to
**Nowa gałąź**, druga **Bieżąca · main** (rzeczywista nazwa z kontekstu). Oddzielny checkbox
**Użyj osobnego worktree** jest domyślnie ON, jeśli dostępny i legalny. Nie wracamy do osobnej
pary opcji „Folder” ani abstrakcyjnego „Miejsca pracy”.

Nazwa nowej gałęzi jest widoczna; sugestia podąża za tytułem do pierwszej ręcznej zmiany,
a ręczna wartość pozostaje po powrotach i przełączeniu metody. `feature/{slug}` jest oznaczonym
wzorcem fixture demo. Produkcyjna konfiguracja wzorca jest niepotwierdzoną zależnością;
nie budujemy tutaj edytora konfiguracji. Walidacja nazw i znanych kolizji ma właściciela w Runtime.

Przy dostępnym checkboxie widoczny jest aktualny wynik: **Specyfikacja powstanie w nowym worktree
na gałęzi …** albo **Specyfikacja powstanie w bieżącym katalogu … na gałęzi …**. Gdy bieżąca gałąź
lub brak capability uniemożliwia osobne worktree, zamiast martwego disabled checkboxa pokazujemy
zwięzłą informację o rzeczywistym miejscu i przyczynie. Checkbox wraca przy legalnym wyborze nowej
gałęzi. Tymczasowy pending/unknown zachowuje widoczną kontrolkę i blokadę operacji; nie jest brakiem
capability. Nowa gałąź bez worktree jest legalnym wariantem, z informacją
że checkout nastąpi dopiero przy Create. Bieżący katalog jest tylko do odczytu, bez folder pickera.
Obsługa zmodyfikowanych plików i rzeczywistego checkout wymaga przyszłego kontraktu Git.
W demo sukces oznacza wyłącznie przygotowany wynik w pamięci, nie wykonaną operację repozytorium.

### Pending, sukces i odzyskiwanie

| Wynik                             | Wymagane zachowanie                                                                                                                                                                                            |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pending Create                    | Jeden request/logiczna operacja, disabled CTA i ochrona double submit; wartości pozostają.                                                                                                                     |
| Potwierdzony sukces ręczny        | Bezpośrednio Documents utworzonej specyfikacji, edycja pierwszego edytowalnego wymaganego dokumentu lub sensowny pusty stan.                                                                                   |
| Potwierdzony sukces AI            | Bezpośrednio początkowa idle sesja; composer pusty, kontekst przekazany systemowo.                                                                                                                             |
| Sukces obu ścieżek                | Krótki dostępny toast **Specyfikacja utworzona**, bez success-screen, dodatkowego wyboru czy blokującego overlaya.                                                                                             |
| Walidacja/odrzucenie              | Formularz pozostaje, dane i konfiguracja zachowane; błąd przy właściwym polu/akcji.                                                                                                                            |
| Nieznany wynik/utracona odpowiedź | Recovery ustala autorytatywny wynik tej samej operacji. Brak ślepego nowego Create; ponowienie używa tej samej tożsamości/idempotency.                                                                         |
| Spec istnieje, sesja zawiodła     | Przejście do Documents istniejącej specyfikacji z konkretnym **Nie udało się otworzyć sesji** i ponowieniem wyłącznie sesji. Bez drugiego Create ani powrotu do zmiennej konfiguracji utworzonej specyfikacji. |

## Documents

### Regiony i domyślny dokument

Wybrany **wariant B** jest wiążący: lista/drzewo w mniejszym Primary, jeden aktywny dokument
w większym Secondary (`split=secondary`, około 1/4–1/3 vs reszta zgodnie z hostem). Nie ma
trzeciego panelu ani konkurencyjnego podglądu. Lista zawiera wyłącznie pliki istniejącej
specyfikacji; sekcje Markdown to nagłówki treści, nie pliki.

Kliknięcie wiersza pliku jest jednym zwykłym wejściem do jego treści. Na narrow działa standardowy
**Secondary Stack + Back**, bez nowych zakładek Pliki/Dokument z HTML. Back, zamknięcie panelu
i zmiana breakpointu zachowują wybór, tryb, draft, pozycję kursora/zaznaczenie i scroll;
ponowne otwarcie pliku wznawia pracę. Zmiana wide → narrow przekazuje ten sam aktywny plik
do standardowego Stack, a świadomy Back nie może być anulowany automatycznym ponownym otwarciem.
Nie dodajemy „Otwórz dokument” i „Powiększ dokument” jako konkurujących wejść z listy.

Edytowalny dokument otwiera się domyślnie w **Podglądzie** na całej dostępnej przestrzeni treści.
Jeden kompaktowy pasek identyfikuje plik i udostępnia **jedną ikonę przejścia trybu**,
korzystając z DS kontrolek i gramatyki istniejącego headera/akcji. Pełna ścieżka pozostaje dostępna
przy skróceniu długiej nazwy. Nie powtarzamy tożsamości, trybu i formatu w kilku osobnych pasach.
Odsłonięcie ścieżki musi działać przez focus i świadomy dotyk; sam atrybut title ani nieaktywny
tab stop nie jest dowodem osiągalności na telefonie.
Zapisz/Anuluj są poza scrollem i pozostają osiągalne także w dirty narrow; akcje mogą używać
standardowej kompaktowej prezentacji. Na narrow Zapisz/Odrzuć pozostają bezpośrednimi,
opisanymi dostępną nazwą IconButtonami, a nie wyłącznie wpisami overflow. Nie ma dodatkowego footera z „Brak niezapisanych
zmian”, osobnych podpisów „Edycja · Markdown” ani rzędu „Markdown · Ctrl/⌘ S”. Dirty, pending
i błędy pokazujemy tylko wtedy, gdy przekazują potrzebną informację. Markdown ma kolorowanie,
skrót zapisu, historię i zwykłe zaznaczenie; `.txt` edycję tekstową. Wyłączamy przypadkowe
fold gutter, numery linii i dekoracyjne tło aktywnej linii dostarczane przez `basicSetup`,
w konfiguracji edytora, nie przez ukrywanie CSS. Nie dodajemy lokalnego wariantu DS tylko po to,
by wymusić rozmiar kontrolki; nazwa pliku jest elastyczna, akcje muszą mieścić się w całości.
Tab/Shift+Tab zachowują zwykłą nawigację fokusu, bez nieobjaśnionego przechwycenia do wcięć.
Skróty edycyjne i cofanie pozostają dostępne; nie trzeba znać ukrytej komendy biblioteki, żeby wyjść z edytora.
**Zapisz pozostawia edytor otwarty z czystym draftem**; nie przełącza automatycznie do podglądu.
Zniknięcie akcji po zapisie/odrzuceniu nie porzuca fokusu do body: zachowujemy sensowny punkt
pracy w edytorze/toolbarze, bez przejmowania fokusu, który użytkownik przeniósł podczas requestu.

Podgląd renderuje bieżący draft, także niezapisany. Powrót do Edycji nie ładuje
ponownie starszej wersji ani nie zeruje draftu. Read-only format stosuje dozwolony viewer albo
jawny brak capability; nie udajemy edycji lub parsowania nieobsługiwanego formatu.

### Drzewo i akcje folderu

Root **Główne** i każdy folder mają osiągalne **•••**, tak samo na desktopie i dotykiem.
Klik nazwy folderu rozwija/zwija dzieci; menu jest osobnym celem. Wiersz pliku i jego menu również
są rodzeństwem: żadnego button w button, kliku otwierającego plik po wyborze menu ani utraty fokusu.
Drzewo zachowuje czytelną hierarchię, wcięcia i aktywny plik także dla długich nazw.

Menu folderu: **Nowy plik**, **Nowy folder**, **Wgraj pliki**, a inne operacje wyłącznie według
capability. **Brak globalnych + Dokument/+ Folder**, stałego folder select i dialogu ponownie
pytającego o folder dla create: docelowy folder jest już znany z kontekstu. Root nie może być
przeniesiony, przemianowany ani usunięty.

### Inline create i rename

Po Nowy plik/Nowy folder menu znika, docelowy folder rozwija się, a **tymczasowy wiersz** z inputem
pojawia się wśród jego dzieci i otrzymuje focus. Jest oznaczonym pending szkicem, nie trwałym plikiem.
W danej chwili jest jedna operacja inline. Enter i blur nie mogą wysłać dwóch mutacji.

| Zdarzenie                              | Kontrakt                                                                                                            |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Nowy plik `notes`                      | Przy braku rozszerzenia propozycja `notes.md`; Runtime waliduje wynik.                                              |
| Nowy plik `notes.txt`                  | Jawne rozszerzenie zachowane; nie doklejamy `.md`.                                                                  |
| Nowy folder `plans`                    | Brak automatycznego rozszerzenia.                                                                                   |
| Rename istniejącego pliku              | Nazwa jest jawna; nigdy automatycznie nie dopisujemy `.md`.                                                         |
| Enter / niepusty blur                  | Jedno zlecenie tej samej operacji; pending blokuje ponowne wysłanie.                                                |
| Escape / pusty Enter lub blur          | Anulowanie bez requestu i bez wpisu w trwałym drzewie.                                                              |
| Invalid/duplikat/conflict/błąd Runtime | Nazwa i edytowalny wiersz pozostają, błąd przy input; brak phantom file.                                            |
| Autorytatywny ACK                      | Dopiero teraz synchronizacja drzewa/indeksów, docelowy element i focus. Nowy edytowalny plik otwiera się do edycji. |
| Nieznany wynik mutacji                 | Ustalenie wyniku tej samej operacji przed kolejnym create, bez duplikatu.                                           |

Nazwy ukryte/systemowe, kropka końcowa, separatory, containment i case collisions rozstrzyga
właściciel walidacji Runtime, nie optymistyczna manipulacja manifestem w UI. Faktycznie wspierane
formaty są capability operacji, nie dowolnym ograniczeniem w komponencie. W bieżącym demo są to
`.md/.txt`; rozszerzenie formatu wymaga rzeczywistej obsługi, nie tylko zniesienia accept.

### Rename, move, delete i required paths

Menu pliku udostępnia **Zmień nazwę**, **Przenieś**, **Usuń** zgodnie z capability. Rename preferuje
inline. Move wybiera istniejący docelowy folder przez istniejący DS Field/Select; nie tworzy
drugiego globalnego folder select ani lokalnie stylowanego natywnego selecta.
Delete wymaga potwierdzenia wskazującego konkretny plik/folder i skutek. Po operacji fokus i aktywny
dokument są uzgodnione z wynikiem: usunięty plik nie pozostaje widoczną treścią, anulowanie nie mutuje.

Required path jest polityką workflow. Usunięcie, rename lub move wymaganego pliku są zablokowane,
gdy naruszyłyby tę ścieżkę, z czytelnym powodem. Ta sama ochrona obejmuje operacje na jego
**folderach przodkach**, także recursive delete oraz rename/move zmieniające required path.
Kontrola istnieje po stronie Runtime, więc bezpośredni request nie może ominąć disabled menu.
Folder z niechronionymi plikami może być obsługiwany tylko, jeśli jego capability jest jawnie
zaimplementowana wraz ze spójną aktualizacją ścieżek i odwołań. Brak capability ma przyczynę,
a nie przycisk, który lokalnie udaje sukces.

Każda akcja mogąca zmienić aktywny dokument lub porzucić jego zawartość — nowy plik, upload,
rename/move/delete, inny plik lub nawigacja — przechodzi przez **Zapisz / Odrzuć / Anuluj**.
Nie chronimy wyłącznie rename. Nieudany zapis zachowuje dirty draft i zatrzymuje dalszą mutację.
Cancel oraz powrót z menu/dialogu zachowują pozycję i focus; idempotentny rezultat nie resetuje draftu.

### Wgraj pliki po Create

Wcześniejszy wymóg właściciela pozostaje: **folder ••• → Wgraj pliki**. Natywny picker dziedziczy
folder docelowy; import występuje wyłącznie w Documents istniejącej specyfikacji. Obecne capability
demo obsługuje tekstowe `.md/.txt` w UTF-8, limity partii/rozmiaru z istniejącego kontraktu Runtime.
Duplikaty pełnej ścieżki nie są nadpisywane; każdy pominięty plik ma własną faktyczną przyczynę
(limit partii, rozmiar, format, odczyt/UTF-8, kolizja ścieżki), nie wspólną listę możliwych przyczyn.
Znane błędy Runtime przy inline odróżniają niepoprawną nazwę, duplikat i konflikt rewizji;
nieznany wynik transportu nadal wymaga ustalenia tej samej operacji. Pending odczytu/zapisu
blokuje kolidujące mutacje; wpis pojawia się po ACK. Nie ma frontendowych zapisów `fs`, manipulowania
manifestem ani samodzielnego „trwałego uploadu”. Nie wysyłamy zawartości do agenta automatycznie.
PDF/DOCX i inne formaty pozostają poza faktyczną capability; bez fałszywego parsera/viewera.

### Puste foldery

W ograniczonym demo Runtime autorytatywnie utrzymuje jawny zbiór folderów, także pustych,
**do restartu procesu**. Nowy folder ma potwierdzenie API i tę samą ograniczoną trwałość co reszta
demo; UI jawnie nie gwarantuje zachowania po restarcie/Git checkout. To zaakceptowana granica
obecnej implementacji, bez `.gitkeep` i bez operacji filesystem.

Produkcyjna polityka utrwalania pustych folderów jest **BLOCKED: engine capability** do decyzji
właściciela Engine. Demo memory nie jest dowodem trwałej struktury projektu. Produkcyjne UI może
włączyć tę operację dopiero na podstawie rzeczywistej capability z określoną trwałością.

## Session pozostaje placeholderem

Nie projektujemy teraz rozmowy, streamingu ani execution. Zachowujemy pełny Primary sesji,
kompaktową identyfikację providera i jeden composer. Otwarcie nie wysyła wiadomości; mock/demo
bez silnika ma disabled Wyślij z przyczyną. Systemowy kontekst SpecFlow jest niezależny od tekstu
użytkownika i nie jest doklejany jako jego wiadomość.

Secondary to ogólny **Kontekst**, w którym dokumenty są jedną pozycją obok projektu i instrukcji.
Nie przypinamy na sztywno dokumentów jako jedynego kontekstu. Drill-down/Back oraz przejście do
Documents i powrót zachowują szkic composera; brak drugiej rozmowy i małej karty chat.

Akcja otwierania Kontekstu jest potrzebna na narrow lub po zamknięciu inspektora, nie obok już
widocznego tego samego panelu. Hub i lista dokumentów używają istniejącej produktowej kompozycji
wiersza; nie wciskamy wielowierszowych kart w wewnętrzny label/fixed height Buttona.
Nie projektujemy kolejnego composera: reuse istniejącego wzorca lub minimalny jawny placeholder.
Nowa sesja istniejącej specyfikacji ma copy dotyczące **tej sesji**, bez „pierwszej/początkowej”,
tworzenia workflow albo ponownego tworzenia specyfikacji. Nazwy widoków korzystają z istniejących
tłumaczeń produktu; nazwy workflow/modeli z danych nie są tłumaczone zgadywaniem.

## Komponenty i właściciele

Przegląd źródła potwierdza poniższe primitives i stories; nie jest to nowy zaliczony render.
Nie potwierdzono gotowego DS Tree/InlineRename/TextEditor: drzewo i inline state to świadoma
**kompozycja produktowa** z istniejących kontrolek, bez lokalnej kopii Button/Menu ani zmiany
ich wspólnego wyglądu. Istniejący produktowy edytor Markdown pozostaje właścicielem edycji.

| Region                  | Istniejący wzorzec / dowód story                                                                                                             | Decyzja właścicielska                                                                                           |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Shell, regiony i scroll | `AppWorkspace.stories.tsx`, `AppWorkspaceScroll.contract.stories.tsx`, `WorkspaceHeader.stories.tsx` w `packages/nevo-ui/src/app/workspace/` | Reuse AppShell/AppWorkspace/Header; Create tylko Primary, Documents split=secondary. Bez nowego wrappera/karty. |
| Mobile                  | `app/workspace/examples/SecondaryStackExample.stories.tsx`, w tym ClosePageReturnsToParent/focus return                                      | Istniejący Secondary Stack; bez zakładek z prototypu.                                                           |
| Dwie karty sposobu      | Button/surface primitives                                                                                                                    | Produktowe karty nawigacyjne; nie nowy wariant SegmentedControl.                                                |
| Workflow/model/effort   | `components/forms/Select/Select.stories.tsx`                                                                                                 | Reuse Select; domenowa projekcja katalogu w SpecFlow.                                                           |
| Gałąź/worktree/tryby    | `RadioGroup/RadioGroup.stories.tsx`, `Checkbox/Checkbox.stories.tsx`, istniejący SegmentedControl                                            | Radio branch, checkbox dostępnego worktree, segmenty capability modes oraz Edycja/Podgląd dokumentu.            |
| Menu drzewa             | `components/overlays/Menu/Menu.stories.tsx`, `OverflowMenu.stories.tsx`                                                                      | Reuse Menu/IconButton; produktowe row + osobny trigger, required policy z Runtime.                              |
| Tree/inline             | Produktowa kompozycja list/disclosure/input nad primitives                                                                                   | Jeden pending row i guard; brak udawania nowej ogólnej DS Tree capability.                                      |
| Dokument                | `components/content/MarkdownDocument/MarkdownDocument.stories.tsx`, istniejący MarkdownSourceEditor/CodeMirror                               | Read-only MarkdownDocument dla draft preview; produktowy edytor pełnej treści.                                  |
| Feedback                | `components/feedback/Toast/Toast.stories.tsx`, istniejące Alert/Dialog                                                                       | Toast po sukcesie; inline błędy i existing guard/dialog dla konsekwencji.                                       |
| Sesja                   | `components/patterns/MessageComposer/MessageComposer.stories.tsx`, SessionProviderIcon                                                       | Zachować placeholder i Context, bez drugiego engine.                                                            |

Ścieżki stories są dowodami odkrycia komponentów, nie nakazem kopiowania JSX. Stosować tokeny,
warianty, semantyczną typografię i zachowanie aktualnego Nevo UI. App Header i document toolbar
poza scrollem; jeden scroll treści, prawidłowe min-height/min-width i brak poziomego overflow.

## Integracja i zależności

Dokładny właściciel API/payloadów: [reference.api.specification-creation-demo](../../../reference/api/specification-creation-demo.md).
UX opisuje skutki i wymagania, nie kopiuje endpointów. Fakty wejściowe i luki są w przeglądzie
pakietu; ich status zmienia się dopiero z dowodem wdrożenia/testu, nie przez nowe przyciski.

| Capability                                | Stan wejściowy i plan obecnego zakresu                                                                                                   | Granica produkcji                                                                |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Create/location/session allocation        | Istniejące demo; dostosować required-only, workflow projection, pending/reconciliation i partial recovery                                | Bez Git/provider execution; produkcyjny workflow read model niepotwierdzony.     |
| Dokument create/import/save, folders      | Istniejące demo API; konsumować wynik, rewizje i idempotency dla inline UX                                                               | Trwałość projektu i ingest mają późniejszego właściciela.                        |
| Rename/move/delete i required-path policy | Bounded Runtime demo commands/projekcje i contract tests są wdrożone; iteracja spójności zmienia ich prezentację, nie właściciela danych | Produkcyjne spójność indeksów/referencji/locks nie są zadeklarowane jako gotowe. |
| Empty folder                              | Runtime-memory lifetime jawnie wspierana w demo; weryfikacja dla nowej iteracji nadal wymagana                                           | BLOCKED trwała polityka Engine, bez .gitkeep.                                    |
| Quota/connection source                   | Fixture demo lub unknown, bez pozorowanych rzeczywistych limitów                                                                         | Rzeczywisty read model/fetch poza obecnym zakresem.                              |

Implementacja nie może ominąć tych zależności przez frontendowe lokalne manifesty albo sukces
przed ACK. Niezależne prace nad Create, semantyką regionów, menu i edytorem mogą postępować,
a brakujące bounded demo contracts muszą powstać przed integracją zależnych akcji.

## Akceptacja V01–V40 i dowody

**Po audycie porównawczym 18–19 października:** tabela niżej zachowuje zakres dowodów poprzedniej
iteracji i nie jest zaliczeniem obecnej korekty. Aktualna lista usterek i wyników per finding:
[decyzje UX CD01–CD18](../../../../work/product-demo/owner-v4/CONSISTENCY-DESIGN.md),
[niezależny audyt CUX](../../../../work/product-demo/owner-v4/CONSISTENCY-UX-REVIEW.md).
Zamknięcie wymaga ponownego porównania z niezmienionymi ekranami Task/Specification i testów
połączonego routera/shella, w tym archive context, breakpoint handoff i krótkiego viewportu z focusem.

Aktualny stan tej iteracji: **NOT VERIFIED** poniżej oznacza brak dowodu dla nowego kontraktu,
nie stwierdzony fail. Wcześniejsze source audits i screenshoty historyczne nie są aktualnym PASS.
Implementer/verifier dopisują konkretne źródła/testy/stories/screenshots i wynik po weryfikacji;
nie odhaczają testu na podstawie tej specyfikacji. Render/browser gate nadal nie jest zaliczony.

| ID  | Scenariusz / wynik wymagany                                            | Dowód i status aktualny                                                                                                                        |
| --- | ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| V01 | Dwie karty Create otwierają obie ścieżki                               | PARTIAL — ChoiceAndConfiguration (Chromium); normalny entry aplikacji bez ręcznego przejścia.                                                  |
| V02 | Wide 1:1/equal content height; narrow ikona obok i stack               | PASS render/story — choice-wide/mobile, równe karty i asercje geometrii.                                                                       |
| V03 | Powrót zachowuje dane wspólne i AI                                     | PARTIAL — story zachowuje tytuł przy zmianie sposobu; pełny AI snapshot wymaga connected walkthrough.                                          |
| V04 | Brak dokumentów/checkboxów/importu przed Create                        | PASS component/source — jeden formularz obu metod bez pre-create tree/import.                                                                  |
| V05 | Workflow/required/suggested z katalogu, nie fake UI                    | PASS demo API — live HTTP required-only i workflow z Runtime; produkcyjny read model MISSING.                                                  |
| V06 | Manual bez osieroconej sekcji AI/separatora                            | PASS render — create-manual-wide/mobile oraz footer.                                                                                           |
| V07 | Agent wyłącznie pierwszej sesji, bez execution                         | PARTIAL — źródło/payload i Runtime idle allocation; connected UI bez ręcznego przejścia.                                                       |
| V08 | Profil/znane połączenie/availability/quota lub unknown                 | PASS render/source demo — profile Demo, availability w demo, unknown quota; brak real quota fetch.                                             |
| V09 | Disabled/stale/no data bez fikcyjnych limitów                          | PARTIAL — CatalogueFailureKeepsDraft i unknown metadata; pełny negatywny catalogue matrix niezweryfikowany.                                    |
| V10 | Model/effort/modes zgodne z capabilities                               | PASS component — ExplicitModelCapabilities, oba providery i model bez effort.                                                                  |
| V11 | Nowa gałąź pierwsza/preselected obu ścieżek                            | PASS source/story — nowa gałąź domyślna obu metod.                                                                                             |
| V12 | Worktree ON gdy legalne, blokada i powód gdy nie                       | PARTIAL — checkbox default ON i blokady źródłowe; pełny connected branch/worktree matrix niezweryfikowany.                                     |
| V13 | Create pending i double-submit guard                                   | PARTIAL — Runtime idempotency i source submit fence; real double-tap UI niezweryfikowany.                                                      |
| V14 | Sukces od razu destination bez success-screen                          | NOT VERIFIED connected — destination wiring sprawdzone w źródle, bez ręcznego end-to-end obu metod.                                            |
| V15 | Toast mały/status/focus nieprzejęty                                    | NOT VERIFIED composed app — toast wiring jest, brak manualnego dowodu focus/feedback.                                                          |
| V16 | Błąd zachowuje formularz i dane                                        | PARTIAL — CatalogueFailureKeepsDraft oraz LostCreateAcknowledgement; pełna macierz błędów niezweryfikowana.                                    |
| V17 | Unknown outcome reconciliation bez duplicate                           | PASS bounded demo — LostCreateAcknowledgement, LostInlineAcknowledgement i Runtime replay; bez produkcyjnego transportu.                       |
| V18 | Spec istnieje/session failed: Documents+session retry                  | PARTIAL — source recovery snapshot i testy pipeline; connected Documents/session retry bez ręcznego przejścia.                                 |
| V19 | Documents istniejącej specyfikacji, dopiero po Create                  | PARTIAL — HTTP potwierdza manifest po Create i istniejący routing; ręczna nawigacja niezweryfikowana.                                          |
| V20 | Wide small Primary tree/big Secondary doc, bez trzeciego panelu        | PASS render — documents-wide, mniejsze Primary i większe Secondary.                                                                            |
| V21 | Mobile Secondary Stack/Back i draft bez utraty                         | PARTIAL — ustabilizowany mobile Secondary render; connected Back/draft guards niezweryfikowane ręcznie.                                        |
| V22 | Editable default edit, bez mode segmented                              | PASS component — domyślna edycja MD/TXT, aktualne editor stories.                                                                              |
| V23 | Jedna kompaktowa linia plik + Edycja/Podgląd + potrzebne akcje         | CHANGES REQUIRED — eye-only i wielopasmowy chrome zastąpione bieżącą decyzją; potrzebny nowy render/recheck dirty/clean 320/390/1440.          |
| V24 | Preview aktualnego dirty draftu, save przez Runtime                    | PASS component + demo API — draft preview, save pozostaje w edytorze, fresh read/revision guard.                                               |
| V25 | Brak global Add/folder select create                                   | PASS render/source — brak global Add oraz create-folder select.                                                                                |
| V26 | Root/każdy folder menu create/upload                                   | PARTIAL — root/folder menu render/source; rzeczywisty native upload picker bez ręcznego przejścia.                                             |
| V27 | Plik rename/move/delete według capabilities                            | PASS bounded demo — tree capabilities + Runtime commands i menu według dostępności.                                                            |
| V28 | Inline row we właściwym folderze                                       | PASS story/render — inline w folderze, inline-file-wide.                                                                                       |
| V29 | Autofocus, Enter/blur jeden submit                                     | PASS component — autofocus/Enter/blur fence, LostInlineAcknowledgement, jeden logiczny request.                                                |
| V30 | Escape/blank bez mutacji/requestu                                      | PARTIAL — Escape bez mutacji i focus assertion PASS; blank blur/folder ACK focus także w źródle.                                               |
| V31 | New missing extension .md, explicit .txt, rename bez autoext           | PARTIAL — nowy plik .md w story, Runtime rename/move i MD↔TXT; pełna macierz nazw niezweryfikowana UI.                                         |
| V32 | Invalid/duplicate/conflict zachowuje input i błąd                      | PASS scoped demo — invalid/conflict zachowuje inline input, stale confirmation wysyła obserwowaną rewizję.                                     |
| V33 | Trwały element dopiero po ACK                                          | PASS source/component — pending inline, unknown-result lock i jawne reconciliation; bez lokalnego manifestu przed ACK.                         |
| V34 | Empty folder z Runtime-memory lifetime                                 | PASS demo HTTP — pusty folder pozostaje; restart resetuje pamięć. Produkcja BLOCKED Engine policy.                                             |
| V35 | Required file rename/move/delete chronione                             | PASS demo — disabled file menu + bezpośrednie protected commands w HTTP/testach.                                                               |
| V36 | Required descendants blokują ancestor operations                       | PASS Runtime — required ancestors, casefold oraz atomic operation regressions; nie produkcyjny Engine.                                         |
| V37 | Mutacje aktualizują indeks/referencje i UI/recovery                    | PASS bounded demo API — kontekst sesji i manifest po add/rename/move/delete, stable IDs, brak resurrection.                                    |
| V38 | Osobny click/tap/focus nazwy i menu                                    | PARTIAL — sibling row/menu targets w źródle i renderach, Escape/provider focus; pełny Tab/tap flow niezweryfikowany.                           |
| V39 | Long names, zoom200%, 320/360/390/430/tablet/wide bez overlap          | NOT VERIFIED — render 390 i 1440 PASS, brak pełnej macierzy 320/360/430/tablet/zoom200%.                                                       |
| V40 | Aktualne pozytywne/negatywne testy, screenshots i niezależny UX review | PARTIAL — aktualne Chromium16/3, independent quality i UX render review PASS; independent interactive BLOCKED / connected manual NOT VERIFIED. |

Wynik niezależnego review to rzeczywisty PASS/FAIL/BLOCKED/NOT VERIFIED z dowodem i limitem
zakresu. Każdy materialny FAIL lub brak dowodu blokuje akceptację dotkniętej części. Jawna zgoda
na wykonanie implementacji nie zastępuje tej weryfikacji. Realny Engine/Git/provider i brakujące
production policies nie mogą uzyskać pozornego PASS z testów adaptera demo.
