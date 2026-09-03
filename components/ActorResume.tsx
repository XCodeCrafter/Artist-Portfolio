import type { ActorCredit, ActorCreditType, ActorResume } from "@/lib/content";

const creditTypeLabels: Record<ActorCreditType, string> = {
  film: "Film",
  television: "Television",
  theatre: "Theatre",
  commercial: "Commercial",
  voiceover: "Voiceover",
  training: "Training",
  other: "Other",
};

const creditTypeOrder: ActorCreditType[] = [
  "film",
  "television",
  "theatre",
  "commercial",
  "voiceover",
  "training",
  "other",
];

function splitList(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function Detail({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  if (!value) return null;

  return (
    <div className="border-t border-white/10 py-4">
      <dt className="text-xs uppercase tracking-[0.24em] text-white/40">
        {label}
      </dt>
      <dd className="mt-2 text-sm text-white/75">{value}</dd>
    </div>
  );
}

function TagList({ label, value }: { label: string; value: string }) {
  const items = splitList(value);
  if (!items.length) return null;

  return (
    <div>
      <h3 className="text-xs uppercase tracking-[0.24em] text-white/40">
        {label}
      </h3>
      <div className="mt-3 flex flex-wrap gap-2">
        {items.map((item) => (
          <span
            className="rounded-md border border-white/10 px-3 py-2 text-sm text-white/70"
            key={item}
          >
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}

function CreditRow({ credit }: { credit: ActorCredit }) {
  const body = (
    <article
      className="grid gap-4 border-t border-white/10 py-5 sm:grid-cols-[1fr_0.8fr_0.6fr]"
      data-reveal="up"
    >
      <div>
        <h4 className="text-lg font-semibold text-white">{credit.title}</h4>
        {credit.production ? (
          <p className="mt-1 text-sm text-white/55">{credit.production}</p>
        ) : null}
      </div>
      <div className="text-sm leading-6 text-white/65">
        {credit.role ? <div>{credit.role}</div> : null}
        {credit.director ? <div>Dir. {credit.director}</div> : null}
      </div>
      <div className="text-sm text-white/45 sm:text-right">{credit.year}</div>
    </article>
  );

  if (!credit.href) return body;

  return (
    <a className="block transition hover:bg-white/[0.03]" href={credit.href}>
      {body}
    </a>
  );
}

export default function ActorResumeBlock({
  resume,
  credits,
  hasResumeDetails = true,
}: {
  resume: ActorResume;
  credits: ActorCredit[];
  hasResumeDetails?: boolean;
}) {
  const groupedCredits = creditTypeOrder
    .map((type) => ({
      type,
      items: credits.filter((credit) => credit.creditType === type),
    }))
    .filter((group) => group.items.length > 0);

  return (
    <section
      className="public-nav-anchor mx-auto max-w-[1400px] px-5 py-14 sm:px-8 sm:py-18"
      id="resume"
    >
      <div className="grid gap-10 lg:grid-cols-[0.9fr_1.4fr]">
        {hasResumeDetails ? (
          <div>
            <p className="text-xs uppercase tracking-[0.32em] text-white/45">
              Resume
            </p>
            <h2
              className="heading-ui mt-3 text-3xl text-white sm:text-4xl"
              data-reveal="up"
            >
              {resume.headline || "Actor Resume"}
            </h2>
            {resume.summary ? (
              <p
                className="mt-5 text-sm leading-7 text-white/65"
                data-reveal="up"
                data-reveal-delay="80"
              >
                {resume.summary}
              </p>
            ) : null}
            {resume.resumeUrl ? (
              <a
                className="mt-6 inline-flex h-11 items-center rounded-md bg-white px-4 text-sm font-semibold text-black transition hover:bg-white/85"
                href={resume.resumeUrl}
              >
                Download Resume
              </a>
            ) : null}

            <dl className="mt-8">
              <Detail label="Location" value={resume.location} />
              <Detail label="Playing age" value={resume.playingAge} />
              <Detail label="Height" value={resume.height} />
              <Detail label="Eyes" value={resume.eyes} />
              <Detail label="Hair" value={resume.hair} />
              <Detail label="Representation" value={resume.representation} />
            </dl>

            <div className="mt-8 grid gap-6">
              <TagList label="Languages" value={resume.languages} />
              <TagList label="Skills" value={resume.skills} />
            </div>
          </div>
        ) : (
          <div>
            <p className="text-xs uppercase tracking-[0.32em] text-white/45">
              Resume &amp; Credits
            </p>
            <h2 className="heading-ui mt-3 text-3xl text-white sm:text-4xl">
              Selected acting work
            </h2>
          </div>
        )}

        <div>
          <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.32em] text-white/45">
                Credits
              </p>
              <h3 className="heading-ui mt-3 text-2xl text-white">
                Selected Work
              </h3>
            </div>
            <span className="text-sm text-white/45">{credits.length} items</span>
          </div>

          {groupedCredits.length ? (
            <div className="grid gap-8">
              {groupedCredits.map((group) => (
                <div key={group.type}>
                  <h3 className="text-sm uppercase tracking-[0.28em] text-white/45">
                    {creditTypeLabels[group.type]}
                  </h3>
                  <div className="mt-2">
                    {group.items.map((credit) => (
                      <CreditRow credit={credit} key={credit.id} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-lg border border-white/10 bg-white/5 p-8 text-center text-white/65">
              Credits are coming soon.
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
