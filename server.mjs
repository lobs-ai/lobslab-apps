import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = __dirname;
const PORT = Number.parseInt(process.env.PORT ?? "4317", 10);
const BASE_URL = "https://www.crapuler.com";
const INDEX_TTL_MS = 10 * 60_000;

// ── Shared cookie ─────────────────────────────────────────────────────────────

function parseCookies(header) {
  const cookies = {};
  if (!header) return cookies;
  for (const pair of header.split(";")) {
    const [key, ...rest] = pair.trim().split("=");
    if (key) cookies[key.trim()] = rest.join("=").trim();
  }
  return cookies;
}

/** Read the shared lobslab_id from the request cookie. Returns null if not set. */
function getLobslabId(req) {
  return parseCookies(req.headers.cookie)["lobslab_id"] ?? null;
}

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

const cache = {
  terms: null,
  termIndexes: new Map(),
};

createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname === "/api/me") {
      const id = getLobslabId(req);
      sendJson(res, 200, { lobslab_id: id });
      return;
    }
    if (url.pathname.startsWith("/api/")) {
      await handleApi(url, res);
      return;
    }
    await handleStatic(url, res);
  } catch (error) {
    console.error(error);
    sendJson(res, 500, { error: error.message });
  }
}).listen(PORT, () => {
  console.log(`Less Crapuler running at http://localhost:${PORT}`);
});

async function handleApi(url, res) {
  if (url.pathname === "/api/terms") {
    const terms = await getTerms();
    sendJson(res, 200, terms);
    return;
  }

  if (url.pathname === "/api/search") {
    const termCode = url.searchParams.get("termCode");
    const q = (url.searchParams.get("q") ?? "").trim();
    const limit = Number.parseInt(url.searchParams.get("limit") ?? "20", 10);
    if (!termCode || !q) {
      sendJson(res, 200, { results: [] });
      return;
    }
    const exactCourse = q.match(/^([A-Za-z&]+)\s+(\d+[A-Za-z]?)$/);
    const searchPayload = exactCourse
      ? await searchByCourseCode(termCode, exactCourse[1].toUpperCase(), exactCourse[2], limit)
      : await searchByIndex(termCode, q, limit);
    sendJson(res, 200, {
      indexedAt: Date.now(),
      total: searchPayload.total,
      results: searchPayload.results,
    });
    return;
  }

  if (url.pathname === "/api/course") {
    const termCode = url.searchParams.get("termCode");
    const termShort = url.searchParams.get("termShort");
    const schoolCode = url.searchParams.get("schoolCode");
    const subjectCode = url.searchParams.get("subjectCode");
    const catalogNumber = url.searchParams.get("catalogNumber");
    if (!termCode || !termShort || !schoolCode || !subjectCode || !catalogNumber) {
      sendJson(res, 400, { error: "Missing course params" });
      return;
    }
    const payload = await loadCourse({
      termCode,
      termShort,
      schoolCode,
      subjectCode,
      catalogNumber,
    });
    sendJson(res, 200, payload);
    return;
  }

  sendJson(res, 404, { error: "Not found" });
}

async function handleStatic(url, res) {
  const pathname = url.pathname === "/" ? "/index.html" : url.pathname;
  const safePath = path.normalize(path.join(ROOT, pathname));
  if (!safePath.startsWith(ROOT)) {
    sendText(res, 403, "Forbidden");
    return;
  }
  try {
    const body = await readFile(safePath);
    const ext = path.extname(safePath).toLowerCase();
    res.writeHead(200, {
      "content-type": mimeTypes[ext] ?? "application/octet-stream",
      "cache-control": "public, max-age=300",
    });
    res.end(body);
  } catch {
    res.writeHead(404, { "cache-control": "no-store" });
    res.end("Not found");
  }
}

async function getTerms() {
  if (cache.terms) {
    return cache.terms;
  }
  cache.terms = (await fetchRawTerms()).map((term) => ({
    termCode: term.TermCode,
    termDescr: term.TermDescr,
    termShort: term.TermShortDescr,
  }));
  return cache.terms;
}

async function ensureTermIndex(termCode) {
  const cached = cache.termIndexes.get(termCode);
  if (cached?.indexedAt && Date.now() - cached.indexedAt < INDEX_TTL_MS) {
    return cached;
  }

  const terms = await fetchRawTerms();
  const term = terms.find((entry) => String(entry.TermCode) === String(termCode));
  if (!term) {
    throw new Error(`Unknown term ${termCode}`);
  }

  const schools = await fetchJson(`/schools/${termCode}`);
  const subjectPayloads = await mapLimit(
    schools,
    6,
    async (school) => ({
      school,
      subjects: await fetchJson(`/subjects/${termCode}/${school.SchoolCode}`),
    }),
  );

  const courses = [];
  await mapLimit(subjectPayloads, 8, async ({ school, subjects }) => {
    await mapLimit(subjects, 8, async (subject) => {
      const catalog = await fetchJson(
        `/catalog_numbers/${termCode}/${school.SchoolCode}/${subject.SubjectCode}`,
      );
      for (const course of catalog) {
        courses.push({
          key: `${term.TermShortDescr}:${school.SchoolCode}:${subject.SubjectCode}:${course.CatalogNumber}`,
          courseId: `${subject.SubjectCode} ${course.CatalogNumber}`,
          courseDescr: decodeEntities(course.CourseDescr),
          termCode: term.TermCode,
          termDescr: term.TermDescr,
          termShort: term.TermShortDescr,
          schoolCode: school.SchoolCode,
          schoolDescr: school.SchoolDescr,
          subjectCode: subject.SubjectCode,
          catalogNumber: String(course.CatalogNumber),
        });
      }
    });
  });

  const indexed = {
    indexedAt: Date.now(),
    termCode: term.TermCode,
    termDescr: term.TermDescr,
    termShort: term.TermShortDescr,
    courses: courses.sort((a, b) => a.courseId.localeCompare(b.courseId) || a.schoolCode.localeCompare(b.schoolCode)),
  };
  cache.termIndexes.set(String(termCode), indexed);
  return indexed;
}

async function loadCourse({ termCode, termShort, schoolCode, subjectCode, catalogNumber }) {
  const courseUrlPath = `/course/${termShort}/${subjectCode}/${catalogNumber}`;
  const [courseHtml, meetingsXml, rawTerms] = await Promise.all([
    fetchText(courseUrlPath),
    fetchText(`/course_meetings/${termCode}/${schoolCode}/${subjectCode}/${catalogNumber}`),
    fetchRawTerms(),
  ]);

  const meetings = parseMeetings(meetingsXml);
  const descriptionMatch = courseHtml.match(/No Course Description found\.|<\/div>\s*(.*?)\s*<div>\s*[\s\S]*?<table>/i);
  const titleMatch = courseHtml.match(/<div class="h2">\s*([\s\S]*?)<br class="visible-xs"\/>/i);
  const term = rawTerms.find((entry) => String(entry.TermCode) === String(termCode));
  const parsedTitle = cleanText(titleMatch?.[1] ?? "");
  const courseDescr = parsedTitle.replace(new RegExp(`^${subjectCode}\\s+${catalogNumber}\\s*`), "").trim();

  return {
    syncedAt: new Date().toISOString(),
    courseId: `${subjectCode} ${catalogNumber}`,
    courseDescr,
    catalogNumber: String(catalogNumber),
    description: cleanText(descriptionMatch?.[1] ?? "").replace(/^No Course Description found\.$/i, ""),
    schoolCode,
    schoolDescr: schoolCode,
    subjectCode,
    termCode: Number(termCode),
    termDescr: term?.TermDescr ?? termShort,
    termShort,
    courseUrl: `${BASE_URL}${courseUrlPath}`,
    sectionGroups: parseSectionGroups(courseHtml, meetings),
  };
}

async function searchByIndex(termCode, query, limit) {
  const termIndex = await ensureTermIndex(termCode);
  const needle = query.toLowerCase();
  const matches = termIndex.courses
    .filter((course) =>
      [
        course.courseId,
        course.courseDescr,
        course.subjectCode,
        course.schoolDescr,
        course.termDescr,
      ]
        .join(" ")
        .toLowerCase()
        .includes(needle),
    );
  return {
    total: matches.length,
    results: matches.slice(0, limit),
  };
}

async function searchByCourseCode(termCode, subjectCode, catalogNumber, limit) {
  const rawTerms = await fetchRawTerms();
  const term = rawTerms.find((entry) => String(entry.TermCode) === String(termCode));
  if (!term) {
    return [];
  }
  const schools = await fetchJson(`/schools/${termCode}`);
  const results = [];

  await mapLimit(schools, 6, async (school) => {
    if (results.length >= limit) {
      return;
    }
    const subjects = await fetchJson(`/subjects/${termCode}/${school.SchoolCode}`);
    if (!subjects.some((subject) => subject.SubjectCode === subjectCode)) {
      return;
    }
    const courses = await fetchJson(`/catalog_numbers/${termCode}/${school.SchoolCode}/${subjectCode}`);
    for (const course of courses) {
      if (results.length >= limit) {
        break;
      }
      if (String(course.CatalogNumber).startsWith(String(catalogNumber))) {
        results.push({
          key: `${term.TermShortDescr}:${school.SchoolCode}:${subjectCode}:${course.CatalogNumber}`,
          courseId: `${subjectCode} ${course.CatalogNumber}`,
          courseDescr: decodeEntities(course.CourseDescr),
          termCode: term.TermCode,
          termDescr: term.TermDescr,
          termShort: term.TermShortDescr,
          schoolCode: school.SchoolCode,
          schoolDescr: school.SchoolDescr,
          subjectCode,
          catalogNumber: String(course.CatalogNumber),
        });
      }
    }
  });

  return {
    total: results.length,
    results: results.slice(0, limit),
  };
}

async function fetchRawTerms() {
  return fetchJson("/all_terms");
}

function parseSectionGroups(courseHtml, meetings) {
  const groups = [];
  const groupRegex =
    /<span class="total"[\s\S]*?title="([\s\S]*?)"[\s\S]*?>([^<]+)<\/span>[\s\S]*?<table class="table table-responsive-stack" id="table-([^"]+)">([\s\S]*?)<\/table>/g;

  for (const match of courseHtml.matchAll(groupRegex)) {
    const summary = parseSummary(match[1]);
    const groupName = cleanText(match[2]);
    const sections = parseSectionRows(match[4], meetings);
    groups.push({
      name: groupName,
      shortLabel: groupName.replace(/s$/i, ""),
      summary,
      sections,
    });
  }

  return groups;
}

function parseSectionRows(tableHtml, meetings) {
  const bodyMatch = tableHtml.match(/<tbody>([\s\S]*?)<\/tbody>/i);
  if (!bodyMatch) {
    return [];
  }

  return [...bodyMatch[1].matchAll(/<tr>([\s\S]*?)<\/tr>/g)].map((rowMatch) => {
    const cells = [...rowMatch[1].matchAll(/<td>[\s\S]*?<\/td>/g)].map((cell) => cell[0]);
    const sectionInfo = rowMatch[1].match(/\/section_info\/\d+\/[A-Z]+\/(\d+)"/);
    const idMatch = rowMatch[1].match(/data-id="([^"]+)"/);
    const titleMatch = rowMatch[1].match(/data-title="([^"]+)"/);
    const instructors = [...rowMatch[1].matchAll(/data-title="Instructor Information for ([^"]+)"/g)].map(
      (match) => match[1],
    );

    const sectionKey = idMatch?.[1] ?? "";
    const meeting = meetings.get(sectionKey) ?? {};
    const fallbackSectionNumber = sectionKey.split("-")[0] ?? "";

    return {
      sectionNumber: cleanText(stripTags(cells[0]).split("\n")[0]) || fallbackSectionNumber,
      classNumber: sectionInfo?.[1] ?? "",
      topic: parseTopic(titleMatch?.[1] ?? ""),
      instructors,
      times: meeting.times ?? cleanText(stripTags(cells[2])),
      locations: meeting.locations ?? cleanText(stripTags(cells[3])),
      enrolled: parseNumber(cells[4]),
      capacity: parseNumber(cells[5]),
      available: parseNumber(cells[6]),
      waitlist: parseNumber(cells[7]),
      credits: parseNumber(cells[8]),
    };
  });
}

function parseMeetings(xml) {
  const map = new Map();
  const times = [...xml.matchAll(/<times-([^-]+-\d+)>\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*<\/times-\1>/g)];
  const locations = new Map(
    [...xml.matchAll(/<locations-([^-]+-\d+)>\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*<\/locations-\1>/g)].map((match) => [
      match[1],
      cleanText(stripTags(match[2])),
    ]),
  );
  for (const match of times) {
    map.set(match[1], {
      times: cleanText(stripTags(match[2])),
      locations: locations.get(match[1]) ?? "",
    });
  }
  return map;
}

function parseSummary(rawTitle) {
  const text = decodeEntities(rawTitle).replace(/\s+/g, " ").trim();
  return {
    enrolled: pullMetric(text, "Enrolled"),
    waitlist: pullMetric(text, "Waitlist"),
    total: pullMetric(text, "Total"),
    capacity: pullMetric(text, "Capacity"),
    available: pullMetric(text, "Available"),
  };
}

function pullMetric(text, label) {
  const match = text.match(new RegExp(`${label}:\\s*(\\d+)`, "i"));
  return Number.parseInt(match?.[1] ?? "0", 10);
}

function parseTopic(title) {
  if (!title.includes("—")) {
    return "";
  }
  return cleanText(title.split("—")[1] ?? "");
}

function parseNumber(html) {
  const match = stripTags(html).match(/-?\d+/);
  return Number.parseInt(match?.[0] ?? "0", 10);
}

function stripTags(value) {
  return decodeEntities(value.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, " "));
}

function cleanText(value) {
  return value.replace(/\s+/g, " ").trim();
}

function decodeEntities(value) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&mdash;/g, "—")
    .replace(/&#8212;/g, "—");
}

async function fetchJson(pathname) {
  return JSON.parse(await fetchText(pathname));
}

async function fetchText(pathname) {
  const response = await fetch(`${BASE_URL}${pathname}`, {
    headers: {
      "user-agent": "less-crapuler-local",
    },
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch ${pathname}: ${response.status}`);
  }
  return response.text();
}

async function mapLimit(items, limit, mapper) {
  const results = [];
  let index = 0;
  async function worker() {
    while (index < items.length) {
      const currentIndex = index;
      index += 1;
      results[currentIndex] = await mapper(items[currentIndex], currentIndex);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length || 1) }, worker));
  return results;
}

function sendJson(res, status, value) {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  res.end(`${JSON.stringify(value)}\n`);
}

function sendText(res, status, value) {
  res.writeHead(status, { "content-type": "text/plain; charset=utf-8" });
  res.end(value);
}
