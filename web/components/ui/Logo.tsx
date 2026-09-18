import Image from "next/image";
import Link from "next/link";

export default function Logo({
  width = 168,
  href = "/",
  className = "",
}: {
  width?: number;
  href?: string | null;
  className?: string;
}) {
  const mark = (
    <Image
      src="/brand/logo-lockup.png"
      alt="+58Express"
      width={width}
      height={Math.round((width * 536) / 2019)}
      priority
      className="h-auto w-full"
    />
  );

  if (!href) {
    return (
      <span className={className} style={{ width }}>
        {mark}
      </span>
    );
  }

  return (
    <Link
      href={href}
      aria-label="+58Express — inicio"
      className={`block shrink-0 transition-opacity duration-150 hover:opacity-80 ${className}`}
      style={{ width }}
    >
      {mark}
    </Link>
  );
}
