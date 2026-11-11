async function getDrugData() {
  const url =
    "https://api.fda.gov/drug/event.json?search=patient.drug.medicinalproduct:warfarin&limit=20";

  const response = await fetch(url);
  const content = await response.json();

  console.log("Total reports:", content.meta.results.total);

  content.results.forEach(function (report) {
    // Check whether warfarin is in this report
    let hasWarfarin = report.patient.drug.some(function (drug) {
      return drug.medicinalproduct.toLowerCase().includes("warfarin");
    });

    // Check whether ibuprofen is in this report
    let hasIbuprofen = report.patient.drug.some(function (drug) {
      return drug.medicinalproduct.toLowerCase().includes("ibuprofen");
    });

    // Check whether BOTH drugs are present
    if (hasWarfarin && hasIbuprofen) {
      console.log("\nBoth drugs found!");
      console.log("Report ID:", report.safetyreportid);

      report.patient.reaction.forEach(function (reaction) {
        console.log("Adverse reaction:", reaction.reactionmeddrapt);
      });
    }
  });
}

getDrugData();
