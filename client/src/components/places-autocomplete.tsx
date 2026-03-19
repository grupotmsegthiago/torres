import { useEffect, useRef, useState, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { MapPin } from "lucide-react";

declare global {
  interface Window {
    google: any;
    _gmapsLoading?: boolean;
    _gmapsLoaded?: boolean;
    _gmapsCallbacks?: (() => void)[];
  }
}

function loadGoogleMapsScript(callback: () => void) {
  if (window._gmapsLoaded && window.google?.maps?.places) {
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
    const check = () => {
      if (window.google?.maps?.places) {
        window._gmapsLoaded = true;
        window._gmapsCallbacks?.forEach((cb) => cb());
        window._gmapsCallbacks = [];
      } else {
        setTimeout(check, 100);
      }
    };
    check();
  };
  document.head.appendChild(s);
}

interface Suggestion {
  placeId: string;
  text: string;
  mainText: string;
  secondaryText: string;
}

interface PlacesAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  id?: string;
  theme?: "dark" | "light";
  "aria-label"?: string;
  "data-testid"?: string;
}

export function PlacesAutocomplete({
  value,
  onChange,
  placeholder,
  className,
  id,
  theme = "dark",
  ...props
}: PlacesAutocompleteProps) {
  const isLight = theme === "light";
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [apiReady, setApiReady] = useState(false);
  const autocompleteServiceRef = useRef<any>(null);
  const sessionTokenRef = useRef<any>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadGoogleMapsScript(() => setApiReady(true));
  }, []);

  useEffect(() => {
    if (apiReady && window.google?.maps?.places) {
      autocompleteServiceRef.current = new window.google.maps.places.AutocompleteService();
      sessionTokenRef.current = new window.google.maps.places.AutocompleteSessionToken();
    }
  }, [apiReady]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const fetchSuggestions = useCallback((input: string) => {
    if (!input || input.length < 2 || !apiReady || !autocompleteServiceRef.current) {
      setSuggestions([]);
      return;
    }

    autocompleteServiceRef.current.getPlacePredictions(
      {
        input,
        sessionToken: sessionTokenRef.current,
        componentRestrictions: { country: "br" },
        language: "pt-BR",
      },
      (predictions: any[] | null, status: string) => {
        if (status === window.google.maps.places.PlacesServiceStatus.OK && predictions) {
          const items: Suggestion[] = predictions.map((p) => ({
            placeId: p.place_id,
            text: p.description,
            mainText: p.structured_formatting?.main_text || p.description,
            secondaryText: p.structured_formatting?.secondary_text || "",
          }));
          setSuggestions(items);
          setShowDropdown(items.length > 0);
        } else {
          setSuggestions([]);
        }
      }
    );
  }, [apiReady]);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    onChange(val);

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchSuggestions(val), 300);
  }, [onChange, fetchSuggestions]);

  const handleSelect = useCallback((suggestion: Suggestion) => {
    onChange(suggestion.text);
    setSuggestions([]);
    setShowDropdown(false);
    sessionTokenRef.current = new window.google.maps.places.AutocompleteSessionToken();
  }, [onChange]);

  return (
    <div ref={wrapperRef} className="relative w-full">
      <Input
        id={id}
        value={value}
        onChange={handleInputChange}
        onFocus={() => { if (suggestions.length > 0) setShowDropdown(true); }}
        placeholder={placeholder}
        className={className}
        aria-label={props["aria-label"]}
        data-testid={props["data-testid"]}
        autoComplete="off"
      />
      {showDropdown && suggestions.length > 0 && (
        <div className={`absolute z-50 w-full mt-1 rounded-lg border shadow-xl overflow-hidden ${isLight ? "bg-white border-neutral-200" : "bg-[#171717] border-white/10"}`} data-testid="dropdown-suggestions">
          {suggestions.map((s, i) => (
            <button
              key={s.placeId || i}
              type="button"
              className={`w-full text-left px-3 py-2.5 flex items-center gap-2.5 transition-colors first:border-t-0 ${isLight ? "hover:bg-neutral-50 border-t border-neutral-100" : "hover:bg-white/[0.08] border-t border-white/5"}`}
              onClick={() => handleSelect(s)}
              data-testid={`suggestion-item-${i}`}
            >
              <MapPin className={`w-3.5 h-3.5 shrink-0 ${isLight ? "text-neutral-400" : "text-white/30"}`} />
              <div className="min-w-0">
                <span className={`text-sm font-medium ${isLight ? "text-neutral-900" : "text-white"}`}>{s.mainText}</span>
                {s.secondaryText && (
                  <span className={`text-sm ml-1 ${isLight ? "text-neutral-400" : "text-white/40"}`}>{s.secondaryText}</span>
                )}
              </div>
            </button>
          ))}
          <div className={`px-3 py-1.5 text-[10px] text-right ${isLight ? "text-neutral-300" : "text-white/20"}`}>
            Powered by Google
          </div>
        </div>
      )}
    </div>
  );
}

export interface RouteInfo {
  distanceText: string;
  durationText: string;
  distanceMeters: number;
  durationSeconds: number;
}

export function calculateRouteInfo(origin: string, destination: string): Promise<RouteInfo | null> {
  return new Promise((resolve) => {
    if (!origin || !destination || !window.google?.maps) {
      resolve(null);
      return;
    }

    const service = new window.google.maps.DistanceMatrixService();
    service.getDistanceMatrix(
      {
        origins: [origin],
        destinations: [destination],
        travelMode: window.google.maps.TravelMode.DRIVING,
        unitSystem: window.google.maps.UnitSystem.METRIC,
      },
      (response: any, status: string) => {
        if (status === "OK" && response?.rows?.[0]?.elements?.[0]?.status === "OK") {
          const el = response.rows[0].elements[0];
          resolve({
            distanceText: el.distance.text,
            durationText: el.duration.text,
            distanceMeters: el.distance.value,
            durationSeconds: el.duration.value,
          });
        } else {
          resolve(null);
        }
      }
    );
  });
}
