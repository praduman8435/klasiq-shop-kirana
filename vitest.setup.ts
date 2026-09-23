import "dotenv/config";
import { vi } from "vitest";

// Vitest doesn't understand the "react-server" export condition Next.js
// uses to swap "server-only" for a no-op in Server Component bundles — left
// unmocked, importing any server-only-marked module (e.g. src/server/
// geoapify.ts, src/lib/basket.ts) throws unconditionally in every test.
vi.mock("server-only", () => ({}));
