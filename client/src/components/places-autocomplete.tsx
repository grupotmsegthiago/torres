import { useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";

declare global {
  interface Window {
    google: any;
    _gmapsLoading?: boolean;
  }
}

function loadGoogleMapsScript() {
  if (window.google?.maps?.places || window._gmapsLoading) return;
  const key = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
  if (!key) return;
  window._gmapsLoading = true;
  const s = document.createElement("script");
  s.src = `https://maps.googleapis.com/maps/api/js?key=${key}&libraries=places&loading=async`;
  s.async = true;
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
  const inputRef = useRef<HTMLInputElement>(null);
  const autocompleteRef = useRef<any>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    loadGoogleMapsScript();
  }, []);

  useEffect(() => {
    if (autocompleteRef.current || !inputRef.current) return;

    function init() {
      if (!window.google?.maps?.places || !inputRef.current || autocompleteRef.current) return;

      autocompleteRef.current = new window.google.maps.places.Autocomplete(inputRef.current, {
        types: ["(cities)"],
        componentRestrictions: { country: "br" },
        fields: ["formatted_address", "name"],
      });

      autocompleteRef.current.addListener("place_changed", () => {
        const place = autocompleteRef.current.getPlace();
        if (place?.formatted_address) {
          onChangeRef.current(place.formatted_address);
        } else if (place?.name) {
          onChangeRef.current(place.name);
        }
      });
    }

    if (window.google?.maps?.places) {
      init();
    } else {
      const interval = setInterval(() => {
        if (window.google?.maps?.places) {
          clearInterval(interval);
          init();
        }
      }, 200);
      return () => clearInterval(interval);
    }
  }, []);

  return (
    <Input
      ref={inputRef}
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={className}
      aria-label={props["aria-label"]}
      data-testid={props["data-testid"]}
    />
  );
}
