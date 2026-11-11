async function checkDrugInteraction(drug1, drug2) {
  // STEP 1: Prepare API URL
  const search = `openfda.generic_name:"${drug1.toUpperCase()}"`;

  const url = `https://api.fda.gov/drug/label.json?search=${encodeURIComponent(search)}&limit=1`;

  // STEP 2: Fetch drug label
  const response = await fetch(url);

  if (!response.ok) {
    console.log("Could not find a drug label for " + drug1);
    return;
  }

  const content = await response.json();
  const label = content.results[0];

  console.log("\nChecking:", drug1, "+", drug2);

  // STEP 3: Check interaction section
  if (!label.drug_interactions) {
    console.log("No drug interaction section available.");
    return;
  }

  const interactionText = label.drug_interactions.join(" ");

  // STEP 4: Find sentences mentioning the second drug
  const sentences = interactionText.split(/(?<=[.!?])\s+/);

  const matchingSentences = [];

  for (let i = 0; i < sentences.length; i++) {
    if (sentences[i].toLowerCase().includes(drug2.toLowerCase())) {
      matchingSentences.push(sentences[i].trim());

      // Also include the preceding sentence for context
      if (i > 0) {
        matchingSentences.push(sentences[i - 1].trim());
      }
    }
  }

  // STEP 5: Remove duplicate sentences
  const uniqueSentences = [...new Set(matchingSentences)];

  // STEP 6: Display results
  if (uniqueSentences.length > 0) {
    console.log("\nPotential interaction information found!");

    uniqueSentences.forEach(function (sentence) {
      console.log("\n" + sentence);
    });
  } else {
    console.log(
      "\nNo mention of " + drug2 + " found in the interaction section.",
    );
  }
}

// TEST
checkDrugInteraction("warfarin", "ibuprofen");
