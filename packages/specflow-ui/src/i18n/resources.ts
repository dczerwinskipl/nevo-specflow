export const resources = {
  en: {
    translation: {
      common: {
        changeLanguage: 'Change language',
        language: 'Language',
        english: 'English',
        polish: 'Polski',
        retry: 'Retry',
        retrying: 'Retrying…',
      },
      navigation: {
        product: 'Product navigation',
        home: 'Home',
        uiPlayground: 'UI Playground',
        close: 'Close navigation',
        title: 'Application navigation',
        open: 'Open navigation',
        back: 'Back',
        closeSecondary: 'Close secondary content',
      },
      account: {
        localIdentity: 'Local identity',
        signedIn: 'Signed in',
        localAccess: 'Local access',
        openMenu: 'Open user menu for {{name}}',
        signOut: 'Sign out',
      },
      auth: {
        loadingSignIn: 'Loading sign in',
        login: {
          title: 'Welcome back',
          description: 'Access your SpecFlow workspace.',
          failed: 'Sign in failed',
          openingProvider: 'Opening {{provider}}…',
          continueWithProvider: 'Continue with {{provider}}',
          or: 'or',
          username: 'Username',
          password: 'Password',
          signingIn: 'Signing in…',
          signIn: 'Sign in',
        },
        errors: {
          invalidCredentials: 'Username or password is incorrect.',
          rateLimited: 'Too many sign-in attempts. Try again later.',
          identityNotAllowed: 'This identity is not allowed to access this SpecFlow project.',
          invalidOidcTransaction: 'The sign-in request expired or is no longer valid. Start again.',
          oidcAuthenticationFailed:
            'The identity provider could not complete sign in. Try again.',
          providerUnavailable: 'The identity provider is currently unavailable. Try again later.',
          serviceUnavailable: 'SpecFlow could not complete sign in. Try again.',
        },
        runtimeUnavailable: {
          title: 'Unable to connect',
          description:
            'SpecFlow Runtime did not respond. Make sure it is running and reachable, then try again.',
        },
      },
      home: {
        title: 'Home',
        description: 'The product frontend boundary is ready for real SpecFlow features.',
        foundationTitle: 'Migration foundation',
        foundationDescription:
          'Routing, the application shell, Nevo branding, and reusable Nevo UI are composed here without placeholder domain data.',
      },
      playground: {
        title: 'UI Playground',
        description:
          'A neutral product-owned surface for checking Nevo UI composition inside the real app.',
        exampleValue: 'Example value',
        continue: 'Continue',
      },
    },
  },
  pl: {
    translation: {
      common: {
        changeLanguage: 'Zmień język',
        language: 'Język',
        english: 'English',
        polish: 'Polski',
        retry: 'Spróbuj ponownie',
        retrying: 'Ponawianie…',
      },
      navigation: {
        product: 'Nawigacja produktu',
        home: 'Strona główna',
        uiPlayground: 'UI Playground',
        close: 'Zamknij nawigację',
        title: 'Nawigacja aplikacji',
        open: 'Otwórz nawigację',
        back: 'Wstecz',
        closeSecondary: 'Zamknij panel dodatkowy',
      },
      account: {
        localIdentity: 'Tożsamość lokalna',
        signedIn: 'Zalogowany',
        localAccess: 'Dostęp lokalny',
        openMenu: 'Otwórz menu użytkownika {{name}}',
        signOut: 'Wyloguj się',
      },
      auth: {
        loadingSignIn: 'Ładowanie logowania',
        login: {
          title: 'Witaj ponownie',
          description: 'Przejdź do obszaru roboczego SpecFlow.',
          failed: 'Logowanie nie powiodło się',
          openingProvider: 'Otwieranie {{provider}}…',
          continueWithProvider: 'Kontynuuj przez {{provider}}',
          or: 'lub',
          username: 'Nazwa użytkownika',
          password: 'Hasło',
          signingIn: 'Logowanie…',
          signIn: 'Zaloguj się',
        },
        errors: {
          invalidCredentials: 'Nazwa użytkownika lub hasło są nieprawidłowe.',
          rateLimited: 'Zbyt wiele prób logowania. Spróbuj ponownie później.',
          identityNotAllowed: 'Ta tożsamość nie ma dostępu do tego projektu SpecFlow.',
          invalidOidcTransaction:
            'Żądanie logowania wygasło lub jest już nieprawidłowe. Rozpocznij ponownie.',
          oidcAuthenticationFailed:
            'Dostawca tożsamości nie mógł zakończyć logowania. Spróbuj ponownie.',
          providerUnavailable:
            'Dostawca tożsamości jest obecnie niedostępny. Spróbuj ponownie później.',
          serviceUnavailable: 'SpecFlow nie mógł zakończyć logowania. Spróbuj ponownie.',
        },
        runtimeUnavailable: {
          title: 'Nie można się połączyć',
          description:
            'SpecFlow Runtime nie odpowiada. Upewnij się, że działa i jest osiągalny, a następnie spróbuj ponownie.',
        },
      },
      home: {
        title: 'Strona główna',
        description: 'Warstwa frontendowa jest gotowa na właściwe funkcje SpecFlow.',
        foundationTitle: 'Podstawa migracji',
        foundationDescription:
          'Routing, powłoka aplikacji, branding Nevo i współdzielone Nevo UI są tutaj połączone bez zastępczych danych domenowych.',
      },
      playground: {
        title: 'UI Playground',
        description:
          'Neutralny ekran produktu do sprawdzania kompozycji Nevo UI we właściwej aplikacji.',
        exampleValue: 'Przykładowa wartość',
        continue: 'Kontynuuj',
      },
    },
  },
} as const;
