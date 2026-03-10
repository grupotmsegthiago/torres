import { useEffect, useRef } from "react";

declare global {
  interface Window {
    google: any;
    _gmapsLoading?: boolean;
    _gmapsLoaded?: boolean;
    _gmapsCallbacks?: (() => void)[];
  }
}

function loadGoogleMapsScript(callback: () => void) {
  if (window._gmapsLoaded) {
    callback();
    return;
  }

  if (!window._gmapsCallbacks) {
    window._gmapsCallbacks = [];
  }
  window._gmapsCallbacks.push(callback);

  if (window._gmapsLoading) return;

  const key = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
  if (!key) return;

  window._gmapsLoading = true;
  const s = document.createElement("script");
  s.src = `https://maps.googleapis.com/maps/api/js?key=${key}&libraries=places&loading=async`;
  s.async = true;
  s.onload = () => {
    window._gmapsLoaded = true;
    window._gmapsCallbacks?.forEach((cb) => cb());
    window._gmapsCallbacks = [];
  };
  document.head.appendChild(s);
}

interface PlacesAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  id?: string;
  "aria-label"?: string;
  "data-testid"?: string;
}

export function PlacesAutocomplete({
  value,
  onChange,
  placeholder,
  className,
  id,
  ...props
}: PlacesAutocompleteProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const onChangeRef = useRef(onChange);
  const initializedRef = useRef(false);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (initializedRef.current || !containerRef.current) return;

    loadGoogleMapsScript(() => {
      if (initializedRef.current || !containerRef.current) return;
      if (!window.google?.maps?.places?.PlaceAutocompleteElement) return;

      initializedRef.current = true;

      const autocomplete = new window.google.maps.places.PlaceAutocompleteElement({
        includedRegionCodes: ["br"],
        includedPrimaryTypes: ["locality", "administrative_area_level_2"],
      });

      autocomplete.id = id || "";
      autocomplete.setAttribute("data-testid", props["data-testid"] || "");
      if (placeholder) {
        autocomplete.setAttribute("placeholder", placeholder);
      }

      containerRef.current.appendChild(autocomplete);

      autocomplete.addEventListener("gmp-placeselect", async (event: any) => {
        const place = event.place;
        if (place) {
          await place.fetchFields({ fields: ["displayName", "formattedAddress"] });
          const text = place.formattedAddress || place.displayName || "";
          onChangeRef.current(text);
        }
      });
    });
  }, [id]);

  return (
    <div
      ref={containerRef}
      className={`places-autocomplete-wrapper ${className || ""}`}
      data-testid={props["data-testid"]}
    />
  );
}
