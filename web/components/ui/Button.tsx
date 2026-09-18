import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

type Variant = "signal" | "outline" | "quiet";
type Size = "md" | "lg";

const base =
  "inline-flex items-center justify-center gap-2.5 rounded-full font-bold leading-none " +
  "transition-[background-color,border-color,color,transform] duration-150 ease-out " +
  "active:translate-y-px disabled:pointer-events-none disabled:opacity-45";

const variants: Record<Variant, string> = {
  // El amarillo es la única acción primaria de la página.
  signal:
    "bg-signal text-ink-900 hover:bg-signal-bright",
  outline:
    "border border-white/22 text-paper hover:border-white/45 hover:bg-white/[0.06]",
  quiet:
    "text-paper-dim hover:text-paper",
};

const sizes: Record<Size, string> = {
  // 48px y 56px de alto: cómodos para el pulgar.
  md: "h-12 px-6 text-[15px]",
  lg: "h-14 px-8 text-base",
};

type ButtonProps = {
  variant?: Variant;
  size?: Size;
  children: ReactNode;
  className?: string;
};

export function Button({
  variant = "signal",
  size = "md",
  className = "",
  children,
  ...rest
}: ButtonProps & ComponentProps<"button">) {
  return (
    <button
      className={`${base} ${variants[variant]} ${sizes[size]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

export function ButtonLink({
  variant = "signal",
  size = "md",
  className = "",
  children,
  href,
  ...rest
}: ButtonProps & ComponentProps<typeof Link>) {
  return (
    <Link
      href={href}
      className={`${base} ${variants[variant]} ${sizes[size]} ${className}`}
      {...rest}
    >
      {children}
    </Link>
  );
}
