import { useEffect, useRef, type ReactNode, type TouchEvent } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { REACTIONS, type DirectMessage } from "../../../shared/social";

/** How long a finger rests on a message before the menu opens. */
const HOLD_MS = 450;
/** How far a message is dragged to the left before letting go answers it. */
const SWIPE_PX = 48;

/**
 * One message in a private conversation.
 * Touch: hold for the menu, double tap for a ❤️, drag left to reply.
 * Mouse: right click or the small button for the menu, double click for a ❤️.
 */
export default function MessageBubble({
  message,
  name,
  time,
  canReact,
  canReply,
  flash,
  onReact,
  onReply,
  onJump,
  onMenu,
}: {
  message: DirectMessage;
  /** The other person's name, for the quoted message. */
  name: string;
  time: string;
  canReact: boolean;
  canReply: boolean;
  flash: boolean;
  onReact: (emoji: string) => void;
  onReply: () => void;
  onJump: (id: string) => void;
  onMenu: (rect: DOMRect) => void;
}) {
  const { t } = useTranslation();
  const row = useRef<HTMLDivElement>(null);
  const bubble = useRef<HTMLDivElement>(null);
  const arrow = useRef<HTMLSpanElement>(null);
  const touch = useRef({
    x: 0,
    y: 0,
    shift: 0,
    mode: "idle" as "idle" | "press" | "swipe" | "scroll" | "held",
    lastTap: 0,
    lastTouch: 0,
  });
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  const openMenu = () =>
    bubble.current && onMenu(bubble.current.getBoundingClientRect());

  function slide(shift: number, animate: boolean) {
    touch.current.shift = shift;
    if (row.current) {
      row.current.style.transition = animate
        ? "transform 0.2s ease-out"
        : "none";
      row.current.style.transform = shift ? `translateX(${shift}px)` : "";
    }
    if (arrow.current)
      arrow.current.style.opacity = String(Math.min(1, -shift / SWIPE_PX));
  }

  function onTouchStart(e: TouchEvent) {
    const point = e.touches[0];
    touch.current = {
      ...touch.current,
      x: point.clientX,
      y: point.clientY,
      shift: 0,
      mode: "press",
    };
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      touch.current.mode = "held";
      navigator.vibrate?.(8);
      openMenu();
    }, HOLD_MS);
  }
  function onTouchMove(e: TouchEvent) {
    const state = touch.current;
    const dx = e.touches[0].clientX - state.x;
    const dy = e.touches[0].clientY - state.y;
    if (state.mode === "press") {
      if (Math.abs(dy) > 10) state.mode = "scroll";
      else if (dx < -10 && canReply) state.mode = "swipe";
      else if (Math.abs(dx) > 10) state.mode = "scroll";
      if (state.mode !== "press") clearTimeout(timer.current);
    }
    if (state.mode === "swipe") slide(Math.max(-72, Math.min(0, dx)), false);
  }
  function onTouchEnd(e: TouchEvent) {
    const state = touch.current;
    clearTimeout(timer.current);
    const now = Date.now();
    if (state.mode === "swipe") {
      if (state.shift <= -SWIPE_PX) onReply();
      slide(0, true);
      e.preventDefault();
    } else if (state.mode === "held") {
      // Stops the click that would follow and close the menu at once.
      e.preventDefault();
    } else if (state.mode === "press" && canReact) {
      if (now - state.lastTap < 300) {
        onReact(REACTIONS[0]);
        state.lastTap = 0;
      } else state.lastTap = now;
    }
    state.lastTouch = now;
    state.mode = "idle";
  }
  const byMouse = () => Date.now() - touch.current.lastTouch > 800;

  // The same emoji from both is one chip with a 2.
  const chips = REACTIONS.filter((emoji) =>
    message.reactions.some((r) => r.emoji === emoji),
  ).map((emoji) => ({
    emoji,
    count: message.reactions.filter((r) => r.emoji === emoji).length,
    mine: message.reactions.some((r) => r.emoji === emoji && r.mine),
  }));
  const quote = message.replyTo;

  return (
    <div
      id={`m-${message.id}`}
      className={`bubble-in flex max-w-[86%] flex-col gap-1 ${message.mine ? "items-end self-end" : "items-start self-start"}`}
    >
      <div className="relative max-w-full">
        <span
          ref={arrow}
          aria-hidden="true"
          className="pointer-events-none absolute right-1 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-card text-base font-extrabold text-coral-ink opacity-0 shadow-sm"
        >
          ↩
        </span>
        <div
          ref={row}
          className={`group relative flex items-center gap-1.5 ${message.mine ? "flex-row-reverse" : ""}`}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          onTouchCancel={() => {
            clearTimeout(timer.current);
            slide(0, true);
            touch.current.mode = "idle";
          }}
          onContextMenu={(e) => {
            e.preventDefault();
            if (byMouse()) openMenu();
          }}
          onDoubleClick={() => byMouse() && canReact && onReact(REACTIONS[0])}
        >
          <div
            ref={bubble}
            className={`msg-touch min-w-0 break-words rounded-3xl px-4 py-2.5 text-base font-semibold leading-snug ${flash ? "msg-flash" : ""} ${
              message.mine
                ? "rounded-br-md bg-coral text-white"
                : "rounded-bl-md bg-card shadow-[0_3px_0_0_rgb(var(--shade)/0.06)]"
            }`}
          >
            {quote && (
              <button
                type="button"
                onClick={() => onJump(quote.id)}
                className={`mb-1.5 flex w-full min-w-0 flex-col rounded-xl border-l-[3px] px-2.5 py-1 text-left text-sm leading-snug ${message.mine ? "border-white/80 bg-white/20" : "border-coral bg-coral/10"}`}
              >
                <span
                  className={`text-xs font-extrabold ${message.mine ? "text-white" : "text-coral-ink"}`}
                >
                  {quote.mine ? t("social.chat.you") : name}
                </span>
                <span
                  className={`line-clamp-2 font-semibold ${message.mine ? "text-white/85" : "text-ink/60"} ${quote.text ? "" : "italic"}`}
                >
                  {quote.text || t("social.chat.quoteGone")}
                </span>
              </button>
            )}
            <p className="whitespace-pre-line">{message.text}</p>
          </div>
          <button
            type="button"
            onClick={openMenu}
            aria-label={t("social.chat.react")}
            className="hidden h-8 w-8 shrink-0 items-center justify-center rounded-full bg-card text-sm text-ink/50 opacity-0 shadow-sm transition-opacity hover:text-ink focus-visible:opacity-100 group-hover:opacity-100 [@media(hover:hover)]:flex"
          >
            ☺
          </button>
        </div>
      </div>
      {chips.length > 0 && (
        <div
          className={`relative z-10 -mt-2.5 flex gap-1 ${message.mine ? "pr-2" : "pl-2"}`}
        >
          {chips.map((chip) => (
            <button
              key={chip.emoji}
              type="button"
              disabled={!canReact}
              onClick={() => onReact(chip.emoji)}
              aria-label={t("social.chat.reactWith", { emoji: chip.emoji })}
              aria-pressed={chip.mine}
              className={`pop-in flex h-7 items-center gap-1 rounded-full px-2 text-sm leading-none shadow-sm ring-2 ring-inset active:scale-95 bg-card ${chip.mine ? "ring-coral" : "ring-ink/10"}`}
            >
              <span>{chip.emoji}</span>
              {chip.count > 1 && (
                <span className="text-xs font-extrabold text-ink/60">
                  {chip.count}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
      {message.better && (
        <p className="select-text rounded-2xl bg-good-soft px-3 py-2 text-sm font-semibold leading-snug text-good-ink">
          <span className="font-extrabold">✍️ {t("social.chat.better")}</span>{" "}
          {message.better}
        </p>
      )}
      <span className="px-1 text-[11px] font-bold text-ink/35">{time}</span>
    </div>
  );
}

/** The menu over a message: a row of emoji, then Reply and Copy. Placed next to the bubble it belongs to. */
export function MessageMenu({
  rect,
  mine,
  current,
  canReact,
  canReply,
  onReact,
  onReply,
  onCopy,
  onClose,
}: {
  rect: DOMRect;
  mine: boolean;
  /** The viewer's emoji on this message, if any. */
  current: string | null;
  canReact: boolean;
  canReply: boolean;
  onReact: (emoji: string) => void;
  onReply: () => void;
  onCopy: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const height = (canReact ? 60 : 0) + (canReply ? 48 : 0) + 48;
  const below = rect.bottom + 8 + height < window.innerHeight - 12;
  const top = below ? rect.bottom + 8 : Math.max(12, rect.top - 8 - height);
  const side = mine
    ? { right: Math.max(12, window.innerWidth - rect.right) }
    : { left: Math.max(12, Math.min(rect.left, window.innerWidth - 304)) };
  const action = (label: string, icon: ReactNode, run: () => void) => (
    <button
      type="button"
      onClick={() => {
        run();
        onClose();
      }}
      className="flex min-h-12 w-full items-center justify-between gap-6 px-4 text-left text-base font-bold text-ink active:bg-ink/5 [@media(hover:hover)]:hover:bg-ink/5"
    >
      {label}
      <span className="text-lg text-ink/45" aria-hidden="true">
        {icon}
      </span>
    </button>
  );

  return createPortal(
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true">
      <button
        type="button"
        aria-label={t("social.back")}
        onClick={onClose}
        className="absolute inset-0 h-full w-full cursor-default bg-black/20"
      />
      <div
        className={`menu-pop absolute flex flex-col gap-2 ${mine ? "items-end" : "items-start"}`}
        style={{
          top,
          ...side,
          transformOrigin: `${below ? "top" : "bottom"} ${mine ? "right" : "left"}`,
        }}
      >
        {canReact && (
          <div className="flex gap-0.5 rounded-full bg-card p-1.5 shadow-[0_8px_30px_rgb(0_0_0/0.22)]">
            {REACTIONS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => {
                  onReact(emoji);
                  onClose();
                }}
                aria-label={t("social.chat.reactWith", { emoji })}
                aria-pressed={current === emoji}
                className={`flex h-10 w-10 items-center justify-center rounded-full text-2xl leading-none transition-transform active:scale-90 [@media(hover:hover)]:hover:scale-125 ${current === emoji ? "bg-coral/15 ring-2 ring-inset ring-coral" : ""}`}
              >
                {emoji}
              </button>
            ))}
          </div>
        )}
        <div className="min-w-44 divide-y divide-ink/8 overflow-hidden rounded-2xl bg-card shadow-[0_8px_30px_rgb(0_0_0/0.22)]">
          {canReply && action(t("social.chat.reply"), "↩", onReply)}
          {action(t("social.chat.copy"), "⧉", onCopy)}
        </div>
      </div>
    </div>,
    document.body,
  );
}
