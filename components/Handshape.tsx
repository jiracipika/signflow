import Image from "next/image";

export const ASL_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

export default function Handshape({ letter, reveal = true, mirrored = false }: {
  letter: string;
  reveal?: boolean;
  mirrored?: boolean;
}) {
  if (!/^[A-Z]$/.test(letter)) return null;
  const motion = letter === "J" ? "Trace a J with your pinky."
    : letter === "Z" ? "Trace a Z with your index finger." : "";
  return (
    <figure className="handshape">
      <Image
        src={`/asl/${letter}.svg`}
        alt={reveal ? `ASL handshape for ${letter}` : "ASL fingerspelling prompt"}
        width={240}
        height={240}
        unoptimized
        className={mirrored ? "handshape-mirrored" : undefined}
      />
      {reveal && motion && <figcaption>{motion}</figcaption>}
    </figure>
  );
}
