async function checkAdverseEffects(drug1, drug2) {
  const query = `patient.drug.medicinalproduct:"${drug1}"
    AND patient.drug.medicinalproduct:"${drug2}"`;

  const url =
    "https://api.fda.gov/drug/event.json?" +
    "search=" +
    encodeURIComponent(query) +
    "&limit=10";

  try {
    const response = await fetch(url);

    if (!response.ok) {
      console.log("No matching reports found.");
      return;
    }

    const content = await response.json();

    // Go through the returned reports
    content.results.forEach(function (report) {
      report.patient.reaction.forEach(function (reaction) {
        console.log(reaction.reactionmeddrapt);
      });
    });
  } catch (error) {
    console.log("Something went wrong:", error);
  }
}

// Test the function
checkAdverseEffects("warfarin", "ibuprofen");
