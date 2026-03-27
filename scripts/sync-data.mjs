import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const DATA_DIR = path.join(ROOT, "data");
const COURSES_DIR = path.join(DATA_DIR, "courses");
const BASE_URL = "https://www.crapuler.com";

const TERM_LIMIT = Number.parseInt(process.env.CRAPULER_TERM_LIMIT ?? "2", 10);
const SCHOOL_LIMIT = parseOptionalLimit(process.env.CRAPULER_SCHOOL_LIMIT);
const SUBJECT_LIMIT = parseOptionalLimit(process.env.CRAPULER_SUBJECT_LIMIT);
const COURSE_LIMIT = parseOptionalLimit(process.env.CRAPULER_COURSE_LIMIT);
const REQUEST_DELAY_MS = Number.parseInt(process.env.CRAPULER_DELAY_MS ?? "120", 10);

async function main() {
  await mkdir(DATA_DIR, { recursive: true });
  await mkdir(COURSES_DIR, { recursive: true });

  const allTerms = await fetchJson("/all_terms");
  const selectedTerms = allTerms.slice(0, TERM_LIMIT);
  const catalog = [];
  const manifestTerms = [];

  for (const term of selectedTerms) {
    const schools = await limited(fetchJson(`/schools/${term.TermCode}`), SCHOOL_LIMIT);
    manifestTerms.push({
      termCode: term.TermCode,
      termDescr: term.TermDescr,
      termShort: term.TermShortDescr,
      schools: schools.length,
    });

    for (const school of schools) {
      await delay(REQUEST_DELAY_MS);
      const subjects = await limited(
        fetchJson(`/subjects/${term.TermCode}/${school.SchoolCode}`),
        SUBJECT_LIMIT,
      );

      for (const subject of subjects) {
        await delay(REQUEST_DELAY_MS);
        const courses = await limited(
          fetchJson(`/catalog_numbers/${term.TermCode}/${school.SchoolCode}/${subject.SubjectCode}`),
          COURSE_LIMIT,
        );

        for (const course of courses) {
          await delay(REQUEST_DELAY_MS);
          const coursePayload = await buildCoursePayload({
            term,
            school,
            subject,
            course,
          });
          const dataPath = await writeCourseData(coursePayload);
          catalog.push({
            courseId: coursePayload.courseId,
            courseDescr: coursePayload.courseDescr,
            termCode: coursePayload.termCode,
            termDescr: coursePayload.termDescr,
            termShort: coursePayload.termShort,
            schoolCode: coursePayload.schoolCode,
            schoolDescr: coursePayload.schoolDescr,
            subjectCode: coursePayload.subjectCode,
            catalogNumber: coursePayload.catalogNumber,
            dataPath,
          });
          console.log(`synced ${coursePayload.courseId} ${coursePayload.termShort}`);
        }
      }
    }
  }

  const generatedAt = new Date().toISOString();
  await writeJson(path.join(DATA_DIR, "manifest.json"), {
    generatedAt,
    sourceBaseUrl: BASE_URL,
    terms: manifestTerms,
    courses: catalog.length,
  });
  await writeJson(path.join(DATA_DIR, "catalog.json"), {
    generatedAt,
    courses: catalog.sort((a, b) => a.courseId.localeCompare(b.courseId)),
  });
}

async function buildCoursePayload({ term, school, subject, course }) {
  const courseUrlPath = `/course/${term.TermShortDescr}/${subject.SubjectCode}/${course.CatalogNumber}`;
  const [courseHtml, meetingsXml] = await Promise.all([
    fetchText(courseUrlPath),
    fetchText(`/course_meetings/${term.TermCode}/${school.SchoolCode}/${subject.SubjectCode}/${course.CatalogNumber}`),
  ]);

  const meetings = parseMeetings(meetingsXml);
  const descriptionMatch = courseHtml.match(
    /<\/div>\s*(.*?)\s*<div>\s*[\s\S]*?<table>/i,
  );
  const titleMatch = courseHtml.match(/<div class="h2">\s*([\s\S]*?)<br class="visible-xs"\/>/i);
  const sectionGroups = parseSectionGroups(courseHtml, meetings);

  return {
    syncedAt: new Date().toISOString(),
    courseId: `${subject.SubjectCode} ${course.CatalogNumber}`,
    courseDescr: decodeEntities(course.CourseDescr),
    catalogNumber: String(course.CatalogNumber),
    description: cleanText(descriptionMatch?.[1] ?? "").replace(/^No Course Description found\.$/i, ""),
    schoolCode: school.SchoolCode,
    schoolDescr: school.SchoolDescr,
    subjectCode: subject.SubjectCode,
    subjectDescr: subject.SubjectDescr,
    termCode: term.TermCode,
    termDescr: term.TermDescr,
    termShort: term.TermShortDescr,
    courseUrl: `${BASE_URL}${courseUrlPath}`,
    sourceTitle: cleanText(titleMatch?.[1] ?? ""),
    sectionGroups,
  };
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

async function writeCourseData(coursePayload) {
  const directory = path.join(COURSES_DIR, coursePayload.termShort);
  await mkdir(directory, { recursive: true });
  const filename = `${coursePayload.subjectCode}-${coursePayload.catalogNumber}.json`;
  const absolutePath = path.join(directory, filename);
  await writeJson(absolutePath, coursePayload);
  return `./data/courses/${coursePayload.termShort}/${filename}`;
}

async function writeJson(filePath, value) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function fetchJson(pathname) {
  return JSON.parse(await fetchText(pathname));
}

async function fetchText(pathname) {
  const response = await fetch(`${BASE_URL}${pathname}`, {
    headers: {
      "user-agent": "less-crapuler-sync",
    },
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch ${pathname}: ${response.status}`);
  }
  return response.text();
}

async function limited(promise, limit) {
  const value = await promise;
  return Number.isFinite(limit) ? value.slice(0, limit) : value;
}

function parseOptionalLimit(value) {
  if (!value) {
    return Number.POSITIVE_INFINITY;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : Number.POSITIVE_INFINITY;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
