/**
 * Where this deployment lives, as an absolute URL.
 *
 * Open Graph tags cannot use relative paths - a chat app fetching a preview has
 * no page context to resolve them against - so Next needs `metadataBase` to
 * turn `/opengraph-image` into something a crawler can actually fetch. Without
 * it the card silently arrives with no image at all.
 *
 * Resolution order, and why:
 *
 * 1. `NEXT_PUBLIC_SITE_URL` - an explicit override, for a custom domain later.
 * 2. `VERCEL_PROJECT_PRODUCTION_URL` - Vercel's own production hostname. The
 *    *production* one deliberately, not `VERCEL_URL`: every preview deployment
 *    has its own hostname, and a link shared from one would otherwise advertise
 *    a throwaway URL that stops resolving the moment the branch is deleted.
 * 3. localhost, so `next dev` and the e2e suite have something valid to build
 *    on rather than throwing.
 *
 * None of these is a secret - they are hostnames, and two of them are printed
 * in every page's `<head>`.
 */
const FALLBACK = "http://localhost:3000";

export function siteUrl(): URL {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL;
  if (explicit) return new URL(explicit);

  // Vercel supplies the bare host, with no scheme.
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (vercel) return new URL(`https://${vercel}`);

  return new URL(FALLBACK);
}
