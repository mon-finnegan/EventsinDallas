import type { SourceType } from "../types";

export interface Source {
  id: string;
  name: string;
  url: string;
  source_type: SourceType;
  /** Church/religious community institution (spec §20). */
  is_church: boolean;
  /** National coveted-experience source (spec §8). */
  is_national: boolean;
}

/**
 * Starting source registry. The pipeline fetches each page daily and lets the extractor find
 * dated events; add sources here (or in the `sources` table) rather than hard-coding events.
 * Prefer official pages (spec §26).
 */
export const SOURCES: Source[] = [
  // Churches & religious community institutions
  { id: "prestoncrest", name: "Prestoncrest Church of Christ", url: "https://prestoncrest.org/events/pumpkinfest/", source_type: "official_organization", is_church: true, is_national: false },
  { id: "first-dallas", name: "First Baptist Dallas", url: "https://firstdallas.org/", source_type: "official_organization", is_church: true, is_national: false },
  { id: "greek-fest", name: "Greek Food Festival of Dallas", url: "https://greekfestivalofdallas.com/", source_type: "official_event", is_church: true, is_national: false },
  { id: "lebanese-fest", name: "DFW Lebanese Food Festival", url: "https://dfwlebanesefoodfest.com/", source_type: "official_event", is_church: true, is_national: false },
  { id: "cathdal", name: "Catholic Diocese of Dallas — Events", url: "https://www.cathdal.org/events", source_type: "official_organization", is_church: true, is_national: false },

  // Dallas venues
  { id: "klyde-warren", name: "Klyde Warren Park", url: "https://www.klydewarrenpark.org/events-programming", source_type: "official_venue", is_church: false, is_national: false },
  { id: "arboretum", name: "Dallas Arboretum", url: "https://www.dallasarboretum.org/events-activities/calendar/", source_type: "official_venue", is_church: false, is_national: false },
  { id: "dallas-zoo", name: "Dallas Zoo", url: "https://www.dallaszoo.com/dallas-zoo-events/", source_type: "official_venue", is_church: false, is_national: false },
  { id: "fort-worth-zoo", name: "Fort Worth Zoo", url: "https://www.fortworthzoo.org/boo-at-the-zoo", source_type: "official_venue", is_church: false, is_national: false },
  { id: "perot", name: "Perot Museum of Nature and Science", url: "https://www.perotmuseum.org/", source_type: "official_venue", is_church: false, is_national: false },
  { id: "adolphus-tea", name: "The Adolphus — Tea", url: "https://www.adolphus.com/restaurants-bars/tea-at-the-adolphus", source_type: "official_venue", is_church: false, is_national: false },
  { id: "galleria", name: "Galleria Dallas", url: "https://galleriadallas.com/holiday-2026", source_type: "official_venue", is_church: false, is_national: false },
  { id: "rmh-trains", name: "The Trains at NorthPark", url: "https://rmhdallas.org/event/the-trains-at-northpark/", source_type: "official_organization", is_church: false, is_national: false },
  { id: "big-tex", name: "State Fair of Texas", url: "https://bigtex.com/", source_type: "official_event", is_church: false, is_national: false },
  { id: "visit-dallas", name: "Visit Dallas — Annual Events", url: "https://www.visitdallas.com/events/annual-events/", source_type: "official_municipal", is_church: false, is_national: false },

  // National coveted experiences
  { id: "masters", name: "The Masters — Tickets", url: "https://www.masters.com/en_US/tournament/tickets.html", source_type: "official_event", is_church: false, is_national: true },
  { id: "us-open", name: "U.S. Open — Tickets", url: "https://www.usopen.com/2027/tickets.html", source_type: "official_event", is_church: false, is_national: true },
  { id: "pga-championship", name: "PGA Championship", url: "https://www.pgachampionship.com/tickets", source_type: "official_event", is_church: false, is_national: true },
  { id: "ryder-cup", name: "Ryder Cup — Tickets", url: "https://www.rydercup.com/tickets", source_type: "official_event", is_church: false, is_national: true },
  { id: "la28", name: "LA28 Tickets", url: "https://la28.org/en/tickets.html", source_type: "official_event", is_church: false, is_national: true },
  { id: "banana-ball", name: "Savannah Bananas — Tickets", url: "https://thesavannahbananas.com/tickets/", source_type: "official_ticketing", is_church: false, is_national: true },
];
