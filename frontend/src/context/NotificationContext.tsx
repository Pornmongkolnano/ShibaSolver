"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";

interface NotificationContextType {
  isOpen: boolean;
  toggle: () => void;
  open: () => void;
  close: () => void;
}

const NotificationContext = createContext<NotificationContextType | null>(null);

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const toggle = useCallback(() => setIsOpen(v => !v), []);
  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);
  const value = useMemo(
    () => ({
      isOpen,
      toggle,
      open,
      close,
    }),
    [close, isOpen, open, toggle]
  );

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotification() {
    const ctx = useContext(NotificationContext);
    if (!ctx) throw new Error("useNotification must be inside NotificationProvider");
    return ctx;
}
