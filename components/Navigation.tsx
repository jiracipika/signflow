"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  ["/live", "Sign"], ["/practice", "Practice"], ["/library", "Library"],
  ["/teach", "Teach"], ["/avatar", "Avatar"], ["/settings", "Settings"],
];

export default function Navigation() {
  const pathname = usePathname();
  return (
    <nav className="topnav" aria-label="Main navigation">
      <Link className="brand" href="/" aria-label="SignFlow home">
        <span className="brand-mark" aria-hidden="true">sƒ</span> SignFlow
      </Link>
      <div className="nav-links">
        {links.map(([href, label]) => (
          <Link key={href} href={href} aria-current={pathname === href ? "page" : undefined}>
            {label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
