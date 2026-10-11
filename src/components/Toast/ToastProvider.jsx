"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import gsap from "gsap";

import { useLocale } from "@/i18n/LocaleProvider";

import "./Toast.css";

const DEFAULT_DURATION = 6000;
const MAX_VISIBLE = 4;
const CLIP_SHOWN = "polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%)";
const CLIP_BELOW = "polygon(0% 100%, 100% 100%, 100% 100%, 0% 100%)";
const CLIP_ABOVE = "polygon(0% 0%, 100% 0%, 100% 0%, 0% 0%)";

const ToastContext = createContext(null);

let nextToastId = 0;

/* toast({ eyebrow, title, message, tone: "default" | "error", duration })
   duration 0 keeps the toast until it is closed */
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const dismiss = useCallback(
    (id) =>
      setToasts((prev) =>
        prev.map((item) => (item.id === id ? { ...item, leaving: true } : item)),
      ),
    [],
  );

  const remove = useCallback(
    (id) => setToasts((prev) => prev.filter((item) => item.id !== id)),
    [],
  );

  const toast = useCallback((options) => {
    nextToastId += 1;
    const id = nextToastId;
    setToasts((prev) => {
      const next = [
        ...prev,
        { duration: DEFAULT_DURATION, tone: "default", ...options, id },
      ];
      /* past the limit, the oldest ones make room */
      const staying = next.filter((item) => !item.leaving);
      const overflow = new Set(
        staying.slice(0, Math.max(0, staying.length - MAX_VISIBLE)).map(
          (item) => item.id,
        ),
      );
      return next.map((item) =>
        overflow.has(item.id) ? { ...item, leaving: true } : item,
      );
    });
    return id;
  }, []);

  const value = useMemo(() => ({ toast, dismiss }), [toast, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <Toaster toasts={toasts} onDismiss={dismiss} onRemove={remove} />
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast must be used within ToastProvider");
  return context;
}

function Toaster({ toasts, onDismiss, onRemove }) {
  const { dict } = useLocale();

  return (
    <div className="toaster" aria-live="polite">
      {toasts.map((item) => (
        <ToastItem
          key={item.id}
          item={item}
          closeLabel={dict.toast.close}
          onDismiss={onDismiss}
          onRemove={onRemove}
        />
      ))}
    </div>
  );
}

function ToastItem({ item, closeLabel, onDismiss, onRemove }) {
  const toastRef = useRef(null);
  const progressRef = useRef(null);
  const pausedRef = useRef(false);

  /* rises in with the same masked reveal as the menus */
  useEffect(() => {
    const node = toastRef.current;
    gsap.fromTo(
      node,
      { clipPath: CLIP_BELOW, y: 32 },
      { clipPath: CLIP_SHOWN, y: 0, duration: 0.9, ease: "power4.out" },
    );
    gsap.fromTo(
      node.querySelectorAll(".toast-reveal"),
      { y: "130%" },
      { y: "0%", duration: 0.9, delay: 0.12, stagger: 0.06, ease: "power3.out" },
    );
  }, []);

  /* counts down only while seen: hovering pauses it, and animation frames
     already stop while the tab is in the background */
  useEffect(() => {
    if (item.leaving || !item.duration) return;
    let elapsed = 0;
    let last = performance.now();
    let frame = requestAnimationFrame(function tick(now) {
      if (!pausedRef.current) elapsed += Math.min(now - last, 100);
      last = now;
      const remaining = Math.max(0, 1 - elapsed / item.duration);
      if (progressRef.current) {
        progressRef.current.style.transform = `scaleX(${remaining})`;
      }
      if (remaining === 0) onDismiss(item.id);
      else frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  }, [item.leaving, item.duration, item.id, onDismiss]);

  /* wipes up, then folds its space away so the stack settles smoothly */
  useEffect(() => {
    if (!item.leaving) return;
    const node = toastRef.current;
    gsap.killTweensOf(node);
    gsap
      .timeline({ onComplete: () => onRemove(item.id) })
      .to(node, { clipPath: CLIP_ABOVE, y: -16, duration: 0.5, ease: "power3.in" })
      .to(node, {
        height: 0,
        marginTop: 0,
        paddingTop: 0,
        paddingBottom: 0,
        duration: 0.35,
        ease: "power2.inOut",
      });
  }, [item.leaving, item.id, onRemove]);

  const pause = () => {
    pausedRef.current = true;
  };
  const resume = () => {
    pausedRef.current = false;
  };

  return (
    <div
      ref={toastRef}
      className={`toast ${item.tone === "error" ? "is-error" : ""}`}
      role={item.tone === "error" ? "alert" : "status"}
      onMouseEnter={pause}
      onMouseLeave={resume}
      onFocus={pause}
      onBlur={resume}
    >
      <div className="toast-top">
        {item.eyebrow && (
          <div className="toast-mask">
            <p className="mono toast-eyebrow toast-reveal">
              <span className="toast-dot" aria-hidden="true" />
              {item.eyebrow}
            </p>
          </div>
        )}
        <button
          type="button"
          className="toast-close hover-line"
          onClick={() => onDismiss(item.id)}
        >
          {closeLabel}
        </button>
      </div>
      {item.title && (
        <div className="toast-mask">
          <p className="toast-title toast-reveal">{item.title}</p>
        </div>
      )}
      {item.message && (
        <div className="toast-mask">
          <p className="sm toast-message toast-reveal">{item.message}</p>
        </div>
      )}
      {item.duration > 0 && (
        <span className="toast-progress" ref={progressRef} aria-hidden="true" />
      )}
    </div>
  );
}
