import { UserRound } from "lucide-react";

export function Avatar({
  name,
  imageUrl,
  size = "regular",
}: {
  name: string;
  imageUrl?: string | null;
  size?: "regular" | "large";
}) {
  return (
    <span
      className={`avatar avatar-${size}`}
      role={imageUrl ? "img" : undefined}
      aria-label={imageUrl ? name : undefined}
      style={imageUrl ? { backgroundImage: `url("${imageUrl}")` } : undefined}
    >
      {!imageUrl && <UserRound aria-hidden="true" />}
    </span>
  );
}