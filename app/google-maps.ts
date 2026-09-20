export type MapsNamespace = {
  importLibrary(name: string): Promise<Record<string, unknown>>;
};

declare global {
  interface Window {
    google?: { maps?: MapsNamespace };
    __kondoGoogleMapsPromise?: Promise<MapsNamespace>;
  }
}

export function loadGoogleMaps(apiKey: string) {
  if (window.google?.maps?.importLibrary) return Promise.resolve(window.google.maps);
  if (window.__kondoGoogleMapsPromise) return window.__kondoGoogleMapsPromise;

  window.__kondoGoogleMapsPromise = new Promise<MapsNamespace>((resolve, reject) => {
    const callback = "__kondoGoogleMapsLoaded";
    const callbackTarget = window as unknown as Record<string, unknown>;
    const script = document.createElement("script");
    const params = new URLSearchParams({
      key: apiKey,
      v: "weekly",
      loading: "async",
      callback,
    });

    callbackTarget[callback] = () => {
      delete callbackTarget[callback];
      const maps = window.google?.maps;
      if (maps?.importLibrary) resolve(maps);
      else reject(new Error("Google Maps loaded without its library API."));
    };
    script.async = true;
    script.dataset.kondoGoogleMaps = "true";
    script.src = `https://maps.googleapis.com/maps/api/js?${params}`;
    script.onerror = () => {
      delete callbackTarget[callback];
      window.__kondoGoogleMapsPromise = undefined;
      reject(new Error("Google Maps could not be loaded."));
    };
    document.head.appendChild(script);
  });

  return window.__kondoGoogleMapsPromise;
}
