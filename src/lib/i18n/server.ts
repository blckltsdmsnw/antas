import { cookies } from "next/headers";
import { LANG_COOKIE, toLang, type Lang } from "./lang";

/**
 * The live language, on the server.
 *
 * Called in the root layout so the very first byte of HTML is already in the
 * right language. Reading a cookie opts the tree out of static prerendering,
 * which is the real price of this feature and is worth naming: the alternative
 * was rendering Tagalog and correcting it on the client, which is the flash
 * this codebase has already shipped twice. A page that is momentarily in the
 * wrong language is worse here than a page rendered per request, because on the
 * SOS and guide screens the words are the product.
 *
 * Offline is unaffected. The service worker caches whatever response it was
 * given, so a cached page simply keeps the language it was cached in.
 */
export async function getLang(): Promise<Lang> {
  const store = await cookies();
  return toLang(store.get(LANG_COOKIE)?.value);
}
