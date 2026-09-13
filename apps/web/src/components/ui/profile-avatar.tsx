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

export function ProfileIdentity({
  name,
  avatar,
  className = "",
}: {
  name: string;
  avatar?: string | null;
  className?: string;
}) {
  return (
    <span className={`profile-identity ${className}`.trim()}>
      <ProfileAvatar name={name} avatar={avatar} />
      <span>{name}</span>
    </span>
  );
}

export function ProfileAvatarGroup({
  profiles,
}: {
  profiles: { id: string; name: string; avatar?: string | null }[];
}) {
  return (
    <span className="profile-avatar-group" aria-hidden="true">
      {profiles.slice(0, 2).map((profile) => (
        <ProfileAvatar
          key={profile.id}
          name={profile.name}
          avatar={profile.avatar}
        />
      ))}
    </span>
  );
}
