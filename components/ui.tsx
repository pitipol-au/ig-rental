// components/ui.tsx
//
// Every shared piece of the dashboard, in ONE file.
//
// ─────────────────────────────────────────────────────────────
// WHY ONE FILE AND NOT components/ui/card.tsx, ui/tile.tsx, ...
//
// The usual answer is one component per file. On this project the
// thing that has actually gone wrong, repeatedly, is a file not making
// it into the repo — proxy.ts, lib/auth.ts, LogoutButton.tsx. Eleven
// tiny files is eleven chances for that. One file is one.
//
// These are all server components. None of them takes a callback or
// holds state, so nothing here needs 'use client' — which matters,
// because a client component drags everything it imports into the
// browser bundle.
// ─────────────────────────────────────────────────────────────

import { C, R, SEVERITY, type Severity } from '../app/dashboard/theme';

/* ═══════════════════════════════════════════════════════════
   Surfaces
   ═══════════════════════════════════════════════════════════ */

/**
 * A card. Deliberately NOT the wrapper for everything.
 *
 * Border, fill and radius all say "this is a separate object". Stamp
 * them on every block and nothing looks separate any more — which is
 * what the old pages did. Lists of rows share one card; a headline
 * figure gets its own; plain text gets none.
 */
export function Card({
  children,
  pad = true,
  tone = 'plain',
  className = '',
}: {
  children: React.ReactNode;
  pad?: boolean;
  tone?: 'plain' | 'urgent' | 'accent';
  className?: string;
}) {
  const bg =
    tone === 'urgent' ? C.urgentTint : tone === 'accent' ? C.accentSoft : C.surface;
  const border = tone === 'urgent' ? C.urgentLine : C.line;

  return (
    <div
      className={`${pad ? 'p-4' : ''} ${className}`}
      style={{
        background: bg,
        border: `1px solid ${border}`,
        borderRadius: R.card,
      }}
    >
      {children}
    </div>
  );
}

/** A titled block of page. The caption is optional and usually earns
 *  its place — it is where "what this number means" goes. */
export function Section({
  title,
  caption,
  action,
  children,
}: {
  title?: string;
  caption?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      {(title || action) && (
        <div className="flex items-baseline justify-between gap-4">
          {title && (
            <h2
              className="text-[13px] font-bold uppercase"
              style={{ color: C.ink3, letterSpacing: '0.07em' }}
            >
              {title}
            </h2>
          )}
          {action}
        </div>
      )}
      {caption && (
        <p className="-mt-1 text-[13px] leading-relaxed" style={{ color: C.ink2 }}>
          {caption}
        </p>
      )}
      {children}
    </section>
  );
}

/* ═══════════════════════════════════════════════════════════
   Figures
   ═══════════════════════════════════════════════════════════ */

/**
 * The one number the screen leads with. Exactly one per page.
 *
 * Proportional figures, not tabular: at 40px, tabular-nums gives
 * every digit the width of a zero and "2,715" reads loose and
 * mechanical. Tabular is for columns, further down.
 */
export function Hero({
  label,
  value,
  unit,
  sub,
}: {
  label: string;
  value: string | number;
  unit?: string;
  sub?: string;
}) {
  return (
    <div>
      <p className="text-[13px]" style={{ color: C.ink2 }}>
        {label}
      </p>
      <p
        className="mt-0.5 text-[40px] font-bold leading-none"
        style={{ letterSpacing: '-0.02em' }}
      >
        {typeof value === 'number' ? value.toLocaleString('th-TH') : value}
        {unit && (
          <span className="ml-1.5 text-base font-medium" style={{ color: C.ink2 }}>
            {unit}
          </span>
        )}
      </p>
      {sub && (
        <p className="mt-1 text-[13px]" style={{ color: C.ink2 }}>
          {sub}
        </p>
      )}
    </div>
  );
}

/** Small supporting count. Two per row on a phone. */
export function Tile({
  label,
  value,
  note,
}: {
  label: string;
  value: string | number;
  note?: string;
}) {
  return (
    <Card>
      <p className="text-[12.5px]" style={{ color: C.ink2 }}>
        {label}
      </p>
      <p className="mt-0.5 text-2xl font-bold leading-none tabular-nums">
        {typeof value === 'number' ? value.toLocaleString('th-TH') : value}
      </p>
      {note && (
        <p className="mt-1.5 text-[11.5px] leading-snug" style={{ color: C.ink3 }}>
          {note}
        </p>
      )}
    </Card>
  );
}

/* ═══════════════════════════════════════════════════════════
   Rows
   ═══════════════════════════════════════════════════════════ */

/**
 * A tappable row in a list. The whole row is the hit target, at 56px
 * minimum height — a thumb on a phone is about 45px across, and a
 * seller is using this standing up.
 */
export function Row({
  href,
  title,
  detail,
  meta,
  right,
  severity,
  first = false,
  external = false,
}: {
  href?: string;
  /** Opens in a new tab. For links that leave the dashboard — an
   *  Instagram post, say — so the owner does not lose their place. */
  external?: boolean;
  title: React.ReactNode;
  detail?: React.ReactNode;
  meta?: React.ReactNode;
  right?: React.ReactNode;
  severity?: Severity;
  /** Suppresses the top border so rows stack cleanly inside one card. */
  first?: boolean;
}) {
  const sev = severity ? SEVERITY[severity] : null;

  const inner = (
    <div
      className="flex min-h-[56px] items-start gap-3 px-4 py-3.5"
      style={{
        borderTop: first ? 'none' : `1px solid ${C.line}`,
        background: sev ? sev.tint : undefined,
      }}
    >
      {sev && (
        <>
          <span
            aria-hidden="true"
            className="mt-[7px] h-2.5 w-2.5 flex-none rounded-full"
            style={{ background: sev.dot }}
          />
          {/* The word, for anyone the colour does not reach. */}
          <span className="sr-only">{sev.word}</span>
        </>
      )}

      <div className="min-w-0 flex-1">
        <p className="text-[14.5px] font-semibold leading-snug">{title}</p>
        {detail && (
          <p className="mt-0.5 text-[13px] leading-snug" style={{ color: C.ink2 }}>
            {detail}
          </p>
        )}
        {meta && (
          <p className="mt-1 text-[12px] leading-snug" style={{ color: C.ink3 }}>
            {meta}
          </p>
        )}
      </div>

      {right && <div className="flex-none pl-1 text-right">{right}</div>}

      {href && (
        <span aria-hidden="true" className="flex-none pl-1 text-lg leading-none" style={{ color: C.ink3 }}>
          ›
        </span>
      )}
    </div>
  );

  if (!href) return inner;
  return (
    <a
      href={href}
      target={external ? '_blank' : undefined}
      rel={external ? 'noreferrer' : undefined}
      className="block active:opacity-60"
    >
      {inner}
    </a>
  );
}

/** Rows, grouped in one card so the list reads as one object. */
export function RowList({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="overflow-hidden"
      style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: R.card }}
    >
      {children}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   Labels
   ═══════════════════════════════════════════════════════════ */

export function Pill({
  children,
  tone = 'quiet',
}: {
  children: React.ReactNode;
  tone?: 'quiet' | 'accent' | 'urgent' | 'warn';
}) {
  const map = {
    quiet: { bg: C.ground, fg: C.ink2 },
    accent: { bg: C.accentSoft, fg: C.accent },
    urgent: { bg: C.urgentTint, fg: C.urgent },
    warn: { bg: C.warnTint, fg: C.warn },
  }[tone];

  return (
    <span
      className="inline-block whitespace-nowrap px-2 py-0.5 text-[11.5px] font-semibold"
      style={{ background: map.bg, color: map.fg, borderRadius: R.pill }}
    >
      {children}
    </span>
  );
}

/** A ranked bar. One hue: length carries the magnitude, the label
 *  carries the identity. Colouring each row differently would imply
 *  the colours meant something. */
export function Bar({
  label,
  value,
  max,
}: {
  label: string;
  value: number;
  max: number;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-4">
        <span className="text-[13.5px]">{label}</span>
        <span className="text-[13.5px] font-semibold tabular-nums">{value}</span>
      </div>
      <div
        className="mt-1.5 h-1.5 w-full overflow-hidden"
        style={{ background: C.line, borderRadius: 2 }}
        role="img"
        aria-label={`${label} ${value}`}
      >
        <div
          className="h-full"
          style={{
            width: `${Math.max((value / Math.max(max, 1)) * 100, 2)}%`,
            background: C.accent,
            borderRadius: '0 3px 3px 0',
          }}
        />
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   Nothing here
   ═══════════════════════════════════════════════════════════ */

/**
 * An empty state says what will appear and, where it helps, what to
 * do to make it appear. "ไม่มีข้อมูล" tells the owner nothing and
 * looks like a fault.
 */
export function Empty({
  title,
  hint,
  action,
}: {
  title: string;
  hint?: string;
  action?: React.ReactNode;
}) {
  return (
    <div
      className="flex flex-col items-center gap-2 px-6 py-10 text-center"
      style={{ background: C.surface, border: `1px dashed ${C.line}`, borderRadius: R.card }}
    >
      <p className="text-[14.5px] font-semibold">{title}</p>
      {hint && (
        <p className="max-w-[34ch] text-[13px] leading-relaxed" style={{ color: C.ink2 }}>
          {hint}
        </p>
      )}
      {action}
    </div>
  );
}

/** All clear. Distinct from Empty: nothing is missing, there is simply
 *  nothing to do, which is good news and should read as good news. */
export function AllClear({ children }: { children: React.ReactNode }) {
  return (
    <Card tone="accent">
      <p className="text-[14px] font-semibold" style={{ color: C.accent }}>
        ✓ {children}
      </p>
    </Card>
  );
}

/* ═══════════════════════════════════════════════════════════
   Buttons
   ═══════════════════════════════════════════════════════════ */

export function LinkButton({
  href,
  children,
  variant = 'secondary',
  external = false,
}: {
  href: string;
  children: React.ReactNode;
  variant?: 'primary' | 'secondary';
  external?: boolean;
}) {
  const primary = variant === 'primary';
  return (
    <a
      href={href}
      target={external ? '_blank' : undefined}
      rel={external ? 'noreferrer' : undefined}
      className="inline-flex min-h-[44px] items-center justify-center px-5 text-[14.5px] font-semibold active:opacity-70"
      style={{
        background: primary ? C.accent : C.surface,
        color: primary ? '#FFFFFF' : C.ink,
        border: `1px solid ${primary ? C.accent : C.line}`,
        borderRadius: R.chip,
      }}
    >
      {children}
    </a>
  );
}

/** Formats a baht amount the way a Thai seller writes it. */
export function baht(n: number): string {
  return n.toLocaleString('th-TH');
}

/* ═══════════════════════════════════════════════════════════
   Time

   Rendered on the server, in the shop's timezone. Doing this in the
   browser instead would show the time of whatever device is looking,
   so a seller checking from a hotel abroad would see their own
   orders timestamped wrong.
   ═══════════════════════════════════════════════════════════ */

const TZ = process.env.SHOP_TIMEZONE ?? 'Asia/Bangkok';

const CLOCK = new Intl.DateTimeFormat('th-TH', {
  timeZone: TZ,
  hour: '2-digit',
  minute: '2-digit',
});

const DATE_SHORT = new Intl.DateTimeFormat('th-TH', {
  timeZone: TZ,
  day: 'numeric',
  month: 'short',
});

const DAY_KEY = new Intl.DateTimeFormat('en-CA', {
  timeZone: TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** "18:42" for today, "12 ก.ย." for anything older. */
export function whenLabel(at: Date | string): string {
  const d = typeof at === 'string' ? new Date(at) : at;
  if (Number.isNaN(d.getTime())) return '';
  return DAY_KEY.format(d) === DAY_KEY.format(new Date())
    ? CLOCK.format(d)
    : DATE_SHORT.format(d);
}

/** "3 วัน" — how long something has been sitting. Rounded down, so it
 *  never overstates how late the shop is. */
export function ageInDays(at: Date | string): number {
  const d = typeof at === 'string' ? new Date(at) : at;
  return Math.floor((Date.now() - d.getTime()) / 86400000);
}
