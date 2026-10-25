# Scarlet Graphics Costing

Simpleng app para sa listahan ng items/materials at products, at para ma-compute ang costing at selling price.

## Paano gamitin

Buksan lang ang `index.html` sa browser (walang kailangang i-install). Pwede rin itong i-host sa GitHub Pages.

1. **Items / Materials**: ilista ang bawat material, unit (pc, sheet, sqft, ml...) at cost per unit.
2. **Products**: gumawa ng product, piliin ang mga materials at quantity, tapos ilagay ang waste %, labor, overhead % at markup %.
3. Makikita agad ang breakdown, selling price, tubo at margin, pati total para sa isang order (ilang piraso).
4. **Backup**: i-export/i-import ang data bilang JSON, i-export ang costing bilang CSV, o i-paste ang items mula sa Google Sheets/Excel.

Naka-save ang data sa browser na ginamit, kaya mag-export paminsan-minsan bilang backup.

## Formula

```
Materials   = Σ (qty × cost per unit)
Waste       = Materials × waste %
Overhead    = (Materials + Waste + Labor) × overhead %
Total cost  = Materials + Waste + Labor + Overhead
Selling     = Total cost × (1 + markup %)
```

## Tests

```
node --test tests/costing.test.js
```
