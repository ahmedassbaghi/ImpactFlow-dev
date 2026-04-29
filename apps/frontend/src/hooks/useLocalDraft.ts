import { useEffect, useState } from "react";

export function useLocalDraft<T>(key: string, initialValue: T) {
  const [value, setValue] = useState<T>(() => {
    const raw = localStorage.getItem(key);
    if (!raw) return initialValue;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return initialValue;
    }
  });

  useEffect(() => {
    localStorage.setItem(key, JSON.stringify(value));
  }, [key, value]);

  const clear = () => {
    localStorage.removeItem(key);
    setValue(initialValue);
  };

  return [value, setValue, clear] as const;
}
