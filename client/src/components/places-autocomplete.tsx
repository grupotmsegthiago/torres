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
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [apiReady, setApiReady] = useState(false);
  const sessionTokenRef = useRef<any>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadGoogleMapsScript(() => setApiReady(true));
  }, []);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const fetchSuggestions = useCallback(async (input: string) => {
    if (!input || input.length < 2 || !apiReady) {
      setSuggestions([]);
      return;
    }

    try {
      if (!sessionTokenRef.current) {
        sessionTokenRef.current = new window.google.maps.places.AutocompleteSessionToken();
      }

      const { AutocompleteSuggestion } = window.google.maps.places;
      const response = await AutocompleteSuggestion.fetchAutocompleteSuggestions({
        input,
        sessionToken: sessionTokenRef.current,
        includedRegionCodes: ["br"],
        includedPrimaryTypes: ["locality", "administrative_area_level_2"],
        language: "pt-BR",
      });

      const items: Suggestion[] = (response.suggestions || []).map((s: any) => ({
        placeId: s.placePrediction?.placeId || "",
        text: s.placePrediction?.text?.text || "",
        mainText: s.placePrediction?.mainText?.text || "",
        secondaryText: s.placePrediction?.secondaryText?.text || "",
      }));

      setSuggestions(items);
      setShowDropdown(items.length > 0);
    } catch {
      setSuggestions([]);
    }
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
    sessionTokenRef.current = null;
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
        <div className="absolute z-50 w-full mt-1 rounded-lg border border-white/10 bg-[#171717] shadow-xl overflow-hidden" data-testid="dropdown-suggestions">
          {suggestions.map((s, i) => (
            <button
              key={s.placeId || i}
              type="button"
              className="w-full text-left px-3 py-2.5 flex items-center gap-2.5 hover:bg-white/[0.08] transition-colors border-t border-white/5 first:border-t-0"
              onClick={() => handleSelect(s)}
              data-testid={`suggestion-item-${i}`}
            >
              <MapPin className="w-3.5 h-3.5 text-white/30 shrink-0" />
              <div className="min-w-0">
                <span className="text-sm text-white font-medium">{s.mainText}</span>
                {s.secondaryText && (
                  <span className="text-sm text-white/40 ml-1">{s.secondaryText}</span>
                )}
              </div>
            </button>
          ))}
          <div className="px-3 py-1.5 text-[10px] text-white/20 text-right">
            Powered by Google
          </div>
        </div>
      )}
    </div>
  );
}
