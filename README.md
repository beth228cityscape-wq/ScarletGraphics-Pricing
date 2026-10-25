# Scarlet Graphics - Price Calculator

Simpleng app para sa listahan ng items/materials at products, at para ma-compute ang costing at selling price.

## Paano gamitin

Buksan lang ang `index.html` sa browser (walang kailangang i-install). Pwede rin itong i-host sa GitHub Pages.

1. **Price Calculator**: pumili ng category (hal. **Tarpaulin** per sq ft, **Sticker** per sq inch), ilagay ang lapad, haba at ilang piraso. Halimbawa: sticker 2 × 2 in = 4 sq in × presyo per sq in. Pwedeng palitan ang presyo sa calculator mismo para sa discount. May minimum na presyo kada piraso (Tarpaulin: ₱200).
   **Sticker**: i-type ang lapad at haba (in); kusang hahanapin ang size sa listahan (hal. 2 × 3 in = ₱1.50/pc). Mula 1,000 pcs, bulk price ang presyo. Kapag kulang sa 1,000, bulk price + small-order fee na ₱500 na lumiliit habang dumarami (wala na sa 1,000 pcs), kaya hindi bababa sa ₱500 ang order at hindi kailanman mas mahal ang mas kaunti. Optional ang presyo per sq inch para sa isa o kaunting piraso; ginagamit lang ito kapag mas mura.
   **Sintra Board**: lapad × haba (in) × ₱1.80/sq in hanggang A2 (16.5 × 23.4 in), ₱1.50/sq in kapag mas malaki sa A2 pero hindi bababa sa presyo ng A2, at minimum ₱200 kada piraso.
   **Business Cards**: presyo kada 100 pcs, pumili ng variant: Single Face ₱350, Double Face ₱450, Laminated (Matte o Glossy) ₱650. Ilagay kung ilang set ng 100. Mapapalitan o madadagdagan ang variants sa Settings.
   May category din na **depende sa dami** ang presyo kada piraso:
   - **Pababa ang presyo** (hal. **Mug**): ₱150 sa 1 pc, bumababa nang pantay bawat dagdag na piraso hanggang ₱80 mula 24 pcs. Hindi kailanman mas mahal ang mas kaunting order kaysa mas marami.
   - **Tiers** (hal. 1-11 pcs ₱350, 12+ pcs ₱300). Nagbababala ang Settings kapag may tier na mas mahal ang total kaysa sa susunod.
   Sa **Settings → Presyo ng bawat category** papalitan ang presyo at minimum ng bawat category, at pwedeng magdagdag ng bagong category (per sq ft o per sq inch). Pwede ring mag-paste ng categories galing Excel/Google Sheets na may columns na `Category, Sukat (sq ft / sq in), Presyo, Minimum`.
1. **3D Printing**: presyo ng 3D print. Filament (gramo × presyo kada kg), kuryente (watts ÷ 1000 × oras × ₱/kWh), wear and tear ng printer (presyo ng printer ÷ lifespan na oras × oras ng print), labor (rate × oras), failure % ng subtotal, at markup % ng subtotal + failure. Pwedeng i-off ang printer, labor o business costs. May "Client view" na presyo lang ang makikita.
1. **Items / Materials**: ilista ang bawat material, unit (pc, sheet, sqft, ml...) at cost per unit. Kung naka-pack (hal. Quaff photo sticker sheet, ₱167 kada pack ng 50 sheets), ilagay ang presyo ng pack at ilan sa isang pack, at kusang lalabas ang cost kada pc (₱3.34 / pc). Laging per pc ang naka-pack. Kung naka-roll (hal. Olfa vinyl sticker roll, ₱3,600, 4.5 ft × 50 m), ilagay ang presyo at sukat ng roll, at kusang lalabas ang cost kada sq ft (₱4.88). Laging per sq ft ang roll. May optional na Supplier field din.
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
