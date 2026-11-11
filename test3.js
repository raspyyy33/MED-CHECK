// DrugCheck: openFDA label + adverse event lookup
// Works in the browser and in Node 18+ (built-in fetch).
// NOT medical advice. A text match that finds nothing does not mean a combination is safe.

const BASE = "https://api.fda.gov/drug";
// Optional: free key from https://open.fda.gov/apis/authentication/ raises rate limits
const API_KEY = ""; // e.g. "abc123"

// ---------- HTTP ----------

async function fetchJson(url) {
  const finalUrl = API_KEY ? `${url}&api_key=${API_KEY}` : url;
  try {
    const res = await fetch(finalUrl);
    if (res.status === 404) return null; // openFDA uses 404 for "no matches"
    if (!res.ok) throw new Error(`openFDA error ${res.status}`);
    return await res.json();
  } catch (err) {
    console.error("Request failed:", err.message);
    return null;
  }
}

// ---------- Label retrieval ----------

async function getDrugLabel(drugName) {
  const search = `openfda.generic_name:"${drugName}" AND _exists_:adverse_reactions`;
  const url = `${BASE}/label.json?search=${encodeURIComponent(search)}&limit=5`;
  const data = await fetchJson(url);
  const results = data?.results ?? [];

  // Prefer a label that also has an interactions section
  return results.find((r) => r.drug_interactions) ?? results[0] ?? null;
}

// ---------- Text cleaning ----------

function cleanLabelText(text) {
  return text
    .replace(/\s+/g, " ")
    .replace(/\b\d+\.\d+(\.\d+)*\s+(?=[A-Z])/g, "") // strip "6.1 " style section numbers
    .trim();
}

function splitSentences(text) {
  // Protect common abbreviations from the splitter
  const safe = text.replace(/\b(e\.g|i\.e|vs|approx|Fig|Tab)\./gi, "$1§");
  return safe
    .split(/(?<=[.!?])\s+(?=[A-Z])/) // only split before a capital letter
    .map((s) => s.replace(/§/g, ".").trim())
    .filter((s) => s.length > 20);
}

// Pull one or more label fields (arrays of strings) into clean sentences
function getSection(label, fieldNames) {
  return fieldNames
    .flatMap((name) => label?.[name] ?? [])
    .map(cleanLabelText)
    .flatMap(splitSentences);
}

// ---------- Adverse effects (works for any drug) ----------

function extractAdverseEffects(label, maxSentences = 15) {
  if (!label) return { boxed: [], adverse: [] };
  return {
    boxed: getSection(label, ["boxed_warning"]),
    adverse: getSection(label, ["adverse_reactions"]).slice(0, maxSentences),
  };
}

// ---------- Pair evidence ----------

function namesFor(label, typed) {
  const o = label?.openfda ?? {};
  const names = [typed, ...(o.generic_name ?? []), ...(o.brand_name ?? [])];
  return [...new Set(names.map((n) => n.toLowerCase()))];
}

const CLASS_KEYWORDS = [
  "anticoagulant",
  "blood thinning",
  "blood thinner",
  "non-steroidal anti-inflammatory",
  "nsaid",
];

const EFFECT_KEYWORDS = ["bleeding", "hemorrhage", "haemorrhage", "bruising"];

const EVIDENCE_SECTIONS = [
  "boxed_warning",
  "drug_interactions",
  "warnings_and_cautions",
  "warnings",
  "adverse_reactions",
];

// label: the label to search. otherLabel: the other drug's label (for its brand/generic names).
function extractPairEvidence(label, otherLabel, otherDrug) {
  if (!label) return [];

  const otherNames = namesFor(otherLabel, otherDrug);
  const seen = new Map();

  EVIDENCE_SECTIONS.forEach((sectionName) => {
    getSection(label, [sectionName]).forEach((sentence) => {
      const lower = sentence.toLowerCase();

      const directMention = otherNames.some((n) => lower.includes(n));
      const classMention = CLASS_KEYWORDS.some((k) => lower.includes(k));
      const effectMention = EFFECT_KEYWORDS.some((k) => lower.includes(k));

      let evidenceType = null;
      if (directMention) {
        evidenceType = "Direct drug mention";
      } else if (classMention && effectMention) {
        evidenceType = "Drug-class warning";
      }

      if (evidenceType) {
        const key = `${sectionName}|${sentence}`;
        if (!seen.has(key)) {
          seen.set(key, { section: sectionName, text: sentence, evidenceType });
        }
      }
    });
  });

  return [...seen.values()];
}

// ---------- FAERS (structured adverse events) ----------

// Most frequently reported reactions in reports that list ALL the given drugs.
// FAERS is voluntary reporting: counts show co-reported events, not proven causation or rates.
async function getTopReactions(drugs, limit = 10) {
  const search = drugs
    .map((d) => `patient.drug.openfda.generic_name:"${d}"`)
    .join(" AND ");
  const url =
    `${BASE}/event.json?search=${encodeURIComponent(search)}` +
    `&count=patient.reaction.reactionmeddrapt.exact&limit=${limit}`;
  const data = await fetchJson(url);
  return data?.results ?? []; // [{ term: "HAEMORRHAGE", count: 123 }, ...]
}

// ---------- Report ----------

function printList(items, emptyMessage) {
  if (items.length === 0) {
    console.log(emptyMessage);
    return;
  }
  items.forEach((item) => console.log("- " + item));
}

function printEvidence(evidence) {
  if (evidence.length === 0) {
    console.log("No matching evidence found in this label.");
    return;
  }
  evidence.forEach((e) => {
    console.log(`- [${e.evidenceType} | ${e.section}] ${e.text}`);
  });
}

async function checkDrugInteraction(drug1, drug2) {
  const [label1, label2] = await Promise.all([
    getDrugLabel(drug1),
    getDrugLabel(drug2),
  ]);

  if (!label1 || !label2) {
    console.log("Could not retrieve both drug labels.");
    if (!label1) console.log(" - No label found for " + drug1);
    if (!label2) console.log(" - No label found for " + drug2);
    return;
  }

  const evidence1 = extractPairEvidence(label1, label2, drug2);
  const evidence2 = extractPairEvidence(label2, label1, drug1);

  const effects1 = extractAdverseEffects(label1);
  const effects2 = extractAdverseEffects(label2);

  const topReactions = await getTopReactions([drug1, drug2]);

  console.log("\n==================================");
  console.log("       DRUGCHECK REPORT");
  console.log("==================================");
  console.log("\nDrugs:", drug1, "+", drug2);

  console.log(`\n--- EVIDENCE IN ${drug1.toUpperCase()} LABEL ---`);
  printEvidence(evidence1);

  console.log(`\n--- EVIDENCE IN ${drug2.toUpperCase()} LABEL ---`);
  printEvidence(evidence2);

  [
    [drug1, effects1],
    [drug2, effects2],
  ].forEach(([name, effects]) => {
    console.log(`\n--- ${name.toUpperCase()}: BOXED WARNING ---`);
    printList(effects.boxed, "No boxed warning.");
    console.log(`\n--- ${name.toUpperCase()}: ADVERSE REACTIONS (label) ---`);
    printList(effects.adverse, "No adverse reactions section.");
  });

  console.log(
    `\n--- TOP REPORTED REACTIONS WHEN BOTH DRUGS APPEAR (FAERS) ---`,
  );
  if (topReactions.length === 0) {
    console.log("No adverse event reports found for this combination.");
  } else {
    topReactions.forEach((r) => console.log(`- ${r.term}: ${r.count} reports`));
    console.log(
      "(Voluntary reports: shows co-reported events, not proven causation or rates.)",
    );
  }

  console.log("\nThis is not medical advice. Consult a pharmacist or doctor.");
  console.log("==================================\n");
}

// ---------- Test ----------

checkDrugInteraction("warfarin", "ibuprofen");
