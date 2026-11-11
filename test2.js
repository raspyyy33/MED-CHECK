async function getDrugLabel(drugName) {
  // STEP 1: Prepare API URL
  const search = `openfda.generic_name:"${drugName.toUpperCase()}"`;

  const url = `https://api.fda.gov/drug/label.json?search=${encodeURIComponent(search)}&limit=1`;

  // STEP 2: Fetch drug label
  const response = await fetch(url);

  if (!response.ok) {
    console.log("Could not find a drug label for " + drugName);
    return;
  }

  const content = await response.json();

  // STEP 3: Extract label
  const label = content.results[0];

  return label;
}

function findDrugMention(label, drugName) {
  // Check whether the label has an interaction section
  if (!label || !label.drug_interactions) {
    return false;
  }

  // Combine all interaction text
  const interactionText = label.drug_interactions.join(" ");

  // Search for the drug name
  return interactionText.toLowerCase().includes(drugName.toLowerCase());
}

function findRelevantWarnings(label) {
  if (!label || !label.warnings) {
    return [];
  }

  const warningText = label.warnings.join(" ").toLowerCase();

  const keywords = [
    "anticoagulant",
    "blood thinning",
    "blood thinner",
    "bleeding",
  ];

  let foundKeywords = [];

  keywords.forEach(function (keyword) {
    if (warningText.includes(keyword)) {
      foundKeywords.push(keyword);
    }
  });

  return foundKeywords;
}

function extractRelevantWarnings(label) {
  if (!label || !label.warnings) {
    return [];
  }

  const warningText = label.warnings.join(" ");

  // Divide warning text into sentences
  const sentences = warningText.split(/(?<=[.!?])\s+/);

  const keywords = [
    "anticoagulant",
    "blood thinning",
    "blood thinner",
    "bleeding",
  ];

  // Find sentences containing relevant keywords
  const relevantSentences = sentences.filter(function (sentence) {
    return keywords.some(function (keyword) {
      return sentence.toLowerCase().includes(keyword);
    });
  });

  // Remove duplicate sentences
  return [...new Set(relevantSentences)];
}

async function checkDrugInteraction(drug1, drug2) {
  // STEP 1: Retrieve both drug labels
  const label1 = await getDrugLabel(drug1);
  const label2 = await getDrugLabel(drug2);

  if (!label1 || !label2) {
    console.log("Could not retrieve both drug labels.");
    return;
  }

  // STEP 2: Check for direct drug-name mentions
  const mention1 = findDrugMention(label1, drug2);
  const mention2 = findDrugMention(label2, drug1);

  // STEP 3: Extract relevant warnings from both labels
  const warnings1 = extractRelevantWarnings(label1);
  const warnings2 = extractRelevantWarnings(label2);

  // STEP 4: Display report
  console.log("\n==================================");
  console.log("       DRUGCHECK REPORT");
  console.log("==================================");

  console.log("\nDrugs:", drug1, "+", drug2);

  console.log("\n--- DIRECT LABEL MENTIONS ---");

  console.log(drug1 + " label mentions " + drug2 + ":", mention1);

  console.log(drug2 + " label mentions " + drug1 + ":", mention2);

  console.log("\n--- RELEVANT WARNINGS ---");

  console.log("\nWarnings from " + drug1 + " label:");

  if (warnings1.length > 0) {
    warnings1.forEach(function (sentence) {
      console.log("- " + sentence.trim());
    });
  } else {
    console.log("No matching warning keywords found.");
  }

  console.log("\nWarnings from " + drug2 + " label:");

  if (warnings2.length > 0) {
    warnings2.forEach(function (sentence) {
      console.log("- " + sentence.trim());
    });
  } else {
    console.log("No matching warning keywords found.");
  }

  console.log("\n==================================");
}

function extractAdverseEffects(label) {
  if (!label) {
    return [];
  }

  // Collect relevant sections
  let text = "";

  if (label.adverse_reactions) {
    text += label.adverse_reactions.join(" ");
  }

  if (label.warnings) {
    text += " " + label.warnings.join(" ");
  }

  // Divide text into sentences
  const sentences = text.split(/(?<=[.!?])\s+/);

  // Keywords related to potential adverse effects
  const keywords = [
    "bleeding",
    "hemorrhage",
    "haemorrhage",
    "bruising",
    "gastrointestinal",
    "stomach bleeding",
  ];

  // Extract matching sentences
  const results = sentences.filter(function (sentence) {
    return keywords.some(function (keyword) {
      return sentence.toLowerCase().includes(keyword);
    });
  });

  // Remove duplicate sentences
  return [...new Set(results)];
}

function extractPairEvidence(label, otherDrug) {
  if (!label) {
    return [];
  }

  const sections = ["drug_interactions", "warnings", "adverse_reactions"];

  let evidence = [];

  const classKeywords = [
    "anticoagulant",
    "blood thinning",
    "blood thinner",
    "non-steroidal anti-inflammatory",
    "nsaid",
  ];

  const effectKeywords = ["bleeding", "hemorrhage", "haemorrhage", "bruising"];

  sections.forEach(function (sectionName) {
    if (!label[sectionName]) {
      return;
    }

    const text = label[sectionName].join(" ");
    const sentences = text.split(/(?<=[.!?])\s+/);

    sentences.forEach(function (sentence) {
      const lowerSentence = sentence.toLowerCase();

      const directMention = lowerSentence.includes(otherDrug.toLowerCase());

      const classMention = classKeywords.some(function (keyword) {
        return lowerSentence.includes(keyword);
      });

      const effectMention = effectKeywords.some(function (keyword) {
        return lowerSentence.includes(keyword);
      });

      if (directMention && effectMention) {
        evidence.push({
          section: sectionName,
          text: sentence.trim(),
          evidenceType: "Direct drug mention",
        });
      } else if (classMention && effectMention) {
        evidence.push({
          section: sectionName,
          text: sentence.trim(),
          evidenceType: "Drug-class warning",
        });
      }
    });
  });

  return [
    ...new Set(
      evidence.map(function (item) {
        return JSON.stringify(item);
      }),
    ),
  ].map(function (item) {
    return JSON.parse(item);
  });
}

// TEST

async function test() {
  const label1 = await getDrugLabel("warfarin");
  const label2 = await getDrugLabel("ibuprofen");

  const evidence1 = extractPairEvidence(label1, "ibuprofen");
  const evidence2 = extractPairEvidence(label2, "warfarin");

  console.log("\nWARFARIN LABEL EVIDENCE:");
  console.log(evidence1);

  console.log("\nIBUPROFEN LABEL EVIDENCE:");
  console.log(evidence2);
}

test();
