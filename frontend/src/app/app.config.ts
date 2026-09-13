import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideHttpClient, withFetch } from '@angular/common/http';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    // withFetch() puts HttpClient on the native fetch API instead of the
    // legacy XMLHttpRequest transport. This is the recommended setup.
    provideHttpClient(withFetch()),
  ],
};
