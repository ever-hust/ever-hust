"use client";

import { useEffect, useMemo, useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@ever-hust/ui/avatar";

interface UserAvatarProps {
  name?: string | null;
  email?: string | null;
  /** OAuth provider photo (BetterAuth `user.image`). */
  image?: string | null;
  /** Uploaded / stored photo (`users.photo_url`). */
  photoUrl?: string | null;
  className?: string;
  fallbackClassName?: string;
}

function initialsOf(name?: string | null): string {
  const n = (name ?? "").trim();
  if (!n) return "?";
  return n
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Avatar that resolves the user's photo from the best available source and
 * degrades gracefully — never shows a broken image:
 *   OAuth provider photo → uploaded photo → Gravatar (by email) → initials.
 *
 * LinkedIn/OAuth CDN URLs can expire; when the current source fails to load we
 * advance to the next candidate. Gravatar uses `d=404` so a missing Gravatar
 * also falls through to the initials fallback.
 */
export function UserAvatar({
  name,
  email,
  image,
  photoUrl,
  className,
  fallbackClassName,
}: UserAvatarProps) {
  const [gravatar, setGravatar] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const normalized = email?.trim().toLowerCase();
    if (!normalized) {
      setGravatar(null);
      return;
    }
    sha256Hex(normalized)
      .then((hash) => {
        if (active) setGravatar(`https://www.gravatar.com/avatar/${hash}?s=160&d=404`);
      })
      .catch(() => {
        /* SubtleCrypto unavailable → skip Gravatar */
      });
    return () => {
      active = false;
    };
  }, [email]);

  const candidates = useMemo(
    () => [image, photoUrl, gravatar].filter((u): u is string => Boolean(u && u.trim())),
    [image, photoUrl, gravatar],
  );

  const [failed, setFailed] = useState<Set<string>>(() => new Set());
  const src = candidates.find((u) => !failed.has(u));

  return (
    <Avatar className={className}>
      {src ? (
        <AvatarImage
          key={src}
          src={src}
          alt={name ?? "User"}
          onLoadingStatusChange={(status) => {
            if (status === "error") {
              setFailed((prev) => (prev.has(src) ? prev : new Set(prev).add(src)));
            }
          }}
        />
      ) : null}
      <AvatarFallback className={fallbackClassName}>{initialsOf(name)}</AvatarFallback>
    </Avatar>
  );
}
