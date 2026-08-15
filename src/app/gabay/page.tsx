import type { Metadata } from "next";
import {
  NATIONAL_CONTACTS,
  LOCAL_CONTACTS,
  type EmergencyContact,
} from "@/lib/emergency/contacts";
import { GoBagList } from "@/components/GoBagList";
import { copyFor, type Copy } from "@/lib/i18n/strings";
import { getLang } from "@/lib/i18n/server";

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

export async function generateMetadata(): Promise<Metadata> {
  // Translated too. A tab title and a share preview are read before the page
  // is, so leaving them Tagalog would hand an English reader a page that
  // announces itself in a language they told us they could not read.
  const copy = copyFor(await getLang());
  return {
    title: copy.guide.metaTitle,
    description: copy.guide.metaDescription,
  };
}

interface Item {
  id: string;
  title: string;
  body: string;
}

/**
 * One desk and every published way to reach it.
 *
 * Every line gets its own full-width target, because a desk publishes
 * alternates for a reason: during a disaster its first number is the one
 * already engaged. They are listed in published order, best first.
 *
 * How loud the card is comes from `emphasis`, never from how many lines the
 * desk happens to publish - see `EmergencyContact.emphasis` for the mistake
 * that rule was written to prevent.
 *
 * The label is the agency's published string, prose and all; the href dials the
 * single number recorded beside it. See `EmergencyLine` for why those are two
 * fields and not one.
 */
function Contact({
  contact,
  copy,
}: {
  contact: EmergencyContact;
  copy: Copy["guide"];
}) {
  return (
    <li className={`contact contact--${contact.emphasis}`}>
      <div className="contact-body">
        <p className="contact-name">{contact.name}</p>
        <p className="contact-role">{copy[contact.roleKey] as string}</p>
      </div>
      <div className="contact-lines">
        {contact.lines.map((line) => (
          <a key={line.dial} className="contact-call" href={`tel:${line.dial}`}>
            {line.published}
          </a>
        ))}
      </div>
    </li>
  );
}

function ContactList({
  contacts,
  scope,
  copy,
}: {
  contacts: readonly EmergencyContact[];
  copy: Copy["guide"];
  /**
   * Marks which list this is in the DOM. Not styling - it is what lets a test
   * ask whether a *local* desk is listed. Counting `.contact` cannot answer
   * that any more now that a second national desk exists.
   */
  scope: "national" | "local";
}) {
  return (
    <ul className="contact-list" data-scope={scope}>
      {contacts.map((contact) => (
        <Contact key={contact.name} contact={contact} copy={copy} />
      ))}
    </ul>
  );
}

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
          <li key={item.id} className="guide-item">
            <p className="guide-item-title">{item.title}</p>
            <p className="guide-item-body">{item.body}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default async function GabayPage() {
  const copy = copyFor(await getLang());

  const before: readonly Item[] = [
    { id: "news", title: copy.guide.beforeNewsTitle, body: copy.guide.beforeNewsBody },
    { id: "route", title: copy.guide.beforeRouteTitle, body: copy.guide.beforeRouteBody },
    { id: "lift", title: copy.guide.beforeLiftTitle, body: copy.guide.beforeLiftBody },
    {
      id: "charge",
      title: copy.guide.beforeChargeTitle,
      body: copy.guide.beforeChargeBody,
    },
  ];

  const during: readonly Item[] = [
    { id: "wade", title: copy.guide.duringWadeTitle, body: copy.guide.duringWadeBody },
    { id: "power", title: copy.guide.duringPowerTitle, body: copy.guide.duringPowerBody },
    { id: "climb", title: copy.guide.duringClimbTitle, body: copy.guide.duringClimbBody },
    { id: "call", title: copy.guide.duringCallTitle, body: copy.guide.duringCallBody },
  ];

  return (
    <main className="task-page">
      <h1 className="task-title">{copy.guide.title}</h1>
      <p className="task-lede">{copy.guide.lede}</p>

      {/* First, because it is the only section that matters when the water is
          already rising. The checklist can wait; this cannot. */}
      <section className="guide-section" aria-labelledby="tulong">
        <h2 className="guide-heading" id="tulong">
          {copy.guide.hotlinesHeading}
        </h2>

        <ContactList
          contacts={NATIONAL_CONTACTS}
          scope="national"
          copy={copy.guide}
        />

        {LOCAL_CONTACTS.length === 0 ? (
          // Said out loud rather than left as a short list that looks complete.
          // Someone scanning this needs to know the local desk is missing here,
          // so they go and find it now instead of assuming it is covered. The
          // national desks above do not cover it: they cannot say which street
          // in Malanday is passable.
          <p className="guide-note">{copy.guide.noLocalNumbers}</p>
        ) : (
          <ContactList
            contacts={LOCAL_CONTACTS}
            scope="local"
            copy={copy.guide}
          />
        )}
      </section>

      {/* The only interactive part of this page, and the only one that should
          be: packing is a task, so it gets checkboxes. Everything else here is
          read once and acted on, not tracked. */}
      {/* Takes no props: it is a client component and reads its own copy. See
          the note in GoBagList - an interpolated phrase is a function, and
          functions cannot be passed from a server component. */}
      <GoBagList />
      <Section id="bago" title={copy.guide.beforeHeading} items={before} />
      <Section id="habang" title={copy.guide.duringHeading} items={during} />

      <p className="guide-note">{copy.guide.footer}</p>
    </main>
  );
}
