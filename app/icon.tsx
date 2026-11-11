import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

/**
 * The favicon — the same mark as the sidebar: a black hole.
 *
 * It used to 404, which is the kind of small lie a browser tells every
 * visitor (and every crawler). Next.js serves `app/icon.tsx` as
 * `/favicon.ico` automatically.
 */
export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#07080b",
          borderRadius: 7,
        }}
      >
        <div
          style={{
            width: 22,
            height: 22,
            borderRadius: 999,
            background:
              "radial-gradient(circle at 32% 28%, #7dd3fc 0%, #38bdf8 42%, #0a0d13 72%)",
            boxShadow: "0 0 10px -2px #38bdf8",
          }}
        />
      </div>
    ),
    { ...size },
  );
}
