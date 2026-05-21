import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import * as Location from "expo-location";
import { getSavedLocations, setSavedLocations, type SavedLocation } from "../lib/storage";
import { fetchSavedAddresses, getActiveAddress, setActiveAddress } from "../lib/api";

export type UiLocation = {
  title: string; // e.g. "Delivery to Home"
  subtitle: string; // e.g. "Sector 5, HSR Layout, Bangalore"
  coords?: { latitude: number; longitude: number };
  status: "idle" | "loading" | "ready" | "denied" | "error";
};

type Ctx = {
  location: UiLocation;
  saved: SavedLocation[];
  refresh: () => Promise<void>;
  selectSaved: (id: string) => Promise<void>;
  saveCurrentAs: (label: string) => Promise<void>;
};

const C = createContext<Ctx | null>(null);

async function formatAddress(coords: { latitude: number; longitude: number }) {
  try {
    const res = await Location.reverseGeocodeAsync(coords);
    const a = res?.[0];
    if (!a) return "Current location";
    const parts = [
      a.street || a.name,
      a.district || a.subregion,
      a.city || a.region,
    ].filter(Boolean);
    return parts.join(", ");
  } catch {
    return "Current location";
  }
}

export function LocationProvider({ children }: { children: React.ReactNode }) {
  const [location, setLocation] = useState<UiLocation>({
    title: "Delivery to Home",
    subtitle: "Fetching location…",
    status: "idle"
  });
  const [saved, setSaved] = useState<SavedLocation[]>([]);

  useEffect(() => {
    (async () => {
      const local = await getSavedLocations();
      try {
        const remote = await fetchSavedAddresses();
        // Prefer remote first; keep local (coords-based) after.
        const merged = [...remote, ...local].slice(0, 20);
        setSaved(merged);

        // Sync initial header with server active address if available.
        try {
          const { addressId } = await getActiveAddress();
          if (addressId) {
            const match = merged.find((x) => x.addressId === addressId) ?? merged.find((x) => x.id === addressId);
            if (match) {
              setLocation({
                title: match.label,
                subtitle: match.subtitle,
                coords:
                  typeof match.latitude === "number" && typeof match.longitude === "number"
                    ? { latitude: match.latitude, longitude: match.longitude }
                    : undefined,
                status: "ready"
              });
            }
          }
        } catch {
          // ignore
        }
      } catch {
        setSaved(local);
      }
    })();
  }, []);

  const refresh = async () => {
    setLocation((l) => ({ ...l, status: "loading", subtitle: "Fetching location…" }));
    const perm = await Location.requestForegroundPermissionsAsync();
    if (perm.status !== "granted") {
      setLocation({
        title: "Delivery to Home",
        subtitle: "Location permission denied",
        status: "denied"
      });
      return;
    }
    try {
      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced
      });
      const coords = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
      const subtitle = await formatAddress(coords);
      setLocation({
        title: "Delivery to Home",
        subtitle,
        coords,
        status: "ready"
      });
    } catch {
      setLocation({
        title: "Delivery to Home",
        subtitle: "Unable to fetch location",
        status: "error"
      });
    }
  };

  const selectSaved = async (id: string) => {
    const item = saved.find((s) => s.id === id);
    if (!item) return;
    // If this saved item maps to an MCP addressId, persist it as active on backend.
    if (item.addressId) {
      try {
        await setActiveAddress(item.addressId);
      } catch {
        // ignore
      }
    }
    setLocation({
      title: item.label,
      subtitle: item.subtitle,
      coords:
        typeof item.latitude === "number" && typeof item.longitude === "number"
          ? { latitude: item.latitude, longitude: item.longitude }
          : undefined,
      status: "ready"
    });
  };

  const saveCurrentAs = async (label: string) => {
    if (!location.coords) return;
    const list = await getSavedLocations();
    const next: SavedLocation = {
      id: `${Date.now()}`,
      label,
      subtitle: location.subtitle,
      latitude: location.coords.latitude,
      longitude: location.coords.longitude
    };
    const merged = [next, ...list].slice(0, 10);
    await setSavedLocations(merged);
    setSaved(merged);
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const value = useMemo(() => ({ location, saved, refresh, selectSaved, saveCurrentAs }), [location, saved]);
  return <C.Provider value={value}>{children}</C.Provider>;
}

export function useUiLocation() {
  const v = useContext(C);
  if (!v) throw new Error("useUiLocation must be used inside LocationProvider");
  return v;
}

