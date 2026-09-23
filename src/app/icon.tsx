import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

/**
 * A simple text-based "K" wordmark tile — replaces the generic Next.js
 * default favicon. Not a full brand identity package (deliberately out of
 * scope for this sprint); the color approximates the site's warm maroon
 * --primary token since ImageResponse's renderer doesn't support oklch().
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
          background: "#5C2A2A",
          color: "#FBF4EC",
          fontSize: 20,
          fontWeight: 700,
          fontFamily: "Georgia, serif",
          borderRadius: 7,
        }}
      >
        K
      </div>
    ),
    { ...size },
  );
}
