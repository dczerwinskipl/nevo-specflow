/**
 * Synthetic, clearly demo-only Markdown for the seeded `admission` Specification. These documents
 * deliberately stress the renderer (long document, tables, code, task lists, nested lists, YAML
 * frontmatter). They carry no product meaning.
 */

export const showcaseSpecificationContent = `# Deterministyczna admisja zadań i granice wykonania

> Treść demonstracyjna (syntetyczna). Dokument służy do sprawdzania, jak renderer Markdown radzi sobie z długimi i złożonymi treściami; nie opisuje prawdziwego produktu.

Ten dokument opisuje **deterministyczną admisję zadań**: zasady, według których system decyduje, czy dane zadanie może zostać przyjęte do wykonania, oraz granice, w których agent może działać po jego przyjęciu. Całość jest celowo rozbudowana, aby sprawdzić _długie akapity_, listy, tabele, cytaty i bloki kodu na wąskich i szerokich ekranach.

## 1. Cel i zakres

Celem jest zapewnienie, że **to samo wejście zawsze prowadzi do tej samej decyzji**, niezależnie od kolejności zdarzeń, obciążenia systemu czy wyboru dostawcy modelu. Decyzja o admisji jest czystą funkcją zadeklarowanego zadania, bieżącej specyfikacji i konfiguracji granic wykonania. Nie zależy od czasu zegara, losowości ani stanu zewnętrznych usług, a każdy czynnik, który mógłby ją zmienić, jest jawnie zapisany w danych wejściowych i zapisywany razem z wynikiem, dzięki czemu każdą decyzję można później odtworzyć i wyjaśnić osobie, która o nią zapyta.

### 1.1 Zakres obowiązywania

Zasady dotyczą wszystkich zadań tworzonych w ramach specyfikacji, w tym zadań generowanych automatycznie z kryteriów akceptacji oraz zadań dodawanych ręcznie przez członków zespołu. Obejmują także zadania uruchamiane ponownie po awarii, o ile ich wejście nie zostało zmienione.

#### 1.1.1 Co jest poza zakresem

- Wycena kosztów wykonania zadania.
- Wybór modelu językowego i jego parametrów (opisany w osobnej specyfikacji).
- Interfejs użytkownika do przeglądania decyzji admisji.

##### Uwaga o nagłówkach niższego poziomu

Nagłówek piątego poziomu służy tu wyłącznie do sprawdzenia, że renderer nie gubi hierarchii przy głębokim zagnieżdżeniu.

### 1.2 Słownik pojęć

| Pojęcie | Znaczenie |
| :-- | :-- |
| Zadanie | Jednostka pracy z jednoznacznym opisem i kryteriami akceptacji. |
| Admisja | Decyzja o przyjęciu lub odrzuceniu zadania przed rozpoczęciem pracy. |
| Granica wykonania | Zbiór ograniczeń (zasoby, katalogi, czas), których agent nie może przekroczyć. |
| Profil agenta | Nazwana rola z własnym zestawem uprawnień i instrukcji. |

## 2. Zasady admisji

Poniższe zasady są stosowane w podanej kolejności. Pierwsza zasada, która odrzuca zadanie, kończy ocenę, a jej identyfikator trafia do uzasadnienia decyzji.

1. **Kompletność opisu** — zadanie ma tytuł, opis oraz co najmniej jedno kryterium akceptacji.
2. **Zgodność ze specyfikacją** — zadanie wynika z wymagania zapisanego w bieżącej wersji specyfikacji.
   1. Zadanie wskazuje identyfikator wymagania.
   2. Wskazane wymaganie nie jest oznaczone jako wycofane.
      - Wymaganie wycofane można przywrócić tylko decyzją właściciela specyfikacji.
      - Przywrócenie tworzy nową wersję specyfikacji.
   3. Opis zadania nie jest sprzeczny z żadnym innym przyjętym zadaniem.
3. **Dostępność zasobów** — wszystkie zasoby wskazane w granicach wykonania istnieją i są dostępne.
4. **Limity** — liczba równolegle przyjętych zadań nie przekracza limitu profilu agenta.

### 2.1 Lista kontrolna przed przyjęciem

- [x] Opis zadania jest kompletny
- [x] Kryteria akceptacji są sprawdzalne maszynowo lub przez recenzenta
- [ ] Zidentyfikowano zależności od innych zadań
- [ ] Granice wykonania zostały przejrzane przez właściciela
  - [x] Katalogi robocze
  - [ ] Dozwolone polecenia
  - [ ] Limity czasu i pamięci

### 2.2 Kolejność oceny w praktyce

Wyobraźmy sobie zadanie, które ma bardzo długi tytuł i jednocześnie wskazuje wycofane wymaganie oraz brakujący zasób. System zgłosi **wyłącznie pierwszą** napotkaną przyczynę odrzucenia, ponieważ kolejność ocen jest częścią kontraktu. Dzięki temu dwa uruchomienia tego samego wejścia nie mogą zakończyć się różnymi uzasadnieniami, nawet jeśli problemów jest więcej niż jeden.

---

## 3. Granice wykonania

Granica wykonania jest zapisem deklaratywnym. Agent nie negocjuje jej w trakcie pracy; może jedynie zgłosić potrzebę jej rozszerzenia, co kończy bieżące wykonanie i wymaga nowej admisji.

### 3.1 Przykładowa konfiguracja

\`\`\`yaml
boundary:
  profile: implementer
  workingDirectories:
    - packages/specflow-runtime
    - packages/specflow-ui
  allowedCommands: [pnpm, git, node]
  limits:
    wallClockMinutes: 45
    memoryMegabytes: 4096
\`\`\`

### 3.2 Pseudokod decyzji

\`\`\`ts
export function admit(task: Task, spec: Specification, boundary: Boundary): Decision {
  for (const rule of ADMISSION_RULES) {
    const verdict = rule.evaluate({ task, spec, boundary });
    if (verdict.kind === 'reject') return { admitted: false, ruleId: rule.id, reason: verdict.reason };
  }
  return { admitted: true, ruleId: null, reason: 'all rules passed' };
}
\`\`\`

Bardzo długa pojedyncza linia (sprawdza przewijanie poziome, a nie łamanie bloku kodu):

\`\`\`text
DECISION_LOG_ENTRY=admission:v3:task=TASK-0042:spec=admission:revision=demo-document-1:rule=boundary-resources:verdict=reject:reason=working directory packages/specflow-runtime/src/features/specs/demo/creation-endpoints.ts is outside every declared boundary and cannot be created on demand
\`\`\`

Blok bez znacznika języka:

\`\`\`
$ pnpm --filter @nevo/specflow-runtime test
> vitest run
 ✓ admission decides deterministically (12 ms)
 ✓ admission explains the first failing rule (9 ms)
\`\`\`

Kod w linii, na przykład \`admit(task, spec, boundary)\`, oraz odwołanie do pliku \`packages/specflow-runtime/src/features/specs/demo/creation-state.ts\` powinny być czytelne i nie rozpychać strony.

## 4. Tabele

### 4.1 Szeroka tabela z długimi komórkami

| Identyfikator | Reguła | Wejście | Wynik przy powodzeniu | Wynik przy odrzuceniu | Uzasadnienie dla użytkownika | Właściciel | Ostatnia zmiana | Uwagi |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| R-001 | Kompletność opisu | Tytuł, opis, kryteria | Zadanie przechodzi dalej | Zadanie wraca do autora z listą braków | Uzupełnij brakujące pola opisu zadania przed ponownym zgłoszeniem | Zespół platformy | 2026-03-02 | Reguła nie ocenia jakości języka, wyłącznie obecność pól. |
| R-002 | Zgodność ze specyfikacją | Identyfikator wymagania, bieżąca wersja specyfikacji | Zadanie przechodzi dalej | Zadanie odrzucone z odwołaniem do wersji specyfikacji | Wskazane wymaganie nie istnieje w bieżącej wersji specyfikacji lub zostało wycofane | Zespół produktu | 2026-03-09 | Porównanie wersji odbywa się po stabilnym identyfikatorze, nigdy po tytule. |
| R-003 | Dostępność zasobów | Granica wykonania, lista zasobów | Zasoby zarezerwowane | Zadanie odrzucone z listą niedostępnych zasobów | Co najmniej jeden zasób z granicy wykonania jest niedostępny: https://example.invalid/zasoby/bardzo/dlugi/adres/ktory/nie/ma/spacji | Zespół infrastruktury | 2026-03-17 | Długi adres sprawdza zawijanie bez spacji. |
| R-004 | Limity równoległości | Liczba aktywnych zadań profilu | Zadanie przyjęte do kolejki | Zadanie czeka na zwolnienie miejsca | Profil osiągnął limit równoległych zadań; zadanie zostanie przyjęte automatycznie, gdy miejsce się zwolni | Zespół platformy | 2026-04-01 | Czekanie nie jest odrzuceniem. |

### 4.2 Wąska tabela z wyrównaniem

| Lewa | Środek | Prawa |
| :--- | :---: | ---: |
| a | b | 1 |
| długi tekst | śr. | 1 250,00 |
| ~~stare~~ | **nowe** | 7 |

### 4.3 Tabela wewnątrz listy

1. Pierwszy krok procedury:

   | Krok | Czas |
   | --- | ---: |
   | Przyjęcie | 1 s |
   | Weryfikacja | 4 s |

2. Drugi krok z kodem \`verify()\` i dalszym tekstem, który zawija się bez problemu nawet wtedy, gdy zdanie jest naprawdę długie i zajmuje kilka linii na wąskim ekranie telefonu.

## 5. Formatowanie w tekście

Ten akapit zawiera **pogrubienie**, _kursywę_, ***pogrubioną kursywę***, ~~przekreślenie~~, \`kod w linii\`, [zwykły odnośnik](https://example.invalid/dokumentacja), odnośnik z tytułem [z podpowiedzią](https://example.invalid/tytul "Tytuł odnośnika") oraz goły adres https://example.invalid/bardzo/dlugi/adres/bez/spacji/ktory/powinien/sie/zawijac/zamiast/rozpychac/strone/poziomo/aby-nie-bylo-przewijania. Zawiera też długie słowo: Nieprzepraszającyzbytsiebiezupełniebezsensowniedługisłowoużytedotestowania.

Drugi akapit ma twarde złamanie linii  
w środku zdania oraz zwykłe zakończenie.

> Cytat jednopoziomowy: decyzja musi być powtarzalna.
>
> > Cytat zagnieżdżony: powtarzalność jest ważniejsza niż szybkość.
>
> Po cytacie zagnieżdżonym wraca cytat zewnętrzny z \`kodem\` i **pogrubieniem**.

### 5.1 Listy zagnieżdżone

- Poziom pierwszy
  - Poziom drugi
    - Poziom trzeci
      - Poziom czwarty z bardzo długim tekstem, który musi się zawinąć w obrębie własnego wcięcia bez wychodzenia poza kolumnę treści
- Kolejna pozycja z akapitem

  Akapit wewnątrz pozycji listy, oddzielony pustą linią.

- Pozycja z blokiem kodu:

  \`\`\`bash
  pnpm turbo run build --filter=@nevo/specflow-runtime...
  \`\`\`

1. Lista numerowana
   - z punktorami w środku
   - i drugim punktorem
2. Druga pozycja
   1. podpunkt
   2. kolejny podpunkt

### 5.2 Zadania do wykonania

- [x] Opisać zasady admisji
- [x] Opisać granice wykonania
- [ ] Dodać scenariusze błędów
- [ ] Zaplanować migrację istniejących zadań
  - [x] Inwentaryzacja
  - [ ] Plan wdrożenia

## 6. Kryteria akceptacji

1. Decyzja admisji jest odtwarzalna: to samo wejście daje ten sam wynik i to samo uzasadnienie.
2. Każde odrzucenie wskazuje identyfikator pierwszej niespełnionej reguły.
3. Zmiana kolejności reguł wymaga nowej wersji specyfikacji.
4. Granice wykonania są zapisane deklaratywnie i widoczne dla recenzenta.
5. Agent nie może rozszerzyć granicy w trakcie wykonania.

## 7. Ryzyka i otwarte pytania

Ryzyka są omawiane w osobnych dokumentach. Poniżej krótka lista pytań, na które zespół nie ma jeszcze odpowiedzi.

- Czy limit równoległości powinien być liczony na profil, czy na użytkownika?
- Jak długo przechowywać zapis decyzji admisji?
- Czy decyzje odrzucające powinny mieć osobny kanał powiadomień?

---

### Załącznik A. Dłuższy akapit

Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed non risus. Suspendisse lectus tortor, dignissim sit amet, adipiscing nec, ultricies sed, dolor. Cras elementum ultrices diam. Maecenas ligula massa, varius a, semper congue, euismod non, mi. Proin porttitor, orci nec nonummy molestie, enim est eleifend mi, non fermentum diam nisl sit amet erat. Duis semper. Duis arcu massa, scelerisque vitae, consequat in, pretium a, enim. Pellentesque congue. Ut in risus volutpat libero pharetra tempor. Cras vestibulum bibendum augue. Praesent egestas leo in pede. Praesent blandit odio eu enim. Pellentesque sed dui ut augue blandit sodales.

Vestibulum ante ipsum primis in faucibus orci luctus et ultrices posuere cubilia Curae; Aliquam nibh. Mauris ac mauris sed pede pellentesque fermentum. Maecenas adipiscing ante non diam sodales hendrerit. Ut velit mauris, egestas sed, gravida nec, ornare ut, mi. Aenean ut orci vel massa suscipit pulvinar. Nulla sollicitudin. Fusce varius, ligula non tempus aliquam, nunc turpis ullamcorper nibh, in tempus sapien eros vitae ligula.

### Załącznik B. Zakończenie

Koniec dokumentu demonstracyjnego.
`;

export const showcaseAdrContent = `# ADR-001 · Deterministyczna admisja zadań i granice wykonania agentów

> Treść demonstracyjna (syntetyczna). Zapis decyzji służy do sprawdzenia renderowania; nie opisuje prawdziwego produktu.

## Status

Przyjęta · 2026-03-12 · Właściciel decyzji: zespół platformy

## Kontekst

Zadania trafiają do agentów z wielu źródeł: z kryteriów akceptacji, z ręcznych zgłoszeń oraz z ponownych uruchomień po awarii. Dotychczas decyzja o tym, czy zadanie może ruszyć, zależała od chwilowego obciążenia i kolejności zdarzeń, więc dwa identyczne zgłoszenia mogły zakończyć się różnie, a zespół nie potrafił odtworzyć, dlaczego dane zadanie zostało odrzucone. Potrzebujemy mechanizmu, który jest **powtarzalny**, **wyjaśnialny** i **niezależny od dostawcy modelu**.

## Rozważane opcje

| Opcja | Powtarzalność | Wyjaśnialność | Koszt wdrożenia | Ryzyko | Ocena |
| --- | :---: | :---: | ---: | --- | --- |
| A. Decyzja w trakcie wykonania przez agenta | niska | niska | niski | Agent może rozszerzyć własne uprawnienia | odrzucona |
| B. Ręczna akceptacja każdego zadania | wysoka | wysoka | wysoki | Wąskie gardło po stronie ludzi | odrzucona |
| C. Deterministyczna admisja przed wykonaniem z deklaratywną granicą wykonania | wysoka | wysoka | średni | Konieczność utrzymania reguł | **przyjęta** |

## Decyzja

Wprowadzamy **deterministyczną admisję zadań** jako osobny krok przed rozpoczęciem pracy. Decyzja jest czystą funkcją trzech danych wejściowych: zadania, bieżącej wersji specyfikacji i konfiguracji granicy wykonania. Zasady:

1. Reguły są oceniane w stałej kolejności, a pierwsza odrzucająca kończy ocenę.
2. Każdy wynik zawiera identyfikator reguły i uzasadnienie przeznaczone dla użytkownika.
3. Granica wykonania jest zapisem deklaratywnym i nie podlega negocjacji w trakcie pracy agenta.
4. Rozszerzenie granicy kończy bieżące wykonanie i wymaga nowej admisji.

Przykładowy zapis decyzji:

\`\`\`json
{
  "taskId": "TASK-0042",
  "specRevision": "demo-document-1",
  "admitted": false,
  "ruleId": "boundary-resources",
  "reason": "Katalog roboczy poza zadeklarowaną granicą wykonania"
}
\`\`\`

## Konsekwencje

### Pozytywne

- Dwa identyczne zgłoszenia zawsze kończą się tą samą decyzją.
- Każde odrzucenie można odtworzyć i wyjaśnić na podstawie zapisu.
- Dostawca modelu nie wpływa na decyzję admisji.
  - Zmiana dostawcy nie wymaga zmiany reguł.
  - Testy reguł nie wymagają dostępu do żadnego modelu.

### Negatywne

- Reguły trzeba utrzymywać razem ze specyfikacją.
- Zadania na granicy limitów mogą dłużej czekać w kolejce.
- Zmiana kolejności reguł jest zmianą kontraktu i wymaga nowej wersji specyfikacji.

### Do obserwowania

- [ ] Liczba odrzuceń z powodu limitów równoległości
- [ ] Czas oczekiwania zadań w kolejce
- [x] Zgodność zapisów decyzji z odtworzeniem

## Odwołania

- Specyfikacja admisji: \`specification.md\`
- Kontekst systemu: \`architektura/kontekst-systemu.md\`
- Porównanie dostawców: \`badania/porownanie-dostawcow.md\`
`;

export const showcaseFrontmatterContent = `---
title: Ocena ryzyka admisji
status: roboczy
owner: zespół platformy
tags: [admisja, ryzyko, demo]
reviewers:
  - Anna
  - Bartek
revision: 3
approved: false
summary: Bardzo długa wartość, która musi się zawinąć w bloku właściwości zamiast rozpychać stronę na wąskim ekranie, nawet gdy nie ma w niej żadnej spacji dostatecznie blisko krawędzi.
---

# Ocena ryzyka admisji

> Treść demonstracyjna (syntetyczna). Dokument ma blok YAML na samym początku pliku.

Powyższy blok między liniami \`---\` jest widoczny w trybie edycji jako zwykły tekst. W podglądzie jest zwinięty do sekcji właściwości nad treścią.

## Ryzyka

| Ryzyko | Prawdopodobieństwo | Wpływ |
| --- | :---: | :---: |
| Zbyt rygorystyczne reguły | średnie | średni |
| Brak zasobów w granicy | niskie | wysoki |

- Reguły są przeglądane co kwartał.
- Odrzucenia są monitorowane.
`;
