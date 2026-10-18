# Udhëzuesi i operatorit — HumanPlus

Në versionin GitHub Pages, kliko **Hap dhe ruaj paketën .humanplus** dhe zgjidh paketën private të 18 tetorit 2026. Leximi bëhet në këtë pajisje; skedari nuk ngarkohet në GitHub. Këtë e bën vetëm një herë për këtë shfletues. Të 17 grupet e të dhënave dhe 218 dokumentet ruhen dhe hapen automatikisht pas rifreskimit, në një skedë të re dhe pas rihapjes së shfletuesit. Draftet dhe rezultatet e importuara mbeten gjithashtu në shfletues. Kopja e vjetër që mbahej vetëm në kujtesë duhet hapur një herë në versionin e ri. Në një pajisje të përbashkët përdor **Lidhjet e të dhënave → Fshi të dhënat lokale dhe mbyll** pasi të kesh eksportuar kopjet.

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
- Në GitHub Pages, importi i konfirmuar ruhet në këtë shfletues dhe zëvendëson grupin e mëparshëm. Eksporto kopjen e mëparshme nëse të duhet historiku. Rezultatet shfaqen kundrejt planit në të njëjtët muaj; muajt e munguar nuk bëhen zero. Shifrat mbeten deklarime të drejtimit pa auditim automatik.

## Eksplorimi i detajuar

- **Kërko kudo** (Ctrl/⌘ + K) kërkon në prokurim, njoftime mjekësore, produkte, barna, operatorë të licencuar, katalog, dokumente dhe punëdhënës. Kliko rezultatin për të hapur pamjen me kërkimin përkatës. Kërkimi përdor paketën private, jo internetin.
- **Filtrat e avancuar** lejojnë disa kategori, institucione, operatorë, burime, komuna dhe sinjale njëkohësisht. Brenda një dimensioni mjafton një përputhje; dimensionet kombinohen së bashku. Për sinjalet mund të kërkosh cilindo ose të gjitha. Intervalet e shumës përfshijnë vetëm EUR të dokumentuara. Numrat në listat e opsioneve i përkasin paketës së plotë.
- **Ruaj pamjen** ruan deri në 10 përzgjedhje me emër në këtë pajisje. Ngarkimi rikthen filtrat; nuk ndryshon burimin. Eksporti CSV përfshin të gjithë filtrimin, pavarësisht faqes së tabelës.
- Tabelat mbështesin renditje, 12/25/50/100 rreshta për faqe, kolona të zgjedhura dhe pamje kompakte. Vlerat e panjohura mbeten në fund të renditjes. Fshehja e kolonave nuk ndryshon eksportin e plotë.
- Në prokurim, zgjidh deri në 3 rekorde për **krahasim**. Krahasimi ruan përzgjedhjen edhe kur ndryshojnë filtrat. Monedha dhe baza e shumës shfaqen veç; shumat nuk përzihen.
- Detajet e rekordit kanë përmbledhje të lexueshme, të gjitha fushat dhe JSON burimor për shkarkim. Për katalogun, pamja **Kartat** shfaq përshkrimin, çmimin referencë dhe statusin e shqyrtimit; asnjë kartë nuk nënkupton miratim klinik ose disponueshmëri HumanPlus.
- Partnerët filtrohen edhe sipas kontaktit të publikuar; grafiku i qytetit dhe i specialitetit ngushton të njëjtën tabelë. Biblioteka filtrohet sipas formatit dhe pranisë së tekstit të nxjerrë.
- **Cilësia → Shqyrtimi lokal** ruan statusin, shënimin dhe kohën vetëm në këtë pajisje. “Shqyrtuar lokalisht” nuk heq sinjalet burimore dhe nuk jep miratim publikimi.

## Shtesa mjekësore dhe produktet

- **Sektori mjekësor:** filtro 117 njoftimet sipas blerësit, kategorisë, fazës, fushës dhe datave të publikimit. Tabelat e loteve, kërkesave, ndryshimeve dhe sasive ruajnë bazat e tyre të veçanta. Detajet lidhin evidencën sipas ID-së së procedurës/njoftimit. Vlerat e loteve nuk mblidhen si pagesa; statuset dhe afatet kërkojnë rikontroll.
- **Regjistri i barnave:** 4,631 regjistrime. Filtro statusin, prodhuesin, formën, ATC dhe mbajtësin e autorizimit. Active/Suspended/Withdrawn janë statuset e snapshot-it të lexuar më 18.10.2026, jo garanci aktuale.
- **Operatorët e licencuar:** 229 licenca/depo; jo kompani unike. Shiko numrin, vendin, skadimin e publikuar dhe datën e burimit. Nuk supozohet përfaqësim marke.
- **Markat dhe produktet:** 11 referenca të rakorduara nga skedarët e rinj. Marka/modeli në një tender mund të përshkruajë pajisjen ekzistuese ose një kërkesë. Vlera e prokurimit nuk është çmimi për njësi.
- **Gatishmëria për tender:** notat 0–5 dhe pesha e tyre prodhojnë një rezultat për shqyrtim. Të pesë kushtet duhen konfirmuar; e panjohura nuk kalon. Dosja ka 16 kontrolle me shënime lokale. Te kostot, kolaterali ndikon likuiditetin por nuk zbritet si kosto e pakthyeshme. Hyrjet bosh mbeten të panjohura.
- Eksporto pamjen për të marrë të gjithë popullatën e filtruar, pavarësisht faqes ose kolonave të dukshme. Eksporto draftin e tenderit për kopje rezervë. Burimet e reja nuk ndryshojnë miratimet klinike ose publikimin e katalogut.

## Hapja automatike

Te **Lidhjet e të dhënave → Ruajtja dhe kopja rezervë**, statusi **Hapje automatike aktive** konfirmon ruajtjen e plotë. Mund të shkarkosh paketën e ruajtur si kopje rezervë. Nëse ruajtja nuk lejohet ose mungon hapësira, paneli e shfaq gabimin; përdor **Riprovo ruajtjen automatike** pasi ta rregullosh. Pas pastrimit të të dhënave të shfletuesit ose në një pajisje tjetër, hape sërish paketën për konfigurimin fillestar.
