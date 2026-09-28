// The last nine rows were initially recorded as Sep 27 in the source workbook,
// then corrected to Sep 28. Keep the shipped seed history aligned with the workbook.
importedFoods.slice(-9).forEach(food => { food.date = '2026-09-28'; });
