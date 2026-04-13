/**
 * Source registry — maps URL slug → source module.
 *
 * To add a new source:
 *   1. Create netlify/sources/<slug>.mjs
 *   2. Add one import + one entry below
 */
import * as denverpost from "./denverpost.mjs";

export const sources = {
  denverpost,
};
