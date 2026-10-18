# Udhëzuesi i operatorit — HumanPlus

Hyr me llogarinë ChatGPT të autorizuar. Paneli dhe burimet janë private. Të dhënat janë nga paketa e 17 tetorit 2026.

1. **Përmbledhja:** zgjidh vitin e kërkimit. Rekordet e prokurimit dhe ndarjet buxhetore nuk janë të ardhura të HumanPlus.
2. **Harta e prokurimit:** përdor kërkimin, vitin, monedhën dhe filtrat shtesë. Grafiku, tabela dhe eksporti përdorin të njëjtën përzgjedhje. Hap ikonën e burimit për ID, shumën origjinale, lidhjen dhe korrigjimet. Kandidatët për dublikatë nuk hiqen.
3. **Buxhetet:** mbaj veç ndarjen fillestare, buxhetin përfundimtar, projektet dhe pagesat. Projektet kapitale përfshihen në totalet institucionale. Pesha e shëndetësisë llogaritet nga pagesat sipas funksionit në të njëjtin vit.
4. **Plani financiar:** plotëso shërbimet, personelin, shpenzimet fikse, arkën, pjesët e arkëtimit dhe pesë hyrjet e çdo muaji. Bosh do të thotë e panjohur. Për një linjë joaktive vendos 0 shprehimisht. Pjesët janë 0–1; arkëtimet duhet të japin shumën 1. Tetori përfshin 14/31 e muajit. Skenarët nuk janë rezultate reale.
5. **Ruaj draftin:** ruajtja është vetëm në këtë pajisje. Eksporto JSON për kopje ose shqyrtim. Rivendosja pastron draftin lokal; burimi mbetet i paprekur.
6. **Partnerët:** listat e punëdhënësve, institucioneve, mjekëve të përzgjedhur dhe regjistri OMK janë të ndara. Kontrollo datën dhe evidencën. Prania në listë nuk provon marrëveshje ose interes. Paneli nuk dërgon email dhe nuk ndryshon CRM.
7. **Katalogu:** BeoLab është referencë RSD. HumanPlus ka çmime dhe disponueshmëri të pakonfirmuara. Plotëso përmbajtjen origjinale, të drejtat e burimit dhe referencat e miratimit klinik e operacional në draftin e shqyrtimit. Ruajtja nuk publikon dhe nuk provon miratim.
8. **Plani dhe veprimet:** afatet janë propozime. Cakto përgjegjësin, datën dhe statusin vetëm me informacionin e drejtimit. Ndryshimet lokale nuk janë përfundime të verifikuara.
9. **Dokumentet:** kërko titull ose tekst. Shkarko origjinalin nga rreshti i tij. SOP-et janë drafte; kontrollo versionin dhe autorizimin përpara përdorimit.
10. **Cilësia:** shiko boshllëqet e 2026, monedhën e paverifikuar, lidhjet e paplota dhe klasifikimet që kërkojnë verifikim. Eksporti publik mbetet bosh.

## Hyrjet që duhen plotësuar

Shitjet dhe volumet reale; kostot për shërbim; pagat dhe overhead të rakorduara; gjendja e arkës dhe borxhet; ofertat e investimit; kushtet e arkëtimit; shërbimet, kapaciteti, licencat dhe afatet e konfirmuara; marrëveshjet aktive; miratimet klinike dhe të publikimit.

Për raporte të plota të filtrave përdor eksportin CSV. Printimi pasqyron faqen e tabelës që është hapur. Mos vendos paketa private, kontakte ose skedarë burimorë në repository publik.

## Grafikët, skenarët dhe lidhjet

- Viti i zgjedhur ndahet mes përmbledhjes, prokurimit dhe buxheteve. Kliko një kategori në përmbledhje për të hapur rekordet e saj. Kliko lidhjen institucion–operator për të filtruar të dy emrat; pastro etiketat e filtrave për t'u kthyer.
- Te **Plani financiar → Rezultatet**, krahaso skenarët Kujdesshëm, Bazë dhe Zgjerim. Rrëshqitësit provojnë ndryshime në vëllim, çmim dhe kosto fikse; nuk ruajnë ndryshime në draft. Klikimi i muajit lidh grafikun me muajin e urës së parasë. Ura përdor draftin pa rrëshqitësit provues.
- **Kontrollet e modelit** tregojnë hyrjet e munguara, marzhet negative dhe rënien nën rezervë. Janë llogaritje të deklaruara, jo këshilla të gjeneruara nga AI ose miratim profesional.
- Te **Lidhjet e të dhënave**, rifreskimi kontrollon disponueshmërinë e paketës. Nuk merr automatikisht të dhëna të reja nga interneti. Lidhjet Google Drive, Sheets dhe CRM nuk janë aktivizuar.
- Për rezultatet mujore, shkarko modelin bosh CSV, plotëso `month,revenue_eur,variable_cost_eur,fixed_cost_eur`, zgjidh skedarin dhe shqyrto tabelën para konfirmimit. Muaji ka formatin YYYY-MM; vlerat janë EUR me pikë dhjetore. Zero duhet shprehur vetëm kur është konfirmuar.
- Importi i konfirmuar ruhet në server për llogarinë tënde dhe zëvendëson grupin e mëparshëm. Eksporto kopjen e mëparshme nëse të duhet historiku. Rezultatet shfaqen kundrejt planit në të njëjtët muaj; muajt e munguar nuk bëhen zero. Shifrat mbeten deklarime të drejtimit pa auditim automatik.
