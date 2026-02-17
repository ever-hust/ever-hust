"use client";

import { useState, useCallback } from "react";
import { Button } from "@repo/ui/button";
import { Heart } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@repo/ui/lib/utils";

interface FavoriteButtonProps {
  jobId: number;
  className?: string;
}

export function FavoriteButton({ jobId, className }: FavoriteButtonProps) {
  const [isFavorited, setIsFavorited] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [initialized, setInitialized] = useState(false);

  // Lazy-load the initial favorite state on first render
  if (!initialized) {
    setInitialized(true);
    // Fire-and-forget check — non-blocking
    fetch("/api/user/favorites")
      .then((res) => res.json())
      .then((data: { favoriteJobIds: number[] }) => {
        if (data.favoriteJobIds?.includes(jobId)) {
          setIsFavorited(true);
        }
      })
      .catch(() => {
        // Silently fail
      });
  }

  const handleToggle = useCallback(async () => {
    if (isLoading) return;
    setIsLoading(true);

    // Optimistic update
    const prev = isFavorited;
    setIsFavorited(!prev);

    try {
      const res = await fetch("/api/user/favorites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId }),
      });

      if (res.ok) {
        const data = (await res.json()) as { favorited: boolean };
        setIsFavorited(data.favorited);
        toast.success(
          data.favorited
            ? "Job added to favorites"
            : "Job removed from favorites"
        );
      } else {
        // Revert on error
        setIsFavorited(prev);
        toast.error("Failed to update favorite");
      }
    } catch {
      setIsFavorited(prev);
      toast.error("Failed to update favorite");
    } finally {
      setIsLoading(false);
    }
  }, [jobId, isFavorited, isLoading]);

  return (
    <Button
      variant="outline"
      size="icon"
      className={cn("h-10 w-10", className)}
      onClick={handleToggle}
      disabled={isLoading}
      aria-label={isFavorited ? "Remove from favorites" : "Add to favorites"}
    >
      <Heart
        className={cn(
          "h-5 w-5 transition-colors",
          isFavorited && "fill-red-500 text-red-500"
        )}
      />
    </Button>
  );
}
