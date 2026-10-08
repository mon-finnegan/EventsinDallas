import type { SourceType } from "../types";

export type FeederKind = "auto" | "ical" | "jsonld" | "tribe" | "html_ai" | "instagram" | "reddit";

export type SourceGroup =
  | "church"
  | "venue"
  | "civic"
  | "performing_arts"
  | "seasonal"
  | "aggregator"
  | "networking"
  | "sports"
  | "social"
  | "national";

export interface Source {
  id: string;
  name: string;
  url: string;
  source_type: SourceType;
  group: SourceGroup;
  /** Church/religious community institution (spec §20). */
  is_church: boolean;
  /** National coveted-experience source (spec §8). */
  is_national: boolean;
  /** How to read the source. "auto" tries structured feeds first and falls back to AI. */
  feeder?: FeederKind;
  /** Explicit feed endpoint for `ical` / `tribe` feeders. */
  feed_url?: string;
  /** City to assume when a structured feed omits it (the source's own location). */
  default_city?: string;
  /** Event detail pages to follow from a listing page (AI path). */
  max_detail_pages?: number;
  /**
   * For month-specific guides: the URL contains {monthName} / {year}, and the source is read
   * for this many months starting with the current one (rolling coverage).
   */
  rolling_months?: number;
  /** For `instagram` feeders: the public Business/Creator account to read. */
  instagram_username?: string;
  /** For `reddit` feeders: the subreddit to search for event posts. */
  subreddit?: string;
}

type Def = Omit<Source, "is_church" | "is_national"> & Partial<Pick<Source, "is_church" | "is_national">>;

const def = (d: Def): Source => ({
  is_church: d.group === "church",
  is_national: d.group === "national",
  ...d,
});

/**
 * Feeder registry. Each source is an official page (spec §26) unless marked `local_calendar`.
 * Add sources here — or rows in the `sources` table — rather than hard-coding events. With
 * `feeder: "auto"` the pipeline detects WordPress calendars, iCal feeds and schema.org markup
 * on its own, so most new sources need only a URL.
 */
export const SOURCES: Source[] = [
  // ── Churches & religious community institutions ──────────────────────────────
  def({ id: "prestoncrest", name: "Prestoncrest Church of Christ", url: "https://prestoncrest.org/events/pumpkinfest/", source_type: "official_organization", group: "church", default_city: "Dallas" }),
  def({ id: "first-dallas", name: "First Baptist Dallas", url: "https://firstdallas.org/", source_type: "official_organization", group: "church", default_city: "Dallas" }),
  def({ id: "first-umc-dallas", name: "First United Methodist Church Dallas", url: "https://dallasfirstumc.org/", source_type: "official_organization", group: "church", default_city: "Dallas" }),
  def({ id: "hpumc", name: "Highland Park United Methodist Church", url: "https://www.hpumc.org/christmas", source_type: "official_organization", group: "church", default_city: "Dallas" }),
  def({ id: "prestonwood", name: "Prestonwood Baptist Church — Christmas", url: "https://prestonwood.org/christmas/", source_type: "official_organization", group: "church", default_city: "Plano" }),
  def({ id: "prestonwood-goc", name: "The Gift of Christmas (Prestonwood)", url: "https://prestonwoodgoc.org/", source_type: "official_event", group: "church", default_city: "Plano" }),
  def({ id: "greek-fest", name: "Greek Food Festival of Dallas", url: "https://greekfestivalofdallas.com/", source_type: "official_event", group: "church", default_city: "Dallas" }),
  def({ id: "lebanese-fest", name: "DFW Lebanese Food Festival", url: "https://dfwlebanesefoodfest.com/", source_type: "official_event", group: "church", default_city: "Lewisville" }),
  def({ id: "cathdal", name: "Catholic Diocese of Dallas — Events", url: "https://www.cathdal.org/events", source_type: "official_organization", group: "church", max_detail_pages: 10 }),

  // ── Venues: zoos, gardens, museums, parks ───────────────────────────────────
  def({ id: "klyde-warren", name: "Klyde Warren Park", url: "https://www.klydewarrenpark.org/events-programming", source_type: "official_venue", group: "venue", default_city: "Dallas" }),
  def({ id: "klyde-warren-signature", name: "Klyde Warren Park — Signature Events", url: "https://www.klydewarrenpark.org/signature-events", source_type: "official_venue", group: "venue", default_city: "Dallas" }),
  def({ id: "arboretum", name: "Dallas Arboretum", url: "https://www.dallasarboretum.org/events-activities/calendar/", source_type: "official_venue", group: "venue", default_city: "Dallas", max_detail_pages: 10 }),
  def({ id: "arboretum-holiday", name: "Dallas Arboretum — Holiday", url: "https://www.dallasarboretum.org/events-activities/holiday-at-the-arboretum/", source_type: "official_venue", group: "venue", default_city: "Dallas" }),
  def({ id: "arboretum-autumn", name: "Dallas Arboretum — Autumn", url: "https://www.dallasarboretum.org/autumn-at-the-arboretum/", source_type: "official_venue", group: "venue", default_city: "Dallas" }),
  def({ id: "dallas-zoo", name: "Dallas Zoo — Events", url: "https://www.dallaszoo.com/dallas-zoo-events/", source_type: "official_venue", group: "venue", default_city: "Dallas" }),
  def({ id: "dallas-zoo-lights", name: "Dallas Zoo Lights", url: "https://www.dallaszoo.com/zoo-lights/", source_type: "official_venue", group: "venue", default_city: "Dallas" }),
  def({ id: "fort-worth-zoo", name: "Fort Worth Zoo", url: "https://www.fortworthzoo.org/boo-at-the-zoo", source_type: "official_venue", group: "venue", default_city: "Fort Worth" }),
  def({ id: "perot", name: "Perot Museum of Nature and Science", url: "https://www.perotmuseum.org/events/", source_type: "official_venue", group: "venue", default_city: "Dallas" }),
  def({ id: "heritage-village", name: "Dallas Heritage Village — Candlelight", url: "http://www.dallasheritagevillage.org/candlelight", source_type: "official_venue", group: "venue", default_city: "Dallas" }),
  def({ id: "farmers-market", name: "Dallas Farmers Market", url: "https://dallasfarmersmarket.org/dfm-events/", source_type: "official_venue", group: "venue", feeder: "auto", default_city: "Dallas" }),
  def({ id: "fair-park", name: "State Fair of Texas", url: "https://bigtex.com/", source_type: "official_event", group: "venue", default_city: "Dallas" }),
  def({ id: "northpark-trains", name: "The Trains at NorthPark", url: "https://rmhdallas.org/event/the-trains-at-northpark/", source_type: "official_organization", group: "seasonal", default_city: "Dallas" }),
  def({ id: "galleria", name: "Galleria Dallas — Holiday", url: "https://galleriadallas.com/holiday-2026", source_type: "official_venue", group: "seasonal", default_city: "Dallas" }),
  def({ id: "gaylord-ice", name: "Gaylord Texan — ICE!", url: "https://www.christmasatgaylordtexan.com/ice", source_type: "official_venue", group: "seasonal", default_city: "Grapevine" }),
  def({ id: "north-pole-express", name: "Grapevine — Santa's North Pole Express", url: "https://www.grapevinetexasusa.com/christmas-capital-of-texas/north-pole-express/faq/", source_type: "official_municipal", group: "seasonal", default_city: "Grapevine" }),
  def({ id: "adolphus-tea", name: "The Adolphus — Tea", url: "https://www.adolphus.com/restaurants-bars/tea-at-the-adolphus", source_type: "official_venue", group: "seasonal", default_city: "Dallas" }),

  // ── Cities & civic calendars ────────────────────────────────────────────────
  def({ id: "visit-dallas", name: "Visit Dallas — Annual Events", url: "https://www.visitdallas.com/events/annual-events/", source_type: "official_municipal", group: "civic", default_city: "Dallas", max_detail_pages: 10 }),
  def({ id: "dallas-library", name: "Dallas Public Library — Events", url: "https://dallaslibrary.librarymarket.com/events/upcoming", source_type: "official_municipal", group: "civic", default_city: "Dallas" }),
  def({ id: "university-park", name: "University Park — Special Events", url: "https://www.uptexas.org/378/Special-Events", source_type: "official_municipal", group: "civic", default_city: "University Park" }),
  def({ id: "richardson-santa", name: "Richardson — Santa's Village", url: "https://www.cor.net/departments/parks-recreation/community-events/santa-s-village-at-huffhines-park", source_type: "official_municipal", group: "civic", default_city: "Richardson" }),
  def({ id: "addison-events", name: "Town of Addison — Events", url: "https://www.addisontx.gov/Events-directory", source_type: "official_municipal", group: "civic", default_city: "Addison" }),
  def({ id: "visit-plano", name: "Visit Plano — Events", url: "https://events.visitplano.com/", source_type: "official_municipal", group: "civic", default_city: "Plano" }),
  def({ id: "frisco-merry", name: "Frisco — Merry Main Street", url: "https://www.friscotexas.gov/916/Merry-Main-Street", source_type: "official_municipal", group: "civic", default_city: "Frisco" }),
  def({ id: "old-lake-highlands", name: "Old Lake Highlands Neighborhood Association", url: "https://www.oldlakehighlands.com/event-calendar", source_type: "official_organization", group: "civic", default_city: "Dallas" }),
  def({ id: "ymca-turkey-trot", name: "Dallas YMCA Turkey Trot", url: "https://ymcadallas.org/turkeytrot", source_type: "official_event", group: "civic", default_city: "Dallas" }),

  // ── Performing arts for little ones ─────────────────────────────────────────
  def({ id: "dct", name: "Dallas Children's Theater", url: "https://www.dct.org/performances", source_type: "official_venue", group: "performing_arts", default_city: "Dallas" }),
  def({ id: "attpac", name: "AT&T Performing Arts Center", url: "https://attpac.org/", source_type: "official_venue", group: "performing_arts", default_city: "Dallas" }),
  def({ id: "dso-family", name: "Dallas Symphony — Family Holidays", url: "https://www.dallassymphony.org/productions/family-holidays-2026/", source_type: "official_venue", group: "performing_arts", default_city: "Dallas" }),

  // ── Aggregators (lower trust; used for discovery, official sources win on dedupe) ──
  def({ id: "dfwchild-calendar", name: "DFWChild — Calendar", url: "https://dfwchild.com/calendar/", source_type: "local_calendar", group: "aggregator", max_detail_pages: 0 }),
  def({ id: "dfwchild-trunk", name: "DFWChild — Trunk-or-Treat Guide", url: "https://dfwchild.com/trunk-or-treat-dfw/", source_type: "local_calendar", group: "aggregator", max_detail_pages: 0 }),
  def({ id: "kids-out-about", name: "Kids Out and About — Dallas", url: "https://dallas.kidsoutandabout.com/", source_type: "local_calendar", group: "aggregator", max_detail_pages: 0 }),
  def({ id: "dallas-moms", name: "Dallas Moms — Monthly Guide", url: "https://dallasmoms.com/dallas-moms-need-to-know-a-guide-to-the-month-of-{monthName}/", source_type: "local_calendar", group: "aggregator", max_detail_pages: 0, rolling_months: 2 }),
  def({ id: "live-love-local", name: "Live Love Local — Dallas Fall Events", url: "https://livelovelocalblog.com/the-ultimate-guide-to-dallas-fall-events-2026/", source_type: "local_calendar", group: "aggregator", max_detail_pages: 0 }),
  def({ id: "visit-dallas-dia", name: "Visit Dallas — Día de los Muertos", url: "https://www.visitdallas.com/blog/dia-de-los-muertos-dallas/", source_type: "official_municipal", group: "aggregator", default_city: "Dallas", max_detail_pages: 0 }),

  // ── Running event guides & local media (discovery; official sources win on dedupe) ──
  def({ id: "dallasites101-events", name: "Dallasites101 — Events", url: "https://www.dallasites101.com/events/", source_type: "local_calendar", group: "aggregator", max_detail_pages: 8 }),
  def({ id: "dallasites101-blog", name: "Dallasites101 — Guides", url: "https://www.dallasites101.com/blog/", source_type: "local_calendar", group: "aggregator", max_detail_pages: 6 }),
  def({ id: "dallasites101-holiday", name: "Dallasites101 — Holiday Events Around DFW", url: "https://www.dallasites101.com/blog/post/35-holiday-events-around-dfw/", source_type: "local_calendar", group: "aggregator", max_detail_pages: 0 }),
  def({ id: "dallasites101-hanukkah", name: "Dallasites101 — Hanukkah Events", url: "https://www.dallasites101.com/blog/post/hanukkah-events-dallas/", source_type: "local_calendar", group: "aggregator", max_detail_pages: 0 }),
  def({ id: "resident-dallas", name: "Resident — DFW Events This Month", url: "https://resident.com/dallas/2026/10/02/20-dallas-fort-worth-events-worth-planning-around-in-october-2026", source_type: "local_calendar", group: "aggregator", max_detail_pages: 0 }),
  def({ id: "scout-guide-dallas", name: "The Scout Guide Dallas — This Month", url: "https://thescoutguide.com/dallas/editorial/the-best-things-to-do-in-dallas-this-october-2026/", source_type: "local_calendar", group: "aggregator", max_detail_pages: 0 }),
  def({ id: "visit-dallas-month", name: "Visit Dallas — This Month", url: "https://www.visitdallas.com/blog/what-to-do-october/", source_type: "official_municipal", group: "aggregator", default_city: "Dallas", max_detail_pages: 0 }),
  def({ id: "visit-dallas-winter", name: "Visit Dallas — Winter Events", url: "https://www.visitdallas.com/events/seasonal-events/winter/", source_type: "official_municipal", group: "aggregator", default_city: "Dallas", max_detail_pages: 0 }),
  def({ id: "culturemap-dallas", name: "CultureMap Dallas — Events", url: "https://dallas.culturemap.com/events/", source_type: "local_calendar", group: "aggregator", max_detail_pages: 0 }),
  def({ id: "do214", name: "Do214", url: "https://do214.com/", source_type: "local_calendar", group: "aggregator", max_detail_pages: 0 }),
  def({ id: "mommypoppins-fall", name: "Mommy Poppins — DFW Fall Festivals", url: "https://mommypoppins.com/fall-festivals-dallas-fort-worth", source_type: "local_calendar", group: "aggregator", max_detail_pages: 0 }),
  def({ id: "planomoms-winter", name: "Plano Moms — Winter Things To Do", url: "https://planomoms.com/winter-things-to-do-dfw/", source_type: "local_calendar", group: "aggregator", max_detail_pages: 0 }),
  def({ id: "dfwchild-annual", name: "DFWChild — Annual Family Events by Month", url: "https://dfwchild.com/dallas-annual-family-events-month-by-month/", source_type: "local_calendar", group: "aggregator", max_detail_pages: 0 }),
  def({ id: "dfwchild-nye", name: "DFWChild — New Year's Eve for Kids", url: "https://dfwchild.com/new-years-eve-for-the-kiddos/", source_type: "local_calendar", group: "aggregator", max_detail_pages: 0 }),
  def({ id: "eventbrite-dallas-month", name: "Eventbrite — Dallas this month", url: "https://www.eventbrite.com/d/tx--dallas/{monthName}/", source_type: "official_ticketing", group: "aggregator", max_detail_pages: 0, rolling_months: 2 }),

  // ── Networking & business ───────────────────────────────────────────────────
  def({ id: "dallas-chamber", name: "Dallas Regional Chamber — Events", url: "https://www.dallaschamber.org/events/", source_type: "official_organization", group: "networking", default_city: "Dallas" }),
  def({ id: "dallas-innovates", name: "Dallas Innovates — Calendar", url: "https://dallasinnovates.com/calendar/", source_type: "local_calendar", group: "networking", max_detail_pages: 4 }),
  def({ id: "venture-dallas", name: "Venture Dallas", url: "https://www.venturedallas.org/", source_type: "official_event", group: "networking", default_city: "Dallas" }),
  def({ id: "small-business-expo", name: "Small Business Expo — Dallas", url: "https://www.thesmallbusinessexpo.com/city/dallas/", source_type: "official_event", group: "networking", default_city: "Dallas" }),
  def({ id: "eventbrite-networking", name: "Eventbrite — Dallas networking", url: "https://www.eventbrite.com/d/tx--dallas/networking/", source_type: "official_ticketing", group: "networking", max_detail_pages: 0 }),

  // ── Pro & college sports (home games) ───────────────────────────────────────
  def({ id: "cowboys-schedule", name: "Dallas Cowboys — Schedule", url: "https://www.dallascowboys.com/news/nfl-announces-cowboys-2026-complete-17-game-schedule", source_type: "official_event", group: "sports", default_city: "Arlington" }),
  def({ id: "mavs-schedule", name: "Dallas Mavericks — Schedule", url: "https://www.nbcdfw.com/news/sports/dallas-mavericks/dallas-mavericks-release-full-schedule-for-2026-27-season/4062299/", source_type: "local_calendar", group: "sports", default_city: "Dallas" }),
  def({ id: "stars-schedule", name: "Dallas Stars — Schedule", url: "https://www.nhl.com/stars/news/dallas-stars-announce-2026-27-regular-season-schedule-071626", source_type: "official_event", group: "sports", default_city: "Dallas" }),
  def({ id: "dallas-sports-commission", name: "Dallas Sports Commission — Events", url: "https://www.dallassports.org/events/", source_type: "official_organization", group: "sports", default_city: "Dallas" }),
  def({ id: "cotton-bowl", name: "Goodyear Cotton Bowl Classic — News", url: "https://www.cottonbowl.com/news", source_type: "official_event", group: "sports", default_city: "Arlington", max_detail_pages: 4 }),

  // ── Instagram (official Graph API Business Discovery; needs IG_USER_ID + IG_ACCESS_TOKEN) ──
  ...[
    "dallasites101",
    "dallasmoms",
    "dfwchild",
    "visitdallas",
    "klydewarrenpark",
    "dallasarboretum",
    "dallaszoo",
    "perotmuseum",
    "do214",
    "dallasobserver",
    "dmagazine",
    "culturemapdallas",
  ].map((username) =>
    def({
      id: `ig-${username}`,
      name: `Instagram @${username}`,
      url: `https://www.instagram.com/${username}/`,
      source_type: "local_calendar",
      group: "social",
      feeder: "instagram",
      instagram_username: username,
      max_detail_pages: 0,
    }),
  ),

  // ── Reddit communities (official OAuth API; needs REDDIT_CLIENT_ID + REDDIT_CLIENT_SECRET) ──
  ...["Dallas", "askdfw", "dfw", "FortWorth", "Plano"].map((subreddit) =>
    def({
      id: `reddit-${subreddit.toLowerCase()}`,
      name: `Reddit r/${subreddit}`,
      url: `https://www.reddit.com/r/${subreddit}/`,
      source_type: "local_calendar",
      group: "social",
      feeder: "reddit",
      subreddit,
      max_detail_pages: 0,
    }),
  ),

  // ── Public Facebook events (via AllEvents, which indexes public Facebook event pages) ──
  def({ id: "allevents-dallas-month", name: "AllEvents — Dallas this month", url: "https://allevents.in/dallas/{monthName}", source_type: "local_calendar", group: "social", max_detail_pages: 0, rolling_months: 2 }),
  def({ id: "allevents-dallas-all", name: "AllEvents — Dallas", url: "https://allevents.in/dallas/all", source_type: "local_calendar", group: "social", max_detail_pages: 0 }),

  // ── National coveted experiences ────────────────────────────────────────────
  def({ id: "masters", name: "The Masters — Tickets", url: "https://www.masters.com/en_US/tournament/tickets.html", source_type: "official_event", group: "national" }),
  def({ id: "us-open", name: "U.S. Open — Tickets", url: "https://www.usopen.com/2027/tickets.html", source_type: "official_event", group: "national" }),
  def({ id: "pga-championship", name: "PGA Championship — Tickets", url: "https://www.pgachampionship.com/tickets", source_type: "official_event", group: "national" }),
  def({ id: "pga-registry", name: "PGA Championship — Ticket Registry FAQ", url: "https://www.pgachampionship.com/ticket-registry-faqs-2027", source_type: "official_event", group: "national" }),
  def({ id: "the-open", name: "The Open — Tickets", url: "https://www.theopen.com/latest/ticket-ballot-st-andrews-2027-open", source_type: "official_event", group: "national" }),
  def({ id: "ryder-cup", name: "Ryder Cup — Tickets", url: "https://www.rydercup.com/news-media/tickets-to-go-on-sale-for-the-2027-ryder-cup", source_type: "official_event", group: "national" }),
  def({ id: "la28", name: "LA28 Tickets", url: "https://la28.org/en/faqs/how-can-I-buy-tickets-to-the-la28-olympic-and-paralympic-games.html", source_type: "official_event", group: "national" }),
  def({ id: "wimbledon", name: "Wimbledon Ballot (LTA)", url: "https://www.lta.org.uk/fan-zone/grand-slam/wimbledon-championships/ballots/", source_type: "official_organization", group: "national" }),
  def({ id: "banana-ball", name: "Savannah Bananas — Tickets", url: "https://thesavannahbananas.com/tickets/", source_type: "official_ticketing", group: "national" }),
  // Selective public access: White House, Capitol and landmark openings (lotteries, request-only tours).
  def({ id: "nps-whho-calendar", name: "President's Park (NPS) — Calendar", url: "https://www.nps.gov/whho/planyourvisit/calendar.htm", source_type: "official_municipal", group: "national", max_detail_pages: 6 }),
  def({ id: "nps-wh-garden-tours", name: "White House Garden Tours (NPS)", url: "https://www.nps.gov/whho/planyourvisit/white-house-garden-tours.htm", source_type: "official_municipal", group: "national" }),
  def({ id: "nps-national-christmas-tree", name: "National Christmas Tree (NPS)", url: "https://www.nps.gov/whho/planyourvisit/national-christmas-tree.htm", source_type: "official_municipal", group: "national" }),
  def({ id: "whitehouse-visit", name: "The White House — Visit", url: "https://www.whitehouse.gov/visit/", source_type: "official_organization", group: "national" }),
  def({ id: "aoc-capitol-tree", name: "U.S. Capitol Christmas Tree (Architect of the Capitol)", url: "https://www.aoc.gov/about-us/news-notices/capitol-christmas-tree", source_type: "official_organization", group: "national" }),
  def({ id: "rockefeller-tree", name: "Rockefeller Center Christmas Tree", url: "https://www.rockefellercenter.com/holidays/rockefeller-center-christmas-tree/", source_type: "official_venue", group: "national" }),
  def({ id: "mount-vernon", name: "George Washington's Mount Vernon — Calendar", url: "https://www.mountvernon.org/plan-your-visit/calendar", source_type: "official_venue", group: "national" }),
  def({ id: "biltmore-candlelight", name: "Biltmore — Candlelight Christmas Evenings", url: "https://www.biltmore.com/candlelight-christmas-evenings", source_type: "official_venue", group: "national" }),
  def({ id: "ksc-launch-viewing", name: "Kennedy Space Center — Launch Viewing", url: "https://www.kennedyspacecenter.com/launches-and-events/see-a-launch/launch-viewing/", source_type: "official_venue", group: "national" }),
  // Bucket-list sports and spectacles with limited tickets.
  def({ id: "kentucky-derby", name: "Kentucky Derby — 2027 Tickets", url: "https://www.kentuckyderby.com/tickets/2027/", source_type: "official_event", group: "national" }),
  def({ id: "pga-2027-frisco", name: "2027 PGA Championship (PGA Frisco) — Tickets", url: "https://www.pgachampionship.com/tickets-2027", source_type: "official_event", group: "national" }),
  def({ id: "rose-bowl", name: "Rose Bowl Game — News", url: "https://rosebowlgame.com/news/2026/9/1/general-the-pasadena-tournament-of-roses-announces-public-ticket-sale-for-the-2027-cfp-quarterfinal-at-the-rose-bowl-game-presented-by-prudential.aspx", source_type: "official_event", group: "national" }),
  def({ id: "nfl-draft", name: "NFL Draft 2027 (Washington, D.C.)", url: "https://www.nfl.com/news/nfl-announces-dates-for-2027-draft-in-washington-d-c", source_type: "official_organization", group: "national" }),
];

export function sourceById(id: string): Source | undefined {
  return SOURCES.find((s) => s.id === id);
}

const MONTH_NAMES = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];

/**
 * Expand month-templated sources into one source per month of the rolling window, so monthly
 * guides are always read for this month and the next ones without editing the registry.
 */
export function expandRollingSources(sources: Source[], today: string): Source[] {
  const out: Source[] = [];
  const [y, m] = today.split("-").map(Number);
  for (const s of sources) {
    if (!/\{monthName\}|\{year\}/.test(s.url)) {
      out.push(s);
      continue;
    }
    for (let i = 0; i < (s.rolling_months ?? 1); i++) {
      const monthIndex = (m - 1 + i) % 12;
      const year = y + Math.floor((m - 1 + i) / 12);
      const name = MONTH_NAMES[monthIndex];
      out.push({
        ...s,
        id: i === 0 ? s.id : `${s.id}+${i}`,
        url: s.url.replaceAll("{monthName}", name).replaceAll("{year}", String(year)),
      });
    }
  }
  return out;
}
