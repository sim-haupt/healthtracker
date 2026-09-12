"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
export function ProfileAvatar({
  name,
  avatar,
  large = false,
}: {
  name: string;
  avatar?: string | null;
  large?: boolean;
}) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    let active = true,
      objectUrl = "";
    setUrl("");
    if (avatar)
      void supabase?.storage
        .from("profile-avatars")
        .download(avatar)
        .then(({ data }) => {
          if (active && data) {
            objectUrl = URL.createObjectURL(data);
            setUrl(objectUrl);
          }
        })
        .catch(() => {});
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [avatar]);
  const initials =
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0])
      .join("")
      .toUpperCase() || "?";
  return (
    <span
      className={`avatar portrait ${large ? "portrait-large" : ""}`}
      aria-hidden
    >
      {url ? <img src={url} alt="" /> : initials}
    </span>
  );
}
