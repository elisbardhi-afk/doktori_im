"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { Camera } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";

interface Props {
  currentUrl: string | null;
  fallbackText: string;
  role: "doctor" | "patient";
  onUploaded: (url: string) => void;
}

export function AvatarUploader({ currentUrl, fallbackText, role, onUploaded }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(currentUrl);
  const [loading, setLoading] = useState(false);

  async function handleFile(file: File) {
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image must be smaller than 5 MB");
      return;
    }

    // Show local preview immediately
    const objectUrl = URL.createObjectURL(file);
    setPreview(objectUrl);
    setLoading(true);

    const fd = new FormData();
    fd.append("file", file);
    fd.append("role", role);

    try {
      const res = await fetch("/api/upload-avatar", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error ?? "Upload failed");
        setPreview(currentUrl); // revert
        return;
      }
      toast.success("Photo updated");
      onUploaded(json.url);
    } catch {
      toast.error("Upload failed");
      setPreview(currentUrl);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative">
        <Avatar className="size-24 text-xl">
          {preview && <AvatarImage src={preview} alt="Profile photo" />}
          <AvatarFallback>{fallbackText}</AvatarFallback>
        </Avatar>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={loading}
          className="absolute bottom-0 right-0 flex size-8 items-center justify-center rounded-full bg-primary text-primary-foreground shadow hover:bg-primary/90 disabled:opacity-50"
          aria-label="Change photo"
        >
          <Camera className="size-4" />
        </button>
      </div>

      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={loading}
        onClick={() => inputRef.current?.click()}
      >
        {loading ? "Uploading…" : "Change photo"}
      </Button>

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
          e.target.value = "";
        }}
      />
    </div>
  );
}
