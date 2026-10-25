# Scarlet Graphics Costing

Simpleng app para sa listahan ng items/materials at products, at para ma-compute ang costing at selling price.

## Paano gamitin

Buksan lang ang `index.html` sa browser (walang kailangang i-install). Pwede rin itong i-host sa GitHub Pages.

1. **Price Calculator**: pumili ng category (hal. **Tarpaulin** per sq ft, **Sticker** per sq inch), ilagay ang lapad, haba at ilang piraso. Halimbawa: sticker 2 × 2 in = 4 sq in × presyo per sq in. Pwedeng palitan ang presyo sa calculator mismo para sa discount. May minimum na presyo kada piraso (Tarpaulin: ₱200).
   May category din na **depende sa dami** ang presyo kada piraso, hal. **Mug**: 1-12 pcs ₱150, 13-24 pcs ₱100, 25+ pcs ₱80. Ilagay lang kung ilang piraso.
   Sa **Settings → Presyo ng bawat category** papalitan ang presyo at minimum ng bawat category, at pwedeng magdagdag ng bagong category (per sq ft o per sq inch). Pwede ring mag-paste ng categories galing Excel/Google Sheets na may columns na `Category, Sukat (sq ft / sq in), Presyo, Minimum`.
1. **Items / Materials**: ilista ang bawat material, unit (pc, sheet, sqft, ml...) at cost per unit.
2. **Products**: gumawa ng product, piliin ang mga materials at quantity, tapos ilagay ang waste %, labor, overhead % at markup %.
   - **Per piraso**: selling price = puhunan + markup %.
   - **Per sq ft** (hal. tarpaulin): ilagay ang presyo per sq ft (hal. ₱25). Sa "Compute ng order", ilagay ang lapad at haba (ft): 4 × 4 ft × ₱25 = ₱400. May **minimum na presyo kada piraso** (default ₱200): kapag mas mababa doon ang compute, ang minimum ang presyo (hal. 2 × 3 ft × ₱25 = ₱150 → ₱200). Pwedeng palitan ang presyo per sq ft doon para sa discount, hindi nababago ang naka-save na presyo. Ang materials, labor at overhead ay per 1 sq ft para makita ang puhunan at tubo.
3. Makikita agad ang breakdown, selling price, tubo at margin, pati total para sa isang order (ilang piraso).
4. **Settings**: presyo ng bawat category, at i-export/i-import ang data bilang JSON, i-export ang costing bilang CSV, o i-paste ang items mula sa Google Sheets/Excel.

Naka-save ang data sa browser na ginamit, kaya mag-export paminsan-minsan bilang backup.

## Formula

```
Materials   = Σ (qty × cost per unit)
Waste       = Materials × waste %
Overhead    = (Materials + Waste + Labor) × overhead %
Total cost  = Materials + Waste + Labor + Overhead
Selling     = Total cost × (1 + markup %)

Per sq ft:
Sq ft       = lapad (ft) × haba (ft)
Kada piraso = sq ft × presyo per sq ft (pero hindi bababa sa minimum, hal. ₱200)
Presyo      = kada piraso × ilang piraso
Puhunan     = sq ft × total cost per sq ft × ilang piraso
```

## Tests

```
node --test tests/costing.test.js
```
