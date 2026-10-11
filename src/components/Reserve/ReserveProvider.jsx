"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";

/* sessionStorage survives page changes, locale switches and reloads,
   but is cleared when the tab/site is closed */
const STORAGE_KEY = "pizza-piatto:reservation";

export const INITIAL_FORM = {
  name: "",
  email: "",
  phone: "",
  date: "",
  time: "",
  guests: 2,
  notes: "",
};

const INITIAL_STATE = {
  form: INITIAL_FORM,
  showErrors: false,
  submitted: false,
  /* the booking as the server saved it: { reservation, emails } */
  confirmation: null,
};

const ReserveContext = createContext(null);

function readStoredState() {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const stored = JSON.parse(raw);
    const confirmation = stored.confirmation?.reservation
      ? stored.confirmation
      : null;
    return {
      ...INITIAL_STATE,
      ...stored,
      form: { ...INITIAL_FORM, ...stored.form },
      /* a thank-you screen needs the saved booking behind it */
      submitted: Boolean(stored.submitted && confirmation),
      confirmation,
    };
  } catch {
    return null;
  }
}

export function ReserveProvider({ children }) {
  const [isOpen, setIsOpen] = useState(false);
  const [state, setState] = useState(INITIAL_STATE);
  const hasHydrated = useRef(false);

  /* restore after mount so server and client markup match */
  useEffect(() => {
    const stored = readStoredState();
    if (stored) setState(stored);
    hasHydrated.current = true;
  }, []);

  useEffect(() => {
    if (!hasHydrated.current) return;
    try {
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      /* storage unavailable: state still lives in memory */
    }
  }, [state]);

  const setField = (field, value) =>
    setState((prev) => ({ ...prev, form: { ...prev.form, [field]: value } }));

  const value = {
    isOpen,
    open: () => setIsOpen(true),
    close: () => setIsOpen(false),
    form: state.form,
    showErrors: state.showErrors,
    submitted: state.submitted,
    confirmation: state.confirmation,
    setField,
    setShowErrors: (showErrors) =>
      setState((prev) => ({ ...prev, showErrors })),
    confirm: (confirmation) =>
      setState((prev) => ({
        ...prev,
        showErrors: false,
        submitted: true,
        confirmation,
      })),
    /* a fresh form for the next booking, keeping who is booking */
    startAnother: () =>
      setState((prev) => ({
        ...INITIAL_STATE,
        form: {
          ...INITIAL_FORM,
          name: prev.form.name,
          email: prev.form.email,
          phone: prev.form.phone,
        },
      })),
  };

  return (
    <ReserveContext.Provider value={value}>{children}</ReserveContext.Provider>
  );
}

export function useReserve() {
  const context = useContext(ReserveContext);
  if (!context) throw new Error("useReserve must be used within ReserveProvider");
  return context;
}

/* onClick handler for any trigger: keeps a real href as no-JS fallback */
export function useReserveTrigger() {
  const { open } = useReserve();
  return (e) => {
    e?.preventDefault();
    open();
  };
}
