import type { Metadata } from "next";
import { NATIONAL_CONTACTS, LOCAL_CONTACTS } from "@/lib/emergency/contacts";
import { GoBagList } from "@/components/GoBagList";

/**
 * Preparedness, and the numbers that actually reach someone.
 *
 * The one screen in the application that is useful with no signal, no data and
 * no reports - which is exactly the condition it is most likely to be read in.
 * So it is a server component with no fetch: static markup, no spinner, no
 * failure state to design.
 *
 * THE HOTLINE SECTION IS THE POINT, not an afterthought at the bottom. Antas
 * cannot dispatch anyone; until now that fact was only ever a disclaimer. Here
 * it becomes an action - we cannot send help, and here is the number of the
 * people who can. It is the most useful thing this application can offer
 * someone in danger, so it goes first.
 *
 * Note what "Humingi ng tulong" does NOT say. Generated drafts of this screen
 * told the reader to use Antas's own SOS button to get rescued. Our SOS reaches
 * nobody. Printing that inside a safety guide - where it carries more authority
 * than anywhere else in the product - would be the exact harm the safety
 * boundary exists to prevent.
 */

export const metadata: Metadata = {
  title: "Gabay sa Baha - Antas",
  description:
    "Paghahanda bago, habang, at pagkatapos ng baha. Kasama ang mga numerong dapat tawagan.",
};

interface Item {
  title: string;
  body: string;
}

const GO_BAG: readonly Item[] = [
  {
    title: "Tubig at pagkain",
    body: "Para sa tatlong araw. Piliin ang hindi kailangang lutuin - de-lata, biskwit, tubig na naka-bote.",
  },
  {
    title: "Flashlight at radyo",
    body: "May kasamang ekstrang baterya. Mas maaasahan ang radyo kaysa signal kapag tumaas ang tubig.",
  },
  {
    title: "Gamot at first aid",
    body: "Alcohol, benda, at ang mga regular na gamot ng bawat isa sa bahay.",
  },
  {
    title: "Mahahalagang dokumento",
    body: "Ilagay sa plastik na selyado. ID, titulo, birth certificate, at kopya ng mga numerong nasa itaas.",
  },
];

const BEFORE: readonly Item[] = [
  {
    title: "Makinig sa opisyal na balita",
    body: "Ang PAGASA at ang inyong barangay ang may sinasabi tungkol sa paglikas. Ang Antas ay nagsasabi kung gaano kalalim ang tubig - hindi ito nagbabala at hindi ito nag-uutos lumikas.",
  },
  {
    title: "Alamin ang daan palabas",
    body: "Tukuyin ngayon kung saan ang pinakamalapit na evacuation center at kung aling kalsada ang hindi madaling bahain. Huwag hintaying gabi na at umaapaw na ang tubig.",
  },
  {
    title: "Itaas ang mga gamit",
    body: "Ilipat sa mataas na lugar ang mga kagamitang de-kuryente at ang mga papeles. Linisin ang kanal at bubong bago pa dumating ang malakas na ulan.",
  },
  {
    title: "I-charge ang lahat",
    body: "Telepono, power bank, at flashlight. Kapag nawalan ng kuryente, wala nang pagkakataon.",
  },
];

const DURING: readonly Item[] = [
  {
    title: "Huwag lumusong sa baha",
    body: "Anim na pulgada ng umaagos na tubig ay sapat na para matumba ka. Hindi mo nakikita ang bukas na manhole, ang kable, o kung gaano na kalalim.",
  },
  {
    title: "Patayin ang kuryente",
    body: "Ibaba ang main switch bago pumasok ang tubig sa loob ng bahay. Huwag hahawak ng anumang de-kuryente habang basa ang paa.",
  },
  {
    title: "Umakyat, huwag tumawid",
    body: "Kung tumataas na ang tubig, umakyat sa mas mataas na palapag o sa bubong. Huwag piliting tumawid sa umaagos na tubig para makarating sa ibang lugar.",
  },
  {
    title: "Humingi ng tulong sa mga tumutugon",
    body: "Tumawag sa 911 o sa inyong barangay disaster desk. Ang Antas ay hindi nagpapadala ng rescue at walang nakabantay dito - ang mga numerong nasa itaas ang umaabot sa taong makakasagip.",
  },
];

function Section({
  id,
  title,
  items,
}: {
  id: string;
  title: string;
  items: readonly Item[];
}) {
  return (
    <section className="guide-section" aria-labelledby={id}>
      <h2 className="guide-heading" id={id}>
        {title}
      </h2>
      <ul className="guide-list">
        {items.map((item) => (
          <li key={item.title} className="guide-item">
            <p className="guide-item-title">{item.title}</p>
            <p className="guide-item-body">{item.body}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function GabayPage() {
  return (
    <main className="task-page">
      <h1 className="task-title">Handa ka ba?</h1>
      <p className="task-lede">
        Ang Antas ay nagsasabi kung gaano kalalim ang tubig. Hindi ito
        nagpapadala ng rescue at walang nakabantay dito. Ito ang dapat gawin - at
        ang mga numerong dapat tawagan.
      </p>

      {/* First, because it is the only section that matters when the water is
          already rising. The checklist can wait; this cannot. */}
      <section className="guide-section" aria-labelledby="tulong">
        <h2 className="guide-heading" id="tulong">
          Mga numerong umaabot sa tao
        </h2>

        <ul className="contact-list">
          {NATIONAL_CONTACTS.map((contact) => (
            <li key={contact.number} className="contact">
              <div className="contact-body">
                <p className="contact-name">{contact.name}</p>
                <p className="contact-role">{contact.role}</p>
              </div>
              <a className="contact-call" href={`tel:${contact.number}`}>
                {contact.number}
              </a>
            </li>
          ))}
        </ul>

        {LOCAL_CONTACTS.length === 0 ? (
          // Said out loud rather than left as a short list that looks complete.
          // Someone scanning this needs to know the local desk is missing here,
          // so they go and find it now instead of assuming it is covered.
          <p className="guide-note">
            Wala pang naidagdag na numero ng barangay o lokal na DRRMO dito.
            Hanapin at itago ang numero ng inyong barangay bago pa
            mangailangan.
          </p>
        ) : (
          <ul className="contact-list">
            {LOCAL_CONTACTS.map((contact) => (
              <li key={contact.number} className="contact">
                <div className="contact-body">
                  <p className="contact-name">{contact.name}</p>
                  <p className="contact-role">{contact.role}</p>
                </div>
                <a className="contact-call" href={`tel:${contact.number}`}>
                  {contact.number}
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* The only interactive part of this page, and the only one that should
          be: packing is a task, so it gets checkboxes. Everything else here is
          read once and acted on, not tracked. */}
      <GoBagList items={GO_BAG} />
      <Section id="bago" title="Bago ang baha" items={BEFORE} />
      <Section id="habang" title="Habang may baha" items={DURING} />

      <p className="guide-note">
        Pangkalahatan ang gabay na ito. Ang barangay at ang PAGASA ang may
        opisyal na babala at utos na lumikas para sa inyong lugar.
      </p>
    </main>
  );
}
