import Link from "next/link";

export const homeSectionHeadingClass =
  "font-display text-[clamp(3rem,6.2vw,6.75rem)] font-semibold leading-[0.92] tracking-[-0.035em]";

type HomeSectionCtaProps = {
  className?: string;
  href?: string;
  label?: string;
};

export default function HomeSectionCta({
  className = "",
  href,
  label,
}: HomeSectionCtaProps) {
  if (!href || !label) return null;

  return (
    <Link
      className={`group inline-flex items-center gap-5 text-xs font-semibold uppercase tracking-[0.24em] text-[var(--accent)] transition-colors duration-500 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white/45 ${className}`}
      href={href}
    >
      <span>{label}</span>
      <span
        aria-hidden="true"
        className="h-px w-16 origin-left bg-current opacity-60 transition-[transform,opacity] duration-500 ease-out group-hover:scale-x-110 group-hover:opacity-90 motion-reduce:transform-none"
      />
    </Link>
  );
}
