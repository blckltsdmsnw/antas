/**
 * Present on every console screen, not once at sign-in. Somebody who leaves
 * this open on a desk must not be able to forget what it is.
 */
export function SimulationBanner() {
  return (
    <p className="sim-banner" role="note">
      <strong>Demonstrasyon lamang.</strong> Walang tunay na rescue service na
      nakakatanggap ng mga signal na ito. Sa totoong emergency, tumawag sa 911.
    </p>
  );
}
