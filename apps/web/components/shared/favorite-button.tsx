"use client";

import { useState, useTransition } from "react";
import { Heart } from "lucide-react";
import { Button } from "@repo/ui/button";
import { toast } from "sonner";

interface FavoriteButtonProps {
  jobId: number;
  initialFavorited?: boolean;
}

export function FavoriteButton({
  jobId,
  initialFavorited = false,
}: FavoriteButtonProps) {
  const [favorited, setFavorited] = useState(initialFavorited);
  const [isPending, startTransition] = useTransition();

  function handleToggle() {
    startTransition(async () => {
      try {
        const res = await fetch("/api/user/favorites", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jobId }),
        });

        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error ?? "Failed to update favorite");
        }

        const data = await res.json();
        setFavorited(data.favorited);
        toast.success(
          data.favorited ? "Added to favorites" : "Removed from favorites"
        );
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Failed to update favorite"
        );
      }
    });
  }

  return (
    <Button
      variant="outline"
      size="icon"
      className="h-10 w-10"
      aria-label={favorited ? "Remove from favorites" : "Add to favorites"}
      onClick={handleToggle}
      disabled={isPending}
    >
      <Heart
        className={`h-5 w-5 transition-colors ${
          favorited ? "fill-red-500 text-red-500" : ""
        }`}
      />
    </Button>
  );
}
